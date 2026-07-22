// Layer system — GIMP/Photoshop-lite stacking for rulebook pages.
//
// Model (persisted in layout.json):
//   layout.layers : flat array of { id, scope, page, name, visible }
//     scope: 'global' (default) — renders on every page; page is null.
//     scope: 'page'   — renders only on its specific page.
//     order within this array = stacking order across the book; the
//     LAST entry paints on top (higher z-index).
//   each entry carries `layerId` pointing at a layer in the array.
//
// The DOM mirrors this: every page gets one `.layer-group` per layer
// that applies to it (global layers on every page, page layers only on
// theirs). Each group is position:absolute; inset:0 with its own
// z-index = layer order, and each card is appended into its layer's
// group. Because the group is a stacking context, cross-layer order
// is the group z-index while the per-entry `--z` still orders cards
// *within* a layer. A hidden layer sets the group's `hidden` attribute
// (display:none) so the whole layer vanishes but stays editable once
// re-shown.
//
// A layer panel (see css/layers.css) floats on the left edge in edit mode
// and lists the layers visible on the current page (globals + locals).
// The active layer (highlighted) is where newly placed entries land.

const Layers = (() => {
  'use strict';

  let panelEl, listEl, addBtn;
  let activeLayerId = null;
  let currentPage = 1;
  let dragLayerId = null;
  let dragFloating = null;
  let dragOffset = { x: 0, y: 0 };
  let dragTargetId = null;
  let dragTargetAfter = false;
  let scrollScheduled = false;

  function getLayout() { return Renderer.getLayout(); }
  function genId() { return 'layer-' + Math.random().toString(36).slice(2, 9); }

  // Per-layer edit-mode visibility (editHidden) is persisted in localStorage
  // keyed by layer id, so hidden layers stay hidden across refresh. The map
  // is pruned of ids that no longer exist whenever we read it back.
  const EDIT_HIDDEN_KEY = 'rulebook-layer-edit-hidden';
  function loadEditHidden() {
    try {
      const raw = localStorage.getItem(EDIT_HIDDEN_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
  function saveEditHidden(map) {
    try { localStorage.setItem(EDIT_HIDDEN_KEY, JSON.stringify(map)); } catch { /* ignore */ }
  }
  function readEditHidden(id) {
    const map = loadEditHidden();
    return map[id] === true;
  }
  function writeEditHidden(id, hidden) {
    const map = loadEditHidden();
    if (hidden) map[id] = true;
    else delete map[id];
    saveEditHidden(map);
  }

  // ── Migration (run on every layout load, display + edit) ──
  // Guarantees: layers is an array; every layer has id/scope/page/visible/name;
  // every entry has a layerId; global layers have page=null.
  function migrateLayout(layout) {
    if (!layout) return layout;
    if (!Array.isArray(layout.layers)) layout.layers = [];

    const seen = new Set();
    layout.layers.forEach((l, i) => {
      if (!l.id) l.id = genId();
      // Convert legacy per-page layers to global scope.
      if (!l.scope) l.scope = 'global';
      if (l.scope === 'global') l.page = null;
      if (typeof l.page !== 'number' && l.scope !== 'global') l.page = 1;
      if (typeof l.visible !== 'boolean') l.visible = true;
      if (!l.name) l.name = 'Layer ' + (i + 1);
      seen.add(l.id);
    });

    // Restore persisted edit-mode visibility (hidden layers) from
    // localStorage, keyed by stable layer id. Prune any ids that no longer
    // present so the stored map can't grow unbounded across rulebook edits.
    const editHiddenMap = loadEditHidden();
    const liveIds = new Set();
    layout.layers.forEach(l => {
      liveIds.add(l.id);
      if (editHiddenMap[l.id] === true) l.editHidden = true;
    });
    let changed = false;
    Object.keys(editHiddenMap).forEach(id => {
      if (!liveIds.has(id)) { delete editHiddenMap[id]; changed = true; }
    });
    if (changed) saveEditHidden(editHiddenMap);

    // Ensure a Base layer exists (global by default).
    if (!layout.layers.length) {
      const base = { id: genId(), scope: 'global', page: null, name: 'Base', visible: true };
      layout.layers.push(base);
    }

    // Assign any entry lacking a layerId to the topmost layer.
    const topLayer = layout.layers[layout.layers.length - 1];
    (layout.entries || []).forEach(e => {
      if (!e.layerId || !seen.has(e.layerId)) e.layerId = topLayer.id;
    });

    // Initialise the single active layer if not set.
    if (!activeLayerId) activeLayerId = topLayer.id;

    return layout;
  }

  function ensureMigrated(layout) {
    return migrateLayout(layout);
  }

  // Layers visible on a given page: all global layers + page-local layers
  // for that page, in stacking order (bottom first = array order).
  function layersForPage(page) {
    const layout = getLayout();
    return (layout.layers || []).filter(l =>
      l.scope === 'global' || l.page === page
    );
  }

  function getActiveLayerId() {
    if (activeLayerId) return activeLayerId;
    const layout = getLayout();
    const layers = (layout.layers || []);
    if (layers.length) return layers[layers.length - 1].id;
    return null;
  }

  function setActiveLayerId(id) { activeLayerId = id; }

  // Mark the active layer's .layer-group element with the .active-layer
  // class so CSS can style entries on non-active layers differently.
  function updateActiveLayerGroups() {
    document.querySelectorAll('.layer-group').forEach(g => {
      const lid = g.dataset.layerId;
      if (!lid) return;
      g.classList.toggle('active-layer', lid === getActiveLayerId());
    });
  }

  // Select the layer that owns a given entry, updating the active layer
  // and re-rendering the panel. Used when an entry card is clicked in
  // edit mode so the panel reflects what you're looking at.
  function selectLayerForEntry(entryId) {
    const layout = getLayout();
    if (!layout || !entryId) return;
    const entry = (layout.entries || []).find(e => e.id === entryId);
    if (!entry || !entry.layerId) return;
    activeLayerId = entry.layerId;
    renderForPage(currentPage);
  }

  function isLayerHidden(layerId) {
    const l = (getLayout().layers || []).find(x => x.id === layerId);
    return !!(l && l.visible === false);
  }

  // ── Current page (nearest page centre to the viewport centre) ──
  // The appendix page is ignored — it isn't a layer-able content page, so
  // the panel always tracks the nearest real content page.
  function computeCurrentPage() {
    const main = document.getElementById('main-content');
    if (!main) return 1;
    const center = main.scrollTop + main.clientHeight / 2;
    let best = 1, bestDist = Infinity, found = false;
    document.querySelectorAll('.pages .page').forEach(p => {
      if (p.classList.contains('appendix-page')) return;
      found = true;
      const c = p.offsetTop + p.offsetHeight / 2;
      const d = Math.abs(c - center);
      if (d < bestDist) { bestDist = d; best = Number(p.dataset.page) || 1; }
    });
    return found ? best : 1;
  }

  // Total *content* pages (excludes the appendix), for the page badge.
  function contentPageCount() {
    const layout = getLayout();
    let max = 0;
    (layout.entries || []).forEach(e => {
      if (typeof e.page === 'number') max = Math.max(max, e.page);
    });
    if (max > 0) return max;
    return PageNumbers && PageNumbers.getTotalPages ? PageNumbers.getTotalPages() : 1;
  }

  function currentPageNum() { return currentPage; }

  // ── Operations ──
  function addLayer() {
    const layout = getLayout();
    if (!layout) return;
    layout.layers = layout.layers || [];
    const id = genId();
    layout.layers.push({ id, scope: 'global', page: null, name: 'Layer ' + (layout.layers.length + 1), visible: true });
    activeLayerId = id;
    EditMode.setDirty();
    History.commit('add layer');
    relayout();
  }

  function deleteLayer(id, x, y) {
    const layout = getLayout();
    if (!layout) return;
    const layer = (layout.layers || []).find(l => l.id === id);
    if (!layer) return;
    Popup.confirm({
      message: 'Delete layer "' + (layer.name || id) + '"? All entries on it will be removed.',
      x: x || 0,
      y: y || 0,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmClass: 'popup-danger'
    }).then(confirmed => {
      if (!confirmed) return;
      doDeleteLayer(id);
    });
  }

  function doDeleteLayer(id) {
    const layout = getLayout();
    if (!layout) return;
    const layer = (layout.layers || []).find(l => l.id === id);
    if (!layer) return;
    if (activeLayerId === id) {
      const remaining = (layout.layers || []).filter(l => l.id !== id);
      activeLayerId = remaining.length ? remaining[remaining.length - 1].id : null;
    }
    layout.layers = (layout.layers || []).filter(l => l.id !== id);
    layout.entries = (layout.entries || []).filter(e => e.layerId !== id);
    EditMode.setDirty();
    History.commit('delete layer');
    relayout();
  }

  function toggleVisible(id) {
    const layer = (getLayout().layers || []).find(l => l.id === id);
    if (!layer) return;
    layer.visible = layer.visible === false ? true : false;
    EditMode.setDirty();
    History.commit('toggle layer visibility');
    relayout();
  }

  function renameLayer(id, name) {
    const layer = (getLayout().layers || []).find(l => l.id === id);
    if (!layer) return;
    layer.name = name;
    EditMode.setDirty();
    // Label only — no DOM re-layout needed, but refresh the page badge.
  }

  // NOTE: renameLayer does NOT commit here — the per-keystroke `input` handler
  // is suppressed from committing; the `change` event handler (below) commits
  // 'rename layer' once on blur/enter.

  // The panel shows layers REVERSED (top = highest z = last in the array).
  // Dragging happens in that visual space, so reordering must translate a
  // visual drop into the raw array order.
  function applyVisualOrder(visualTopFirst) {
    const layout = getLayout();
    if (!layout || !layout.layers) return;
    const arr = layout.layers;
    const byId = new Map(arr.map(l => [l.id, l]));
    const reordered = visualTopFirst.slice().reverse()
      .map(id => byId.get(id)).filter(Boolean);
    // Preserve any layers that weren't in the visual list (shouldn't
    // happen, but defensive).
    const reorderedIds = new Set(reordered.map(l => l.id));
    const leftovers = arr.filter(l => !reorderedIds.has(l.id));
    layout.layers = [...reordered, ...leftovers];
  }

  // Reorder by moving the dragged layer to the visual slot adjacent to the
  // target (before = top half, after = bottom half of the target row).
  function reorderVisual(srcId, targetId, after) {
    const layout = getLayout();
    const layers = layersForPage(currentPage);
    const visual = layers.slice().reverse().map(l => l.id); // top-first
    const srcVi = visual.indexOf(srcId);
    const tgtVi = visual.indexOf(targetId);
    if (srcVi === -1 || tgtVi === -1) return;
    visual.splice(srcVi, 1);
    const at = tgtVi + (after ? 1 : 0);
    visual.splice(at, 0, srcId);
    applyVisualOrder(visual);
  }

  function reorderLayer(srcId, targetId, after) {
    reorderVisual(srcId, targetId, after);
    EditMode.setDirty();
    History.commit('reorder layer');
    relayout();
  }

  function clearDragMarkers() {
    if (!listEl) return;
    listEl.querySelectorAll('.layer-row').forEach(r =>
      r.classList.remove('dragging', 'drop-before', 'drop-after'));
  }

  // ── Custom pointer-based drag ──────────────────────────────────────
  // A floating clone of the dragged row follows the cursor (tilted upward
  // via CSS), while the source row stays as a faded placeholder. We live-
  // reorder on mousemove: whenever the cursor crosses another row's midpoint
  // the dragged layer is spliced to that position and the panel + z-order
  // update immediately, so the layers shuffle as you drag.
  function startDrag(srcRow, id, e) {
    if (dragFloating) return;
    dragLayerId = id;
    const rect = srcRow.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;

    const floating = srcRow.cloneNode(true);
    floating.classList.add('layer-floating');
    floating.style.width = rect.width + 'px';
    floating.style.height = rect.height + 'px';
    floating.style.left = rect.left + 'px';
    floating.style.top = rect.top + 'px';
    document.body.appendChild(floating);
    dragFloating = floating;

    srcRow.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    function onMove(ev) {
      floating.style.left = (ev.clientX - dragOffset.x) + 'px';
      floating.style.top = (ev.clientY - dragOffset.y) + 'px';
      const target = rowUnderPoint(ev.clientY);
      if (target && target._layerId !== id) {
        const trect = target.getBoundingClientRect();
        const after = (ev.clientY - trect.top) > trect.height / 2;
        reorderLayerLive(id, target._layerId, after);
      }
    }

    function onUp(ev) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (dragFloating && dragFloating.parentNode) dragFloating.parentNode.removeChild(dragFloating);
      dragFloating = null;
      dragLayerId = null;
      clearDragMarkers();
      EditMode.setDirty();
      if (typeof History !== 'undefined' && History.commit) History.commit('reorder layer');
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Live reorder used during drag: mutates layout order and re-renders the
  // panel + z-order immediately, but defers the dirty-flag/save until drop.
  function reorderLayerLive(srcId, targetId, after) {
    reorderVisual(srcId, targetId, after);
    // A reorder only changes layer stacking — cards don't move or resize and
    // pagination is unaffected. Update the existing groups in place and
    // re-sync the floating UI (handles / actions / overflow frames) so they
    // track the cards without the full repack() teardown, which is what made
    // the overflow frame flicker on every drag tick.
    if (typeof EditMode !== 'undefined' && EditMode.isActive()) {
      if (typeof StructureUI !== 'undefined' && StructureUI.syncLayerStacking) {
        StructureUI.syncLayerStacking();
      }
      if (typeof StructureUI !== 'undefined' && StructureUI.syncAllFixedUI) {
        StructureUI.syncAllFixedUI();
      }
    } else if (typeof PageNumbers !== 'undefined') {
      PageNumbers.paginate();
    }
    if (typeof Layers !== 'undefined' && Layers.updateActiveLayerGroups) {
      Layers.updateActiveLayerGroups();
    }
    renderForPage(currentPage);
  }

  function rowUnderPoint(y) {
    if (!listEl) return null;
    const rows = Array.from(listEl.querySelectorAll('.layer-row'));
    for (const r of rows) {
      const rect = r.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) return r;
    }
    return null;
  }

  function clearDropMarkers() {
    if (!listEl) return;
    listEl.querySelectorAll('.layer-row').forEach(r =>
      r.classList.remove('drop-before', 'drop-after'));
  }

  // Re-flow the page stack so the new grouping/order/visibility applies,
  // then re-render the panel. In edit mode we use StructureUI.repack() so
  // card affordances and overflow marks are rebuilt too.
  function relayout() {
    if (typeof EditMode !== 'undefined' && EditMode.isActive()) {
      if (typeof StructureUI !== 'undefined' && StructureUI.repack) {
        try { StructureUI.repack(); }
        catch (err) { console.error('[Layers] repack failed:', err); }
      } else if (typeof PageNumbers !== 'undefined') {
        PageNumbers.paginate();
      }
    } else if (typeof PageNumbers !== 'undefined') {
      PageNumbers.paginate();
    }
    renderForPage(currentPage);
  }

  // ── Rendering the panel ──
  function faIcon(name) {
    const i = document.createElement('i');
    i.className = 'fa-solid fa-' + name;
    return i;
  }
  function eyeIcon(open) {
    return faIcon(open ? 'eye' : 'eye-slash');
  }
  function gripIcon() {
    return faIcon('grip-vertical');
  }

  function renderForPage(page) {
    currentPage = page;
    if (!listEl) return;

    const layers = layersForPage(page);
    listEl.innerHTML = '';

    if (!layers.length) {
      const empty = document.createElement('div');
      empty.className = 'layer-empty';
      empty.textContent = 'No layers.';
      listEl.appendChild(empty);
      return;
    }

    // Top of the list = highest z (last in stacking order).
    const ordered = layers.slice().reverse();
    const activeId = getActiveLayerId();

    ordered.forEach(layer => {
      const row = document.createElement('div');
      row.className = 'layer-row';
      if (layer.id === activeId) row.classList.add('active');
      if (layer.visible === false) row.classList.add('hidden-layer');
      if (layer.id === dragLayerId) row.classList.add('dragging');
      row.dataset.layerId = layer.id;

      // Drag handle (front) — initiates a custom pointer-drag reorder.
      const grip = document.createElement('button');
      grip.className = 'layer-grip';
      grip.appendChild(gripIcon());
      grip.addEventListener('mousedown', (e) => {
        // Left button only — right-click is reserved for the context menu.
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        startDrag(row, layer.id, e);
      });
      row.appendChild(grip);

      // Visibility toggle.
      const vis = document.createElement('button');
      vis.className = 'layer-vis';
      vis.appendChild(eyeIcon(layer.visible !== false));
      vis.setAttribute('data-tooltip', layer.visible === false ? 'Show layer' : 'Hide layer');
      vis.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleVisible(layer.id);
      });
      row.appendChild(vis);

      // Name (editable inline; single-click selects, double-click renames).
      const name = document.createElement('input');
      name.className = 'layer-name';
      name.type = 'text';
      name.value = layer.name;
      name.setAttribute('readonly', '');
      name.tabIndex = -1;
      name.addEventListener('mousedown', (e) => {
        // Prevent the input from focusing on a plain press; selection is
        // handled on click and editing only begins on double-click.
        if (name.hasAttribute('readonly')) e.preventDefault();
        e.stopPropagation();
      });
      name.addEventListener('click', (e) => {
        // While editing (not readonly) let the input behave normally — don't
        // blur or re-select. Only the read-only (label) state selects active.
        if (!name.hasAttribute('readonly')) { e.stopPropagation(); return; }
        e.stopPropagation();
        name.blur();
        activeLayerId = layer.id;
        if (listEl) {
          listEl.querySelectorAll('.layer-row').forEach(r => {
            r.classList.toggle('active', r._layerId === layer.id);
          });
        }
        updateActiveLayerGroups();
      });
      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        name.removeAttribute('readonly');
        name.tabIndex = 0;
        name.focus();
      });
      name.addEventListener('input', () => renameLayer(layer.id, name.value));
      name.addEventListener('change', () => {
        renameLayer(layer.id, name.value);
        if (typeof History !== 'undefined' && History.commit) History.commit('rename layer');
        renderForPage(currentPage);
      });
      name.addEventListener('blur', () => {
        name.setAttribute('readonly', '');
        name.tabIndex = -1;
      });
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
      row.appendChild(name);

      // Operations.
      const ops = document.createElement('div');
      ops.className = 'layer-ops';

      // Edit-mode visibility checkbox: checked = entries shown in edit mode,
      // unchecked = hidden in edit mode only (display view always shows them).
      const visChk = document.createElement('input');
      visChk.type = 'checkbox';
      visChk.className = 'layer-vis-chk';
      visChk.checked = layer.editHidden !== true;
        visChk.setAttribute('data-tooltip', 'Visible in edit mode');
      visChk.addEventListener('click', (e) => e.stopPropagation());
      visChk.addEventListener('change', () => {
        layer.editHidden = !visChk.checked;
      visChk.setAttribute('data-tooltip', 'Visible in edit mode');
        writeEditHidden(layer.id, layer.editHidden === true);
        // Persist immediately to the server (independent of the save-dirty
        // flag) since edit-visibility isn't part of the read/print layout and
        // shouldn't require an explicit Save Layout.
        API.saveLayout(getLayout()).catch(err => {
          console.error('[Layers] failed to persist edit-hidden:', err);
        });
        relayout();
      });
      ops.appendChild(visChk);

      row.appendChild(ops);

      // Drop target for the custom pointer-drag reordering. The floating
      // clone ignores pointer events, so we detect the target on mousemove
      // in startDrag() by hit-testing against each row's rect.
      row._layerId = layer.id;

      // Right-click opens a context menu (Rename / Delete). Delete moves
      // here from the old trash button.
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openLayerMenu(e.clientX, e.clientY, layer, name);
      });

      listEl.appendChild(row);
    });

    updateActiveLayerGroups();
  }

  // ── Layer context menu ──────────────────────────────────────────────
  let menuEl = null;
  function closeLayerMenu() {
    if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
    menuEl = null;
    document.removeEventListener('click', onMenuOutside, true);
    document.removeEventListener('keydown', onMenuKey, true);
  }
  function onMenuOutside(e) { if (menuEl && !menuEl.contains(e.target)) closeLayerMenu(); }
  function onMenuKey(e) { if (e.key === 'Escape') closeLayerMenu(); }

  function openLayerMenu(x, y, layer, nameInput) {
    closeLayerMenu();
    const menu = document.createElement('div');
    menu.className = 'layer-menu';
    const items = [
      { label: 'Rename', icon: 'fa-pen-to-square', action: () => {
        nameInput.removeAttribute('readonly');
        nameInput.tabIndex = 0;
        nameInput.focus();
        nameInput.select();
      } },
      { label: 'Delete', icon: 'fa-trash', danger: true, action: () => deleteLayer(layer.id, x, y) }
    ];
    items.forEach(it => {
      const item = document.createElement('button');
      item.className = 'layer-menu-item' + (it.danger ? ' layer-menu-item--danger' : '');
      const icon = document.createElement('i');
      icon.className = 'fa-solid ' + it.icon;
      icon.setAttribute('aria-hidden', 'true');
      item.appendChild(icon);
      item.appendChild(document.createTextNode(it.label));
      item.addEventListener('click', () => { closeLayerMenu(); it.action(); });
      menu.appendChild(item);
    });
    document.body.appendChild(menu);
    menuEl = menu;

    // Position within viewport.
    const gap = 4;
    const w = menu.offsetWidth, h = menu.offsetHeight;
    let left = Math.min(x, window.innerWidth - w - gap);
    let top = Math.min(y, window.innerHeight - h - gap);
    menu.style.left = Math.max(gap, left) + 'px';
    menu.style.top = Math.max(gap, top) + 'px';

    setTimeout(() => {
      document.addEventListener('click', onMenuOutside, true);
      document.addEventListener('keydown', onMenuKey, true);
    }, 0);
  }

  function onScroll() {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(() => {
      scrollScheduled = false;
      const p = computeCurrentPage();
      if (p !== currentPage) renderForPage(p);
    });
  }

  function setup() {
    panelEl = document.getElementById('layer-panel');
    listEl = document.getElementById('layer-list');
    addBtn = document.getElementById('layer-add-btn');

    if (!panelEl || !listEl || !addBtn) return;

    addBtn.addEventListener('click', () => addLayer());

    // Bottom tabs switch the sidebar between Navigation and Layers.
    const sidebar = document.getElementById('sidebar');
    const tabs = document.querySelectorAll('.sidebar-tab');
    tabs.forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));

    const main = document.getElementById('main-content');
    if (main) main.addEventListener('scroll', onScroll, { passive: true });

    // Initial paint for whatever page is in view.
    renderForPage(computeCurrentPage());
  }

  // Switch the active sidebar tab. The Layers tab is only allowed in edit
  // mode (the CSS also hides it otherwise); switching to it refreshes the
  // layer list for the current page.
  function setTab(name) {
    if (name === 'layers' && !(document.body.classList.contains('edit-mode'))) return;
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.dataset.tab = name;
    document.querySelectorAll('.sidebar-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === name);
    });
    if (name === 'layers') renderForPage(computeCurrentPage());
  }

  // Re-sync the panel after the layout changed underneath us (discard,
  // save, rebuild). Safe to call any time.
  function sync() { renderForPage(computeCurrentPage()); }

  return {
    setup,
    sync,
    setTab,
    migrateLayout,
    ensureMigrated,
    currentPageNum,
    getActiveLayerId,
    setActiveLayerId,
    selectLayerForEntry,
    isLayerHidden,
    addLayer,
    deleteLayer,
    toggleVisible,
    renameLayer,
    reorderLayer,
    renderForPage,
    computeCurrentPage,
    updateActiveLayerGroups
  };
})();
