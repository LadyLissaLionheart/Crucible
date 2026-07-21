// Grid constants, migration, and helpers for the per-page cell grid.
//
// Each page is a 49×65 cell grid sized to a US-Letter card (816×1056px),
// giving ~16.65×16.25px cells. The ODD dimensions let a 3-wide center
// gutter (cols 23-25) sit exactly on the page's horizontal midpoint, and
// the odd row count puts a true center row at the vertical midpoint — so
// titles/entries can be perfectly centered. Margin cells (rows 0-2,
// 62-64; cols 0-2, 46-48) flag the print margins — purely visual
// reference. Content spans cols 3-45 (43 wide): left col 3-22, 3-wide
// gutter 23-25, right col 26-45.
//
// Every positioned item (chapter, section, header, subheader, entry)
// carries { page, col, row, w, h } and a `kind`, stored in
// layout.entries (a single flat, ordered array — there is no
// parent/child nesting). Items flow top-to-bottom on first load via
// migrateLayout(); afterwards the user positions cards freely by dragging.
// The TOC sidebar structure is derived from array order + `kind`.

const Grid = (() => {
  'use strict';

  const PAGE_W = 816;
  const PAGE_H = 1056;
  const COLS = 49;
  const ROWS = 65;
  const CELL_W = PAGE_W / COLS; // ~16.65
  const CELL_H = PAGE_H / ROWS; // ~16.25

  const MARGIN_TOP_ROWS    = [0, 1, 2];
  const MARGIN_BOT_ROWS    = [62, 63, 64];
  const MARGIN_LEFT_COLS   = [0, 1, 2];
  const MARGIN_RIGHT_COLS  = [46, 47, 48];

  // Default placement zone (inside the margin frame). Content spans
  // cols 3-45 (43 wide): left col 3-22, 3-wide gutter 23-25, right 26-45.
  const CONTENT_COL = 3;
  const CONTENT_W = COLS - 6; // 43

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function isMarginCell(c, r) {
    return MARGIN_TOP_ROWS.includes(r) ||
           MARGIN_BOT_ROWS.includes(r) ||
           MARGIN_LEFT_COLS.includes(c) ||
           MARGIN_RIGHT_COLS.includes(c);
  }

  // Convert grid placement → pixel rect. Not clamped, so cards can be
  // positioned outside the page bounds (they're clipped by the page's
  // overflow, but their model position is preserved as placed).
  function rect(c, r, w, h) {
    return {
      left:   c * CELL_W,
      top:    r * CELL_H,
      width:  Math.max(1, w) * CELL_W,
      height: Math.max(1, h) * CELL_H
    };
  }

  function clampToGrid(col, row, w, h) {
    return {
      col: clamp(col, 0, Math.max(0, COLS - Math.max(1, w))),
      row: clamp(row, 0, Math.max(0, ROWS - Math.max(1, h)))
    };
  }

  // ── Iteration / lookup ──
  // The model is a single flat, ordered list: layout.entries. Every item
   // (chapter, section, header, subheader, entry) is just an object with a
  // `kind`. There is no parent/child nesting — order in the array (and,
  // after a drag, visual position) drives the TOC sidebar structure.
  function walkItems(layout) {
    return (layout.entries || []).map(item => ({
      kind: item.kind || 'entry',
      item
    }));
  }

  function findItem(layout, type, id) {
    const item = (layout.entries || []).find(e => e.id === id) || null;
    if (!item) return null;
    if (type === 'chapter' && item.kind !== 'chapter') return null;
    return item;
  }

  // ── Free-slot finder ──
  // Searches top-to-bottom on the page for the first row whose rectangle
  // (CONTENT_COL, row, w, h) doesn't overlap any existing placed item.
   // Used when adding new chapters/entries so they land in the
   // next available spot; new pages are appended as needed.
  function findFreeSlot(layout, startPage, startRow, h, w) {
    let page = startPage, row = startRow;
    for (let i = 0; i < 500; i++) {
      if (row + h <= ROWS && !overlaps(layout, page, CONTENT_COL, row, w, h)) {
        return { page, col: CONTENT_COL, row };
      }
      row++;
      if (row + h > ROWS) { row = 0; page++; }
    }
    return { page, col: CONTENT_COL, row: 0 };
  }

  function overlaps(layout, page, col, row, w, h) {
    const hit = (c2, r2, ww, hh) =>
      (col < c2 + ww) && (col + w > c2) &&
      (row < r2 + hh) && (row + h > r2);
    for (const item of layout.entries || []) {
      if (typeof item.page !== 'number') continue;
      if (item.page === page && hit(item.col, item.row, item.w, item.h)) return true;
    }
    return false;
  }

  // ── Migration ──
   // Convert any legacy nested model (chapters→[sections→]entries) into the
  // flat layout.entries array, preserving order and grid positions.
  // Idempotent: no-op once layout.entries exists and chapters is gone.
  function migrateLayout(layout) {
    if (!layout) return layout;
    if (!layout.grid) layout.grid = { cols: COLS, rows: ROWS };
    if (isMigrated(layout)) return layout;

    const copyPos = (dst, src) => {
      if (src && typeof src.page === 'number') {
        dst.page = src.page; dst.col = src.col; dst.row = src.row;
        dst.w = src.w; dst.h = src.h;
      }
    };
    const pushEntry = (flat, e) => {
      const obj = typeof e === 'string' ? { id: e } : e;
      if (!flat.some(f => f.id === obj.id)) flat.push(obj);
    };

    const flat = [];
     (layout.chapters || []).forEach(ch => {
       // Chapter becomes a single flat item of kind 'chapter'.
       const chapterItem = {
         id: ch.id,
         kind: 'chapter',
         sidebarTitle: ch.title || '',
         title: ch.title || ''
       };
       copyPos(chapterItem, ch);
       flat.push(chapterItem);

      // Old format: entries nested inside sections.
      (ch.sections || []).forEach(sec => {
        if (sec.title) {
          const sectionItem = { id: sec.id, kind: 'section', sidebarTitle: sec.title };
          copyPos(sectionItem, sec);
          flat.push(sectionItem);
        }
        (sec.entries || []).forEach(e => pushEntry(flat, e));
      });
      // New-ish format: entries directly on the chapter.
      (ch.entries || []).forEach(e => pushEntry(flat, e));
    });

    if (flat.length) {
      layout.entries = flat;
      delete layout.chapters;
    }

    // ── Assign grid positions to any items still missing them ──
    let page = 0;
    (layout.entries || []).forEach(item => {
      page++;
      if (typeof item.page !== 'number') {
        const d = DEFAULTS[item.kind] || DEFAULTS.entry;
        item.page = page;
        item.col = CONTENT_COL;
        item.row = 3;
        item.w = item.w || d.w;
        item.h = item.h || d.h;
      } else if (item.page > page) {
        page = item.page;
      }
    });
    return layout;
  }

  function isMigrated(layout) {
    return !!(layout && Array.isArray(layout.entries) && !Array.isArray(layout.chapters));
  }

  // ── Z-index (stacking order) ──
  // Each entry may carry a numeric `z`; higher z paints on top of lower z
  // within the same page's stacking context. Entries that lack `z` get one
  // assigned in array order (later entries sit above earlier ones, matching
  // the default DOM paint order). Existing explicit z values are preserved
  // and never collide with assigned ones.
  function ensureZ(layout) {
    if (!layout || !Array.isArray(layout.entries)) return layout;
    let max = -1;
    layout.entries.forEach(e => { if (typeof e.z === 'number') max = Math.max(max, e.z); });
    let next = max < 0 ? 0 : max + 1;
    layout.entries.forEach(e => {
      if (typeof e.z !== 'number') e.z = next++;
    });
    return layout;
  }

  // Re-order the flat list to match visual position (page → row → col).
  // Used after a drag so the TOC sidebar structure reflects where cards
  // actually sit. Cards that lack a position sort to the end.
  function sortEntriesByPosition(layout) {
    if (!layout || !Array.isArray(layout.entries)) return layout;
    layout.entries.sort((a, b) => {
      const pa = a.page || 0, pb = b.page || 0;
      if (pa !== pb) return pa - pb;
      const ra = a.row || 0, rb = b.row || 0;
      if (ra !== rb) return ra - rb;
      return (a.col || 0) - (b.col || 0);
    });
    return layout;
  }

  // ── Default sizes for new items ──
  // `kind` distinguishes entry types in the flat model:
  //   section / header / subheader are title-only cards
  //   entry (default) loads HTML from data/entries/{id}.html
  const DEFAULTS = {
    chapter: { w: CONTENT_W, h: 6 },
    section: { w: 20, h: 6 },
    header:  { w: 20, h: 5 },
    subheader: { w: 20, h: 5 },
    entry:   { w: 6, h: 16 }
  };

  return {
    PAGE_W, PAGE_H, COLS, ROWS, CELL_W, CELL_H,
    MARGIN_TOP_ROWS, MARGIN_BOT_ROWS, MARGIN_LEFT_COLS, MARGIN_RIGHT_COLS,
    CONTENT_COL, CONTENT_W,
    DEFAULTS,
    isMarginCell, rect, clampToGrid, clamp,
    walkItems, findItem, findFreeSlot, overlaps,
    migrateLayout,     isMigrated, ensureZ, sortEntriesByPosition
  };
})();
