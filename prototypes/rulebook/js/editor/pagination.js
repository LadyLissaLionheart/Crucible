// Grid-driven page layout (replaces auto-pagination).
//
// layOut() walks the migrated layout model, builds one .page card per
// max page number, and moves each chapter/entry card by id
// from #chapters-container into its target page. Card position is
// applied as inline pixel coords derived from its grid placement
// (page, col, row, w, h).
//
// In display mode the page-cells / page-margin overlays are hidden
// via CSS (only body.edit-mode shows them).

const PageNumbers = (() => {
  'use strict';

  let pageOfEntry = null;
  let totalPages = 0;
  let appendixPageEl = null;

  function ensureMigrated(layout) {
    if (!layout) return false;
    if (!layout.grid) layout.grid = { cols: Grid.COLS, rows: Grid.ROWS };
    if (!Grid.isMigrated(layout)) Grid.migrateLayout(layout);
    if (typeof Layers !== 'undefined' && Layers.ensureMigrated) Layers.ensureMigrated(layout);
    return true;
  }

  // Build the .pages stack with one .page per page number required by
  // the layout, and place each grid-card by id. Idempotent: callers
  // are expected to have run Renderer.renderChapters() first so the
  // flat cards live in #chapters-container.
  function layOut() {
    const layout = Renderer.getLayout();
    if (!ensureMigrated(layout)) return;
    Grid.ensureZ(layout);

    pageOfEntry = new Map();

    const main = document.getElementById('main-content');
    if (!main) return;

    if (typeof Renderer !== 'undefined' && Renderer.teardownPages) {
      Renderer.teardownPages();
    } else {
      const prior = main.querySelector('.pages');
      if (prior) prior.remove();
    }

    // Determine page count from item placements + 1 for the appendix.
    let maxPage = 0;
    Grid.walkItems(layout).forEach(({ item }) => {
      if (typeof item.page === 'number' && item.page > maxPage) maxPage = item.page;
    });
    let appendixPage = 0;
    if (layout.appendix) {
      appendixPage = maxPage + 1;
      maxPage = appendixPage;
    }
    if (maxPage < 1) maxPage = 1;

    const pages = document.createElement('div');
    pages.className = 'pages';
    main.appendChild(pages);

    for (let p = 1; p <= maxPage; p++) {
      const page = document.createElement('section');
      page.className = 'page';
      page.dataset.page = String(p);

      const cells = document.createElement('div');
      cells.className = 'page-cells';
      page.appendChild(cells);

      ['page-margin-top', 'page-margin-bottom', 'page-margin-left', 'page-margin-right', 'page-margin-center']
        .forEach(cls => {
          const m = document.createElement('div');
          m.className = 'page-margin ' + cls;
          page.appendChild(m);
        });

      pages.appendChild(page);
    }

    const pageCards = Array.from(pages.children).filter(c => c.classList.contains('page'));

    // Per-page map of layerId -> .layer-group element, built lazily as we
    // place cards. Each group is its own stacking context (z-index = layer
    // order) so cross-layer order follows the panel while per-entry --z
    // still orders cards within a layer. Global layers appear on every page;
    // page-local layers only on their specific page.
    const groupCache = new Map(); // pageNumber -> Map(layerId -> el)
    function layerGroupsFor(pageNum, pageEl) {
      if (groupCache.has(pageNum)) return groupCache.get(pageNum);
      const map = new Map();
      const pageLayers = (layout.layers || [])
        .filter(l => l.scope === 'global' || l.page === pageNum);
      pageLayers.forEach((l, i) => {
        const g = document.createElement('div');
        g.className = 'layer-group';
        g.dataset.layerId = l.id;
        g.style.zIndex = String(2 + i); // above .page-margin (z 1)
        const hiddenInEdit = (typeof EditMode !== 'undefined' && EditMode.isActive())
          ? (l.editHidden === true)
          : false;
        if (l.visible === false || hiddenInEdit) g.setAttribute('hidden', '');
        pageEl.appendChild(g);
        map.set(l.id, g);
      });
      groupCache.set(pageNum, map);
      return map;
    }

     // Place each card into its page. Every entry (including chapters) uses
     // the 'entry-<id>' DOM id now — chapters are just entries of kind
     // 'chapter'.
    Grid.walkItems(layout).forEach(({ kind, item }) => {
      const id = item.id || item;
      const el = document.getElementById('entry-' + id);
      if (!el) return;

      const pageNum = item.page || 1;
      const pageIdx = pageNum - 1;
      const page = pageCards[pageIdx];
      if (!page) return;

      const groups = layerGroupsFor(pageNum, page);
      let group = groups.get(item.layerId);
      if (!group) {
        // Fallback for an entry whose layer vanished: drop it into the
        // first group on the page, or synthesize one if the page has none.
        const firstId = groups.size ? groups.keys().next().value : null;
        if (firstId) {
          group = groups.get(firstId);
        } else {
          group = document.createElement('div');
          group.className = 'layer-group';
          group.style.zIndex = '2';
          page.appendChild(group);
        }
      }

      group.appendChild(el);
      el.classList.add('grid-card');
      positionCard(el, item.col, item.row, item.w, item.h);
      el.style.setProperty('--z', String(typeof item.z === 'number' ? item.z : 0));

      pageOfEntry.set(id, item.page);
    });

    // Appendix: place on its dedicated page, filling the content rect.
    appendixPageEl = null;
    const appEl = document.getElementById('appendix');
    if (appEl && appendixPage > 0) {
      const page = pageCards[appendixPage - 1];
      if (page) {
        page.classList.add('appendix-page');
        page.appendChild(appEl);
        appEl.style.display = '';
        appEl.classList.add('grid-card');
        const r = Grid.rect(Grid.CONTENT_COL, 3, Grid.CONTENT_W, Grid.ROWS - 6);
        appEl.style.position = 'absolute';
        appEl.style.left = r.left + 'px';
        appEl.style.top = r.top + 'px';
        appEl.style.width = r.width + 'px';
        appEl.style.height = r.height + 'px';
        appendixPageEl = page;
      }
    }

    totalPages = maxPage;

    if (typeof Layers !== 'undefined' && Layers.updateActiveLayerGroups) {
      Layers.updateActiveLayerGroups();
    }
  }

  // Apply absolute pixel coords for a grid placement to a card element.
  function positionCard(el, col, row, w, h) {
    if (!el) return;
    const r = Grid.rect(col, row, w, h);
    el.style.position = 'absolute';
    el.style.left = r.left + 'px';
    el.style.top = r.top + 'px';
    el.style.width = r.width + 'px';
    el.style.height = r.height + 'px';
    el.dataset.gridCol = String(col);
    el.dataset.gridRow = String(row);
    el.dataset.gridW = String(w);
    el.dataset.gridH = String(h);
  }

  // Update appendix cross-reference labels (page number only).
  function stampPageNumbers() {
    document.querySelectorAll('.appendix-entry .refs a').forEach(a => {
      const href = a.getAttribute('href');
      if (href && href.indexOf('#entry-') === 0) {
        const entryId = href.substring(7);
        const page = getPageForEntry(entryId);
        if (page && page !== '?') {
          a.textContent = page;
        }
      }
    });
  }

  function getPageForEntry(entryId) {
    return pageOfEntry ? (pageOfEntry.get(entryId) || '?') : '?';
  }
  function getTotalPages() {
    return totalPages || '?';
  }

  // Backwards-compat alias: callers (rulebook, edit-mode) call paginate().
  function paginate() { layOut(); }
  function calculate() { layOut(); }
  function stampFooters() {}

  return {
    paginate,
    calculate,
    layOut,
    positionCard,
    stampPageNumbers,
    stampFooters,
    getPageForEntry,
    getTotalPages,
    getAppendixPage: function () { return appendixPageEl; }
  };
})();
