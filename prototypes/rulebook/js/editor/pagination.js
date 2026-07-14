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

  function ensureMigrated(layout) {
    if (!layout) return false;
    if (!layout.grid) layout.grid = { cols: Grid.COLS, rows: Grid.ROWS };
    if (!Grid.isMigrated(layout)) Grid.migrateLayout(layout);
    return true;
  }

  // Build the .pages stack with one .page per page number required by
  // the layout, and place each grid-card by id. Idempotent: callers
  // are expected to have run Renderer.renderChapters() first so the
  // flat cards live in #chapters-container.
  function layOut() {
    const layout = Renderer.getLayout();
    if (!ensureMigrated(layout)) return;

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

    // Place each card into its page. Every entry (including chapters) uses
    // the 'entry-<id>' DOM id now — chapters are just entries of kind
    // 'chapter'.
    Grid.walkItems(layout).forEach(({ kind, item }) => {
      const id = item.id || item;
      const el = document.getElementById('entry-' + id);
      if (!el) return;

      const pageIdx = (item.page || 1) - 1;
      const page = pageCards[pageIdx];
      if (!page) return;

      page.appendChild(el);
      el.classList.add('grid-card');
      positionCard(el, item.col, item.row, item.w, item.h);

      pageOfEntry.set(id, item.page);
    });

    // Appendix: place on its dedicated page, filling the content rect.
    const appEl = document.getElementById('appendix');
    if (appEl && appendixPage > 0) {
      const page = pageCards[appendixPage - 1];
      if (page) {
        page.classList.add('appendix-page');
        page.appendChild(appEl);
        appEl.style.display = '';
        appEl.classList.add('grid-card');
        const r = Grid.rect(Grid.CONTENT_COL, 4, Grid.CONTENT_W, Grid.ROWS - 8);
        appEl.style.position = 'absolute';
        appEl.style.left = r.left + 'px';
        appEl.style.top = r.top + 'px';
        appEl.style.width = r.width + 'px';
        appEl.style.height = r.height + 'px';
      }
    }

    totalPages = maxPage;
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

  // Update appendix cross-reference labels ('p. N').
  function stampPageNumbers() {
    document.querySelectorAll('.appendix-entry .refs a').forEach(a => {
      const href = a.getAttribute('href');
      if (href && href.indexOf('#entry-') === 0) {
        const entryId = href.substring(7);
        const page = getPageForEntry(entryId);
        if (page && page !== '?') {
          a.textContent = 'p. ' + page;
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
    getTotalPages
  };
})();
