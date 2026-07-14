const StructureUI = (() => {
  'use strict';

  let drag = null;

  // Active resize operation (mirrors `drag`): which edges are being pulled
  // and the card's starting pixel rect. null when not resizing.
  let resize = null;

  // Inline edits are buffered here (id -> current HTML) and only committed
  // to the server on an explicit Save (Save & Exit / Save Layout). Cancel
  // discards them by reloading from the server, so edits are always
  // undoable. Matches the layout's save/cancel semantics.
  const pendingEdits = new Map();
  // Snapshot of each card's HTML when editing starts, so a no-op
  // (edit toggled on/off without changes) doesn't mark the doc dirty.
  const editOriginals = new Map();

  // ── Enable / Disable ──────────────────────
  function enable() {
    disable();
    document.querySelectorAll('.pages .grid-card').forEach(card => {
      if (!card.dataset.itemType) return;
      addCardControls(card);
    });
    addGlobalAddChapter();
    bindDragGlobal();
  }

  function disable() {
    document.removeEventListener('mousedown', onCardMouseDown, true);
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    drag = null;
    _dragListenerBound = false;
    document.querySelectorAll('.struct-btn').forEach(b => b.remove());
    document.querySelectorAll('.entry-actions').forEach(b => b.remove());
    document.querySelectorAll('.entry-edge-actions').forEach(b => b.remove());
    document.querySelectorAll('.entry-add-actions').forEach(n => n.remove());
    document.querySelectorAll('.resize-handle').forEach(n => n.remove());
    document.querySelectorAll('.struct-add-chapter').forEach(n => n.remove());
  }

  // Sync stored card positions from the DOM back into the layout model.
  // Used by EditMode.saveAll(): iterates .pages .grid-card and writes
  // page/col/row/w/h into its item.
  function syncLayoutFromDOM() {
    const layout = Renderer.getLayout();
    if (!layout) return;
    document.querySelectorAll('.pages .grid-card').forEach(el => {
      const type = el.dataset.itemType;
      const id = el.dataset.itemId;
      if (!type || !id) return;
      const pageEl = el.closest('.page');
      const page = Number(pageEl?.dataset.page);
      const col = Number(el.dataset.gridCol);
      const row = Number(el.dataset.gridRow);
      const w = Number(el.dataset.gridW);
      const h = Number(el.dataset.gridH);
      const item = Grid.findItem(layout, type, id);
      if (!item) return;
      item.page = page;
      item.col = col;
      item.row = row;
      item.w = w;
      item.h = h;
    });
  }

  function syncLayoutFromCard(el) {
    const layout = Renderer.getLayout();
    if (!layout) return;
    const type = el.dataset.itemType;
    const id = el.dataset.itemId;
    if (!type || !id) return;
    const pageEl = el.closest('.page');
    const page = Number(pageEl?.dataset.page);
    const col = Number(el.dataset.gridCol);
    const row = Number(el.dataset.gridRow);
    const w = Number(el.dataset.gridW);
    const h = Number(el.dataset.gridH);
    const item = Grid.findItem(layout, type, id);
    if (!item) return;
    item.page = page;
    item.col = col;
    item.row = row;
    item.w = w;
    item.h = h;
  }

  // Rebuild the page stack and re-attach affordances. Called after any
  // structural mutation. Re-fetches entries from the server so newly
  // created entries have content to load.
  function rebuild() {
    Renderer.renderChapters();
    Renderer.loadAllEntries().then(() => {
      PageNumbers.paginate();
      enable();
      Renderer.renderTOC();
    });
  }

  // Re-pack without a network round trip: cache current entry content,
  // rebuild the flat DOM, restore cached content, then lay out again.
  // Used after drag-end / save so cards keep their loaded HTML.
  function repack() {
    const cache = new Map();
    document.querySelectorAll('.pages .entry[data-entry-id]').forEach(el => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('.entry-actions, .entry-edge-actions, .entry-add-actions, .struct-btn, .resize-handle').forEach(n => n.remove());
      cache.set(el.dataset.entryId, clone.innerHTML);
    });

    Renderer.renderChapters();

    cache.forEach((html, id) => {
      const el = document.getElementById('entry-' + id);
      if (!el) return;
      el.innerHTML = html;
      el.classList.remove('loading');
      el.dataset.loaded = 'true';
    });

    PageNumbers.paginate();
    enable();
    Renderer.renderTOC();
  }

  // ── Card Controls ─────────────────────────
  // The Kind▾ + TOC-title bar floats above the card (left-aligned, title
  // fills the remaining width). Edit / Delete instead run DOWN the left
  // edge of the entry as a vertical icon stack (Edit on top).
  function addCardControls(card) {
    const type = card.dataset.itemType;
    const existing = card.querySelector('.entry-actions');
    if (existing) return;

    // Top bar: [Kind▾] [Title — full width]. Kind + Title sit on the left,
    // the title input grows to fill the rest of the entry width.
    const actions = document.createElement('div');
    actions.className = 'entry-actions';
    actions.style.cssText = 'display:flex;gap:0.25rem;align-items:center;';

    // Left group holds the kind select + TOC-title input.
    const leftGroup = document.createElement('div');
    leftGroup.className = 'entry-actions-left';
    leftGroup.style.cssText = 'display:flex;gap:0.25rem;align-items:center;flex:1;';

    // Kind + TOC-title controls for every card. `kind` is just a property
    // on the entry (chapter / section / header / subheader / entry) that
    // drives TOC nesting — there is no parent/child relationship.
    {
      const id = card.dataset.itemId;
      const item = Grid.findItem(Renderer.getLayout(), type, id) || {};
      const kind = card.dataset.kind || item.kind || 'entry';

      const kindSelect = document.createElement('select');
      kindSelect.className = 'struct-kind-select';
      kindSelect.title = 'Item kind (drives TOC nesting)';
      ['chapter', 'section', 'header', 'subheader', 'entry'].forEach(k => {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = k.charAt(0).toUpperCase() + k.slice(1);
        if (kind === k) opt.selected = true;
        kindSelect.appendChild(opt);
      });
      kindSelect.addEventListener('mousedown', (e) => e.stopPropagation());
      kindSelect.addEventListener('click', (e) => e.stopPropagation());
      kindSelect.addEventListener('change', (e) => {
        e.stopPropagation();
        changeKind(card, kindSelect.value);
      });
      leftGroup.appendChild(kindSelect);

      // Only TOC-linked kinds have a title — it is the TOC label. A plain
      // `entry` never links back to the contents, so it gets no title input.
      if (kind !== 'entry') {
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'struct-title-input';
        titleInput.value = item.sidebarTitle || item.title || id.replace(/-/g, ' ');
        titleInput.title = 'TOC title';
        titleInput.placeholder = 'TOC title';
        titleInput.style.flex = '1';
        titleInput.addEventListener('mousedown', (e) => e.stopPropagation());
        titleInput.addEventListener('click', (e) => e.stopPropagation());
        titleInput.addEventListener('input', (e) => {
          e.stopPropagation();
          item.sidebarTitle = titleInput.value.trim();
          EditMode.setDirty();
        });
        titleInput.addEventListener('change', () => {
          Renderer.renderTOC();
        });
        titleInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') titleInput.blur();
        });
        leftGroup.appendChild(titleInput);
      }
    }

    actions.appendChild(leftGroup);
    card.appendChild(actions);

    // Vertical stack of action buttons running DOWN the left edge of the
    // entry (Edit on top, Delete below). Lives outside the title bar so it
    // can be positioned independently of the top controls.
    const edgeActions = document.createElement('div');
    edgeActions.className = 'entry-edge-actions';

    const editBtn = makeBtn(pencilIcon(), 'Edit');
    // Edit toggles INLINE contenteditable editing on the card itself —
    // the entry keeps its HTML, you just edit it in place (no input, no
    // textarea, no modal). Chapters are no different from any other entry.
    editBtn.title = 'Edit content inline';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleInlineEdit(card, editBtn);
    });
    edgeActions.appendChild(editBtn);

    const delBtn = makeBtn(trashIcon(), 'Delete', true);
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCard(card, e);
    });
    edgeActions.appendChild(delBtn);

    card.appendChild(edgeActions);

    // Resize handles (8): 4 edges + 4 corners. Only used in edit mode and
    // hidden while a card is being edited inline (the CSS hides them). Each
    // handle reports which edge(s) it controls via data-edge.
    ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach(edge => {
      const h = document.createElement('div');
      h.className = 'resize-handle ' + edge;
      h.dataset.edge = edge;
      h.addEventListener('mousedown', onResizeDown);
      card.appendChild(h);
    });
  }

  // ── Inline (contenteditable) editing ──────────
  // A chapter is just an entry; every card renders its own HTML, so the
  // only edit that makes sense is editing that HTML in place. We toggle
  // contenteditable on the card and keep the floating controls row
  // non-editable so the Edit/Delete buttons and Kind/Title inputs still
  // work. On exit we buffer the edited HTML; it is only written to the
  // server when the user explicitly Saves — Cancel discards it.
  function toggleInlineEdit(card, btn) {
    const eid = card.dataset.entryId;
    if (!eid) return;

    const actions = card.querySelector('.entry-actions');
    const editing = card.getAttribute('contenteditable') === 'true';

    if (editing) {
      card.removeAttribute('contenteditable');
      card.classList.remove('editing');
      if (actions) actions.setAttribute('contenteditable', 'false');
      if (btn) btn.classList.remove('active');
      bufferInlineEdit(card, eid);
    } else {
      card.setAttribute('contenteditable', 'true');
      card.classList.add('editing');
      if (actions) actions.setAttribute('contenteditable', 'false');
      if (btn) btn.classList.add('active');
      // Snapshot current content to detect real changes on exit.
      const snap = card.cloneNode(true);
      const sa = snap.querySelector('.entry-actions');
      if (sa) sa.remove();
      snap.querySelectorAll('.resize-handle').forEach(n => n.remove());
      editOriginals.set(eid, snap.innerHTML.trim());
      card.focus();
      card.addEventListener('blur', onInlineBlur, true);
    }
  }

  // Auto-buffer when focus leaves the card while editing (e.g. clicking
  // elsewhere). Ignore blurs that land inside the card (its own controls).
  let _inlineBlurTimer = null;
  function onInlineBlur(e) {
    const card = e.currentTarget;
    if (!card || card.getAttribute('contenteditable') !== 'true') return;
    if (card.contains(document.activeElement)) return;
    if (_inlineBlurTimer) clearTimeout(_inlineBlurTimer);
    _inlineBlurTimer = setTimeout(() => {
      if (card.getAttribute('contenteditable') !== 'true') return;
      if (card.contains(document.activeElement)) return;
      toggleInlineEdit(card, card.querySelector('.entry-actions .icon-btn'));
    }, 150);
  }

  // Capture the edited HTML (minus the floating controls row) into the
  // pending-edits buffer. Nothing is sent to the server yet — Save commits
  // it, Cancel drops it. We still refresh the in-memory search index so the
  // sidebar stays accurate while editing.
  function bufferInlineEdit(card, eid) {
    card.removeEventListener('blur', onInlineBlur, true);
    const clone = card.cloneNode(true);
    const a = clone.querySelector('.entry-actions');
    if (a) a.remove();
    clone.querySelectorAll('.resize-handle').forEach(n => n.remove());
    const html = clone.innerHTML.trim();
    const original = editOriginals.get(eid);
    editOriginals.delete(eid);
    // No change → drop any prior pending edit for this entry, stay clean.
    if (html === original) {
      pendingEdits.delete(eid);
      return;
    }
    pendingEdits.set(eid, html);
    EditMode.setDirty();
    reindexEntry(eid, html);
  }

  // Commit all buffered inline edits to the server. Called by Save & Exit /
  // Save Layout before the view is rebuilt from the (now-updated) files.
  async function flushPendingEdits() {
    for (const [id, html] of pendingEdits) {
      try {
        await API.saveEntry(id, html);
      } catch (err) {
        console.warn('flushPendingEdits: failed to save ' + id, err);
      }
    }
    pendingEdits.clear();
  }

  // Drop buffered edits without writing them (used by Cancel).
  function clearPendingEdits() {
    pendingEdits.clear();
    editOriginals.clear();
  }

  // Keep the sidebar search index in sync with the edited HTML without a
  // full reload — mirrors what ContentEditor.save() does per entry.
  function reindexEntry(eid, html) {
    const idx = Renderer.getSearchIndex();
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const text = temp.textContent || '';
    const heading = temp.querySelector('h2');
    const data = {
      id: eid,
      title: heading ? heading.textContent : eid.replace(/-/g, ' '),
      text,
      chapter: Renderer.findChapterForEntry(eid)
    };
    const existing = idx.find(en => en.id === eid);
    if (existing) Object.assign(existing, data);
    else idx.push(data);
  }

  // ── Global + Add Chapter (appended below the page stack) ──
  function addGlobalAddChapter() {
    const pages = document.querySelector('.pages');
    if (!pages) return;
    if (pages.querySelector(':scope > .struct-add-chapter')) return;
    const div = document.createElement('div');
    div.className = 'struct-add-chapter';
    div.style.cssText = 'width:var(--page-w);text-align:center;padding:0.75rem 0;margin:0 auto;';
    const btn = document.createElement('button');
    btn.className = 'struct-btn';
    btn.style.cssText = 'padding:0.4rem 1rem;font-size:0.85rem;';
    btn.textContent = '+ Add Chapter';
    btn.addEventListener('click', addChapter);
    div.appendChild(btn);
    pages.appendChild(div);
  }

  // ── Change entry kind ────────────────────
  // Sets item.kind (entry / section / header / subheader) — purely a
  // layout.json property that drives TOC nesting. It never touches the
  // entry's HTML content. We only ensure an HTML file exists so the card
  // always has something to display.
  async function changeKind(card, newKind) {
    const id = card.dataset.itemId;
    const layout = Renderer.getLayout();
    const item = Grid.findItem(layout, 'entry', id);
    if (!item) return;
    if (item.kind === newKind) return;
    item.kind = newKind;
    EditMode.setDirty();

    // Make sure an HTML file exists (create-if-missing). Existing content
    // is preserved — createEntry 409s when the file is already there.
    try {
      await API.createEntry(id, item.sidebarTitle || id);
    } catch (err) {
      if (!err.message.includes('409')) {
        console.warn('changeKind: could not ensure entry HTML file', err);
      }
    }

    rebuild();
  }

  // ── Deletes ──────────────────────────────
  // Deletion is isolated: removing one item never touches any other
  // entry. There is no parent/child cascade to ripple through.
  async function deleteCard(card, e) {
    const id = card.dataset.itemId;
    const layout = Renderer.getLayout();
    if (!layout) return;
    const entries = layout.entries || [];
    const item = entries.find(en => en.id === id);
    if (!item) return;

    // Every kind is a real entry with its own HTML file, so deleting one
    // item removes that item and its file only — never any other entry.
    const confirmed = await Popup.confirm({
      message: item.kind === 'chapter'
        ? 'Delete chapter "' + (item.sidebarTitle || item.title || id) + '"?'
        : 'Delete this entry permanently?',
      x: e.clientX,
      y: e.clientY,
      confirmText: 'Delete',
      confirmClass: 'popup-danger'
    });
    if (!confirmed) return;

    layout.entries = entries.filter(en => en.id !== id);
    API.deleteEntry(id).catch(() => {});

    Renderer.renderTOC();
    EditMode.setDirty();
    rebuild();
  }

  // ── Add Operations ─────────────────────────
  // A chapter is just an entry of kind 'chapter' — give it an HTML file
  // so it renders its own content like every other entry.
  async function addChapter() {
    const layout = Renderer.getLayout();
    layout.entries = layout.entries || [];
    const id = 'chapter-' + Date.now();

    const lastItem = layout.entries[layout.entries.length - 1];
    const startPage = lastItem && lastItem.page ? lastItem.page : 1;
    const slot = Grid.findFreeSlot(layout, startPage, 0, Grid.DEFAULTS.chapter.h, Grid.DEFAULTS.chapter.w);

    try {
      await API.createEntry(id, 'New Chapter');
    } catch (err) {
      if (!err.message.includes('409')) console.warn('addChapter: could not create HTML file', err);
    }

    layout.entries.push({
      id,
      kind: 'chapter',
      sidebarTitle: 'New Chapter',
      title: 'New Chapter',
      page: slot.page,
      col: slot.col,
      row: slot.row,
      w: Grid.DEFAULTS.chapter.w,
      h: Grid.DEFAULTS.chapter.h
    });

    Renderer.renderTOC();
    EditMode.setDirty();
    rebuild();
    setTimeout(() => {
      const t = document.querySelector('.pages .grid-card[data-item-id="' + id + '"]');
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  // ── Drag-to-grid positioning ───────────────
  function bindDragGlobal() {
    document.addEventListener('mousedown', onCardMouseDown, true);
  }

  let _dragListenerBound = false;
  // How close (in screen px) to a card's edge the pointer must be to start
  // a resize instead of a move. Applies both just inside AND a little
  // outside the box, so the handles don't need pixel-perfect aim.
  const RESIZE_TOL = 17;
  function onCardMouseDown(e) {
    if (drag || resize) return;
    if (e.button !== 0) return;

    // Resolve the card we're acting on. If the pointer is over a card, use
    // it. Otherwise (cursor just outside a card's box) search the page for
    // the nearest card whose edge is within tolerance.
    let card = e.target.closest && e.target.closest('.grid-card');
    let edge = card ? edgeForPoint(card.getBoundingClientRect(), e.clientX, e.clientY, RESIZE_TOL) : '';

    if (!card) {
      const pageEl = e.target.closest && e.target.closest('.page');
      if (pageEl) {
        let best = null, bestDist = Infinity;
        pageEl.querySelectorAll('.grid-card').forEach(c => {
          if (!c.dataset.itemType) return;
          if (c.getAttribute('contenteditable') === 'true') return;
          const r = c.getBoundingClientRect();
          if (!edgeForPoint(r, e.clientX, e.clientY, RESIZE_TOL)) return;
          const dist = Math.min(
            Math.abs(e.clientX - r.left), Math.abs(e.clientX - r.right),
            Math.abs(e.clientY - r.top), Math.abs(e.clientY - r.bottom)
          );
          if (dist < bestDist) { bestDist = dist; best = c; }
        });
        if (best) { card = best; edge = edgeForPoint(best.getBoundingClientRect(), e.clientX, e.clientY, RESIZE_TOL); }
      }
    }

    if (!card) return;
    const pageEl = card.closest('.page');
    if (!pageEl) return;
    if (!card.dataset.itemType) return;
    // While a card is being edited inline (contenteditable), let the user
    // click into the text instead of dragging the card around.
    if (card.getAttribute('contenteditable') === 'true') return;
    if (e.target.closest('button, input, select, .struct-btn, .entry-actions, .resize-handle')) return;

    // Near an edge → resize that edge; otherwise → move the card.
    if (edge) {
      startResize(card, edge, e);
      return;
    }

    if (!_dragListenerBound) {
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
      _dragListenerBound = true;
    }

    e.preventDefault();
    const rect = card.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();
    drag = {
      el: card,
      pageEl,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origLeft: rect.left - pageRect.left,
      origTop: rect.top - pageRect.top,
      w: Number(card.dataset.gridW),
      h: Number(card.dataset.gridH),
      zoom: getZoom()
    };
    card.classList.add('dragging');
  }

  function getZoom() {
    const main = document.getElementById('main-content');
    return parseFloat(main && main.style.zoom) || 1;
  }

  function onDragMove(e) {
    if (!drag) return;
    const dx = (e.clientX - drag.startClientX) / drag.zoom;
    const dy = (e.clientY - drag.startClientY) / drag.zoom;
    const newLeft = Math.max(0, drag.origLeft + dx);
    const newTop  = Math.max(0, drag.origTop  + dy);
    const col = Math.round(newLeft / Grid.CELL_W);
    const row = Math.round(newTop  / Grid.CELL_H);
    const clamped = Grid.clampToGrid(col, row, drag.w, drag.h);
    PageNumbers.positionCard(drag.el, clamped.col, clamped.row, drag.w, drag.h);
  }

  function onDragEnd() {
    if (!drag) return;
    const el = drag.el;
    el.classList.remove('dragging');
    syncLayoutFromCard(el);
    // Keep the flat list ordered by visual position so the TOC sidebar
    // structure follows where cards actually sit. No parent/child logic.
    Grid.sortEntriesByPosition(Renderer.getLayout());
    Renderer.renderTOC();
    EditMode.setDirty();
    drag = null;
  }

  // ── Resize (drag handles) ───────────────────
  // Resizing changes the card's grid rectangle: edge handles move the
  // corresponding side (updating col/row), corner handles move two sides.
  // All maths run in un-zoomed layout px (the px the grid model uses);
  // the starting rect is divided by the current zoom to undo getBounding-
  // ClientRect's scaling, matching how onDragMove handles movement.
  let _resizeListenerBound = false;
  function onResizeDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const handle = e.currentTarget;
    const card = handle.closest('.grid-card');
    if (!card) return;
    if (card.getAttribute('contenteditable') === 'true') return;
    startResize(card, handle.dataset.edge, e);
  }

  // Begin a resize on `edge` (one of n/s/e/w/ne/nw/se/sw) for `card`,
  // using the pointer position in `e` as the anchor. Shared by the
  // visible handles and proximity-based grabbing near a card's edge.
  function startResize(card, edge, e) {
    const pageEl = card.closest('.page');
    if (!pageEl) return;
    const rect = card.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();
    const zoom = getZoom();
    resize = {
      el: card,
      edge,
      pageEl,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origLeft: (rect.left - pageRect.left) / zoom,
      origTop: (rect.top - pageRect.top) / zoom,
      origW: parseFloat(card.style.width) || Number(card.dataset.gridW) * Grid.CELL_W,
      origH: parseFloat(card.style.height) || Number(card.dataset.gridH) * Grid.CELL_H,
      zoom
    };
    card.classList.add('resizing');

    if (!_resizeListenerBound) {
      document.addEventListener('mousemove', onResizeMove);
      document.addEventListener('mouseup', onResizeEnd);
      _resizeListenerBound = true;
    }
  }

  // Work out which edge(s) of a card's rect the point (x,y) is near. Uses
  // signed distance so it works both just inside AND a little outside the
  // box. Returns '' if the point is not within `tol` of any edge.
  function edgeForPoint(rect, x, y, tol) {
    const dLeft = x - rect.left;
    const dRight = rect.right - x;
    const dTop = y - rect.top;
    const dBottom = rect.bottom - y;
    const near = (d) => Math.abs(d) <= tol;
    const n = near(dTop) ? 'n' : '';
    const s = near(dBottom) ? 's' : '';
    const w = near(dLeft) ? 'w' : '';
    const e = near(dRight) ? 'e' : '';
    return n + s + w + e;
  }

  function onResizeMove(e) {
    if (!resize) return;
    const dx = (e.clientX - resize.startClientX) / resize.zoom;
    const dy = (e.clientY - resize.startClientY) / resize.zoom;
    const { origLeft, origTop, origW, origH, edge } = resize;

    let left = origLeft, top = origTop, w = origW, h = origH;
    const hasW = edge.indexOf('w') >= 0;
    const hasE = edge.indexOf('e') >= 0;
    const hasN = edge.indexOf('n') >= 0;
    const hasS = edge.indexOf('s') >= 0;

    if (hasE) w = origW + dx;
    if (hasW) { left = origLeft + dx; w = origW - dx; }
    if (hasS) h = origH + dy;
    if (hasN) { top = origTop + dy; h = origH - dy; }

    // Minimum one cell on each axis; keep the opposite edge fixed when the
    // min is hit by shifting the moving edge back.
    const minW = Grid.CELL_W, minH = Grid.CELL_H;
    if (w < minW) { if (hasW) left -= (minW - w); w = minW; }
    if (h < minH) { if (hasN) top -= (minH - h); h = minH; }

    // Clamp inside the page (layout px: PAGE_W × PAGE_H).
    if (left < 0) { if (hasW) w += left; left = 0; }
    if (top < 0) { if (hasN) h += top; top = 0; }
    if (left + w > Grid.PAGE_W) w = Grid.PAGE_W - left;
    if (top + h > Grid.PAGE_H) h = Grid.PAGE_H - top;

    // Lock to the grid: only whole cells are allowed — no free-form sizing.
    // Snap every edge to a cell boundary so the card can never sit between
    // grid lines while dragging.
    const cw = Grid.CELL_W, ch = Grid.CELL_H;
    left = Math.round(left / cw) * cw;
    top  = Math.round(top / ch) * ch;
    w    = Math.max(cw, Math.round(w / cw) * cw);
    h    = Math.max(ch, Math.round(h / ch) * ch);
    if (left < 0) left = 0;
    if (top < 0) top = 0;
    if (left + w > Grid.PAGE_W) w = Math.max(cw, Grid.PAGE_W - left);
    if (top + h > Grid.PAGE_H) h = Math.max(ch, Grid.PAGE_H - top);

    resize.el.style.left = left + 'px';
    resize.el.style.top = top + 'px';
    resize.el.style.width = w + 'px';
    resize.el.style.height = h + 'px';
  }

  function onResizeEnd() {
    if (!resize) return;
    const el = resize.el;
    el.classList.remove('resizing');

    // Snap the live px rect to grid cells and write back into the model.
    const left = parseFloat(el.style.left) || 0;
    const top = parseFloat(el.style.top) || 0;
    const w = parseFloat(el.style.width) || Grid.CELL_W;
    const h = parseFloat(el.style.height) || Grid.CELL_H;

    const col = Math.round(left / Grid.CELL_W);
    const row = Math.round(top / Grid.CELL_H);
    const cw = Math.max(1, Math.round(w / Grid.CELL_W));
    const ch = Math.max(1, Math.round(h / Grid.CELL_H));

    const id = el.dataset.itemId;
    const layout = Renderer.getLayout();
    const item = Grid.findItem(layout, 'entry', id);
    if (item) {
      item.col = col;
      item.row = row;
      item.w = cw;
      item.h = ch;
    }
    // Re-apply snapped values so the card sits exactly on the grid.
    PageNumbers.positionCard(el, col, row, cw, ch);
    Grid.sortEntriesByPosition(layout);
    Renderer.renderTOC();
    EditMode.setDirty();
    resize = null;

    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
    _resizeListenerBound = false;
  }

  // ── Helpers ───────────────────────────────
  function makeBtn(content, title, danger) {
    const btn = document.createElement('button');
    btn.className = 'struct-btn' + (danger ? ' danger' : '');
    btn.title = title || '';
    if (content == null) {
      // no visible label (caller sets one separately)
    } else if (typeof content === 'string') {
      btn.textContent = content;
    } else if (content instanceof Node) {
      btn.classList.add('icon-btn');
      btn.appendChild(content);
    }
    return btn;
  }

  // Inline SVG icon factory (stroke uses currentColor so danger styling applies).
  function svgIcon(paths, opts) {
    opts = opts || {};
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', opts.viewBox || '0 0 24 24');
    svg.setAttribute('width', opts.size || '14');
    svg.setAttribute('height', opts.size || '14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', opts.sw || '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    (Array.isArray(paths) ? paths : [paths]).forEach(d => {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  function pencilIcon() {
    return svgIcon([
      'M12 20h9',
      'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z'
    ]);
  }

  function trashIcon() {
    return svgIcon([
      'M3 6h18',
      'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
      'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
      'M10 11v6',
      'M14 11v6'
    ]);
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c);
  }

  return { enable, disable, syncLayoutFromDOM, rebuild, repack, flushPendingEdits, clearPendingEdits };
})();
