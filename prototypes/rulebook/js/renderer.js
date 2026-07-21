const Renderer = (() => {
  'use strict';

  let layout = null;
  let appendixData = null;
  let searchIndex = [];

  function setLayout(l) { layout = l; }

  // ── Client-side entry content cache ──
  // Holds the last-known HTML for each entry id, independent of the server.
  // Undo/redo (and any in-place re-render) stamps these back into the cards
  // so a restored entry shows its content WITHOUT a server round-trip — the
  // editor never writes to the server until an explicit Save, so the cache
  // is the authoritative client-side source during an edit session.
  const contentCache = new Map();
  function cacheContent(id, html) { if (id) contentCache.set(id, html); }
  function getCachedContent(id) { return contentCache.get(id); }
  function setCachedContent(id, html) { cacheContent(id, html); }
  function clearContentCache() { contentCache.clear(); }
  function snapshotContentCache() { return new Map(contentCache); }
  function restoreContentCache(map) {
    contentCache.clear();
    if (map) map.forEach((html, id) => contentCache.set(id, html));
  }

  function getLayout() { return layout; }
  function getSearchIndex() { return searchIndex; }
  function clearSearchIndex() { searchIndex = []; }
  function getAppendixData() { return appendixData; }
  function setAppendixData(d) { appendixData = d; }

  // ── TOC ───────────────────────────────────
  // Build a hierarchical sidebar from the flat entries list. There is no
  // parent/child nesting — structure is inferred from `kind` values and
  // array order:
   //   chapter   → starts a new chapter group
   //   section   → top-level item in the current chapter group
  //   header    → nested under the current section
  //   subheader → nested under the current header (else section)
  //   entry (or no kind) → nested under the current section
  // Smooth-scroll an element into view, offsetting for the fixed header so
  // the target isn't hidden underneath it. (scrollIntoView with block:start
  // would align the element to the very top of the viewport, behind the
  // header.) Works under CSS `zoom` because rect.top + scrollY stay in the
  // same (zoomed) document coordinate space.
  function scrollToEl(el) {
    if (!el) return;
    var main = document.getElementById('main-content');
    var mainTop = main.getBoundingClientRect().top;
    var top = el.getBoundingClientRect().top - mainTop + main.scrollTop - 8;
    main.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  function renderTOC() {
    const sidebar = document.getElementById('sidebar-toc');
    sidebar.innerHTML = '';

    let curChapter = null;
    let curListWrap = null;
    let currentSection = null;
    let currentHeader = null;

    // Pre-scan: which header ids have at least one subheader following them
    // (before the next header/section/chapter)? Used to decide whether to
    // render a caret on a header.
    const headersWithSubs = new Set();
    const entries = layout.entries || [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if ((e.kind || 'entry') !== 'header') continue;
      for (let j = i + 1; j < entries.length; j++) {
        const k = entries[j].kind || 'entry';
        if (k === 'chapter' || k === 'section' || k === 'header') break;
        if (k === 'subheader') { headersWithSubs.add(e.id); break; }
      }
    }

    const ensureChapter = () => {
      if (curChapter) return;
      curChapter = document.createElement('div');
      curChapter.className = 'toc-chapter open';
      const titleEl = document.createElement('div');
      titleEl.className = 'toc-chapter-title';

      // Caret container: top div is exactly one line height (16px),
      // bottom div is auto to fill remaining space.
      const caretWrap = document.createElement('div');
      caretWrap.className = 'toc-caret-wrap';
      const caretLine = document.createElement('div');
      caretLine.className = 'toc-caret-line';
      const caret = document.createElement('span');
      caret.className = 'toc-caret';
      caret.textContent = '▸';
      caretLine.appendChild(caret);
      caretWrap.appendChild(caretLine);
      caretWrap.appendChild(document.createElement('div'));

      const labelEl = document.createElement('span');
      labelEl.className = 'toc-label';
      caret.addEventListener('click', (e) => {
        e.stopPropagation();
        curChapter.classList.toggle('open');
      });
      titleEl.appendChild(caretWrap);
      titleEl.appendChild(labelEl);
      curChapter.appendChild(titleEl);
      curListWrap = document.createElement('div');
      curListWrap.className = 'toc-sections';
      curChapter.appendChild(curListWrap);
      sidebar.appendChild(curChapter);
    };

    const makeTitle = (obj, label) => {
      const titleEl = document.createElement('div');
      const kind = obj.kind || 'entry';
      titleEl.className = 'toc-section-title toc-kind-' + kind;
      titleEl.setAttribute('data-target', 'entry-' + obj.id);
      titleEl.textContent = label;
      titleEl.addEventListener('click', () => {
        const target = document.getElementById('entry-' + obj.id);
        scrollToEl(target);
      });
      return titleEl;
    };

    (layout.entries || []).forEach(obj => {
      const kind = obj.kind || 'entry';
      const label = obj.sidebarTitle || obj.id.replace(/-/g, ' ');

if (kind === 'chapter') {
         curChapter = document.createElement('div');
         curChapter.className = 'toc-chapter open';
         const titleEl = document.createElement('div');
         titleEl.className = 'toc-chapter-title';
         const caret = document.createElement('span');
         caret.className = 'toc-caret';
         caret.textContent = '▸';
         const labelEl = document.createElement('span');
         labelEl.className = 'toc-label';
         labelEl.textContent = label;
         caret.addEventListener('click', (e) => {
           e.stopPropagation();
           curChapter.classList.toggle('open');
         });
         labelEl.addEventListener('click', () => {
           const target = document.getElementById('entry-' + obj.id);
           if (target) scrollToEl(target);
         });
         titleEl.appendChild(caret);
         titleEl.appendChild(labelEl);
         curChapter.appendChild(titleEl);
         curListWrap = document.createElement('div');
         curListWrap.className = 'toc-sections';
         curChapter.appendChild(curListWrap);
         sidebar.appendChild(curChapter);
        currentSection = null;
        currentHeader = null;
        return;
      }
ensureChapter();

      if (kind === 'section') {
        const secEl = document.createElement('div');
        secEl.className = 'toc-section open toc-has-children';

        // Title with caret (mirrors chapter-title structure).
        const titleEl = document.createElement('div');
        titleEl.className = 'toc-section-title toc-kind-section';
        titleEl.setAttribute('data-target', 'entry-' + obj.id);

        const caretWrap = document.createElement('div');
        caretWrap.className = 'toc-caret-wrap';
        const caretLine = document.createElement('div');
        caretLine.className = 'toc-caret-line';
        const caret = document.createElement('span');
        caret.className = 'toc-caret';
        caret.textContent = '▸';
        caretLine.appendChild(caret);
        caretWrap.appendChild(caretLine);
        caretWrap.appendChild(document.createElement('div'));

        const labelEl = document.createElement('span');
        labelEl.className = 'toc-label';
        labelEl.textContent = label;

        caret.addEventListener('click', (e) => {
          e.stopPropagation();
          secEl.classList.toggle('open');
        });
        labelEl.addEventListener('click', () => {
          const target = document.getElementById('entry-' + obj.id);
          if (target) scrollToEl(target);
        });

        titleEl.appendChild(caretWrap);
        titleEl.appendChild(labelEl);
        secEl.appendChild(titleEl);

        const secChildren = document.createElement('div');
        secChildren.className = 'toc-section-children';
        secEl.appendChild(secChildren);

        curListWrap.appendChild(secEl);
        currentSection = secChildren;
        currentHeader = null;
      } else if (kind === 'header') {
        const wrapEl = document.createElement('div');
        wrapEl.className = 'toc-header';
        const hasSubs = headersWithSubs.has(obj.id);
        if (hasSubs) wrapEl.classList.add('toc-has-children');

        const titleEl = document.createElement('div');
        titleEl.className = 'toc-section-title toc-kind-header';
        titleEl.setAttribute('data-target', 'entry-' + obj.id);

        if (hasSubs) {
          // Caret-enabled header (collapsible, starts collapsed).
          const caretWrap = document.createElement('div');
          caretWrap.className = 'toc-caret-wrap';
          const caretLine = document.createElement('div');
          caretLine.className = 'toc-caret-line';
          const caret = document.createElement('span');
          caret.className = 'toc-caret';
          caret.textContent = '▸';
          caretLine.appendChild(caret);
          caretWrap.appendChild(caretLine);
          caretWrap.appendChild(document.createElement('div'));
          caret.addEventListener('click', (e) => {
            e.stopPropagation();
            wrapEl.classList.toggle('open');
          });
          titleEl.appendChild(caretWrap);

          const labelEl = document.createElement('span');
          labelEl.className = 'toc-label';
          labelEl.textContent = label;
          labelEl.addEventListener('click', () => {
            const target = document.getElementById('entry-' + obj.id);
            if (target) scrollToEl(target);
          });
          titleEl.appendChild(labelEl);

          const hdrChildren = document.createElement('div');
          hdrChildren.className = 'toc-header-children';
          wrapEl.appendChild(titleEl);
          wrapEl.appendChild(hdrChildren);

          if (currentSection) currentSection.appendChild(wrapEl);
          else curListWrap.appendChild(wrapEl);
          currentHeader = hdrChildren;
        } else {
          // Header without subheaders: reserve caret space (invisible) so the
          // label aligns with caret-bearing headers.
          const caretWrap = document.createElement('div');
          caretWrap.className = 'toc-caret-wrap toc-caret-hidden';
          const caretLine = document.createElement('div');
          caretLine.className = 'toc-caret-line';
          const caret = document.createElement('span');
          caret.className = 'toc-caret';
          caret.textContent = '▸';
          caretLine.appendChild(caret);
          caretWrap.appendChild(caretLine);
          caretWrap.appendChild(document.createElement('div'));
          titleEl.appendChild(caretWrap);

          const labelEl = document.createElement('span');
          labelEl.className = 'toc-label';
          labelEl.textContent = label;
          labelEl.addEventListener('click', () => {
            const target = document.getElementById('entry-' + obj.id);
            if (target) scrollToEl(target);
          });
          titleEl.appendChild(labelEl);
          wrapEl.appendChild(titleEl);
          if (currentSection) currentSection.appendChild(wrapEl);
          else curListWrap.appendChild(wrapEl);
          currentHeader = null;
        }
      } else if (kind === 'subheader') {
        const wrapEl = document.createElement('div');
        wrapEl.className = 'toc-subheader';

        const titleEl = document.createElement('div');
        titleEl.className = 'toc-section-title toc-kind-subheader';
        titleEl.setAttribute('data-target', 'entry-' + obj.id);

        // Reserve caret space (invisible) so the label aligns with headers.
        const caretWrap = document.createElement('div');
        caretWrap.className = 'toc-caret-wrap toc-caret-hidden';
        const caretLine = document.createElement('div');
        caretLine.className = 'toc-caret-line';
        const caret = document.createElement('span');
        caret.className = 'toc-caret';
        caret.textContent = '▸';
        caretLine.appendChild(caret);
        caretWrap.appendChild(caretLine);
        caretWrap.appendChild(document.createElement('div'));
        titleEl.appendChild(caretWrap);

        const labelEl = document.createElement('span');
        labelEl.className = 'toc-label';
        labelEl.textContent = label;
        labelEl.addEventListener('click', () => {
          const target = document.getElementById('entry-' + obj.id);
          if (target) scrollToEl(target);
        });
        titleEl.appendChild(labelEl);
        wrapEl.appendChild(titleEl);

        if (currentHeader) currentHeader.appendChild(wrapEl);
        else if (currentSection) currentSection.appendChild(wrapEl);
        else curListWrap.appendChild(wrapEl);
      } else {
        // Plain entries (kind 'entry' or any other) are content blocks:
        // they carry no TOC title and never appear in the table of contents.
        return;
      }
    });

    // Appendix link — rendered as a chapter-level entry in the TOC.
    if (layout.appendix) {
      const appDiv = document.createElement('div');
      appDiv.className = 'toc-chapter toc-appendix open';
      const titleEl = document.createElement('div');
      titleEl.className = 'toc-chapter-title toc-appendix-title';

      // Appendix caret spacer — same two-div structure as chapter caret.
      const spacerWrap = document.createElement('div');
      spacerWrap.className = 'toc-caret-wrap';
      const spacerLine = document.createElement('div');
      spacerLine.className = 'toc-caret-line';
      const spacer = document.createElement('span');
      spacer.className = 'toc-caret toc-caret-spacer';
      spacer.textContent = '▸';
      spacerLine.appendChild(spacer);
      spacerWrap.appendChild(spacerLine);
      spacerWrap.appendChild(document.createElement('div'));

      const labelEl = document.createElement('span');
      labelEl.className = 'toc-label';
      labelEl.textContent = layout.appendix.title || 'Appendix';
      titleEl.appendChild(spacerWrap);
      titleEl.appendChild(labelEl);
      titleEl.addEventListener('click', () => {
        var target = (typeof PageNumbers !== 'undefined' && PageNumbers.getAppendixPage)
          ? PageNumbers.getAppendixPage()
          : document.getElementById('appendix');
        scrollToEl(target);
      });
      appDiv.appendChild(titleEl);
      sidebar.appendChild(appDiv);
    }
  }

  // ── Chapters (flat grid-card placeholders) ──
   // renderChapters() emits flat title cards (chapter titles)
   // and entry placeholders as direct children of #chapters-container.
  // PageNumbers.layOut() later moves each card by id into the appropriate
  // .page and applies absolute pixel coords from its grid placement.
  function teardownPages() {
    const main = document.getElementById('main-content');
    const prior = main?.querySelector('.pages');
    if (!prior) return;
    // Extract the appendix first: it also carries .grid-card, so the
    // generic grid-card sweep below must not claim it (or it would be
    // wiped by the container reset in renderChapters).
    const ap = prior.querySelector('#appendix');
    if (ap) main.appendChild(ap);
    const container = document.getElementById('chapters-container');
    if (container) {
      prior.querySelectorAll('.grid-card').forEach(c => container.appendChild(c));
    }
    prior.remove();
  }

  function renderChapters() {
    teardownPages();
    const container = document.getElementById('chapters-container');
    if (container) container.removeAttribute('hidden-flat');
    if (!container) return;
    container.innerHTML = '';

     // Flat model: every item (chapter/section/header/subheader/entry) is
     // an entry in layout.entries, rendered in array order. All of them
     // load and display their own HTML file — a chapter is just an entry
     // of kind 'chapter', nothing special. `kind` only drives TOC nesting.
    (layout.entries || []).forEach(item => {
      const kind = item.kind || 'entry';
      const label = item.sidebarTitle || item.title || item.id.replace(/-/g, ' ');

      const entryDiv = document.createElement('div');
      entryDiv.className = 'grid-card entry loading' + (item.hidden ? ' entry-hidden' : '');
      entryDiv.id = 'entry-' + item.id;
      entryDiv.setAttribute('data-entry-id', item.id);
      entryDiv.dataset.itemId = item.id;
      entryDiv.dataset.itemType = 'entry';
      entryDiv.dataset.kind = kind;
      entryDiv.textContent = 'Loading ' + label + '...';
      container.appendChild(entryDiv);
    });
  }

  // ── Appendix ──────────────────────────────
  async function renderAppendix() {
    if (!layout.appendix) return;
    const appendix = document.getElementById('appendix');
    appendix.style.display = '';
    document.getElementById('appendix-title').textContent = layout.appendix.title || 'Appendix';

    try {
      const resp = await fetch('/api/appendix');
      if (!resp.ok) throw new Error(resp.status);
      appendixData = await resp.json();
    } catch {
      appendixData = { terms: [] };
    }
    renderAppendixFromData(appendixData);
  }

  function renderAppendixFromData(data) {
    const indexDiv = document.getElementById('appendix-index');
    if (!indexDiv) return;
    indexDiv.innerHTML = '';

    const sorted = [...(data.terms || [])].sort((a, b) =>
      a.term.localeCompare(b.term, 'en', { sensitivity: 'base' })
    );

    // Group terms by name
    const grouped = new Map();
    sorted.forEach(t => {
      const key = t.term.toLowerCase();
      if (!grouped.has(key)) {
        grouped.set(key, { term: t.term, refs: [] });
      }
      grouped.get(key).refs.push({ entry: t.entry, location: t.location });
    });

    let currentLetter = '';
    for (const [_, g] of grouped) {
      const first = g.term.charAt(0).toUpperCase();
      if (first !== currentLetter) {
        currentLetter = first;
        const letterDiv = document.createElement('div');
        letterDiv.className = 'appendix-letter';
        letterDiv.textContent = first;
        indexDiv.appendChild(letterDiv);
      }

      const entry = document.createElement('div');
      entry.className = 'appendix-entry';
      const termSpan = document.createElement('span');
      termSpan.className = 'term';
      termSpan.textContent = g.term;
      entry.appendChild(termSpan);

      // Middle grid column is empty — dots are a background pattern on .appendix-entry
      entry.appendChild(document.createElement('span'));

      const hasPageNumbers = PageNumbers && typeof PageNumbers.getPageForEntry === 'function';

      // Sort refs by page number (lowest to highest)
      const sortedRefs = [...g.refs].sort((a, b) => {
        const pageA = hasPageNumbers ? PageNumbers.getPageForEntry(a.entry) : null;
        const pageB = hasPageNumbers ? PageNumbers.getPageForEntry(b.entry) : null;
        const numA = (pageA && pageA !== '?') ? parseInt(pageA, 10) : Infinity;
        const numB = (pageB && pageB !== '?') ? parseInt(pageB, 10) : Infinity;
        return numA - numB;
      });

      const refsSpan = document.createElement('span');
      refsSpan.className = 'refs';
      sortedRefs.forEach((ref, i) => {
        if (i > 0) refsSpan.appendChild(document.createTextNode(', '));

        const page = hasPageNumbers ? PageNumbers.getPageForEntry(ref.entry) : null;
        const label = (page && page !== '?') ? page : ref.location;

        const a = document.createElement('a');
        a.href = '#entry-' + ref.entry;
        a.textContent = label;
        a.addEventListener('click', (e) => {
          const target = document.querySelector(a.getAttribute('href'));
          if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.style.transition = 'background 0.3s';
            target.style.background = 'var(--highlight)';
            setTimeout(() => { target.style.background = ''; }, 2000);
          }
        });
        refsSpan.appendChild(a);
      });
      entry.appendChild(refsSpan);
      indexDiv.appendChild(entry);
    }
  }

  // ── Lazy Loading ──────────────────────────
  const ENTRY_DIR = 'data/entries/';

  async function loadEntry(entryEl) {
    const entryId = entryEl.dataset.entryId;
    if (!entryId || entryEl.dataset.loaded) return;
    try {
      const resp = await fetch(ENTRY_DIR + entryId + '.html');
      if (!resp.ok) throw new Error(resp.status);
      populateEntry(entryEl, entryId, await resp.text());
    } catch (err) {
       // Auto-heal missing HTML files (chapters included) so every entry
      // renders its own content rather than an error. createEntry is a
      // no-op (409) when the file already exists.
      try {
        await API.createEntry(entryId, entryId.replace(/-/g, ' '));
        const resp2 = await fetch(ENTRY_DIR + entryId + '.html');
        if (resp2.ok) {
          populateEntry(entryEl, entryId, await resp2.text());
          return;
        }
      } catch (_) { /* fall through */ }
      entryEl.innerHTML = '<p style="color:var(--negative)">Failed to load: ' + esc(entryId) + '</p>';
      entryEl.classList.remove('loading');
      if (typeof StructureUI !== 'undefined' && StructureUI.checkOverflow) {
        StructureUI.checkOverflow(entryEl.closest('.grid-card') || entryEl);
      }
    }
  }

  function populateEntry(entryEl, entryId, html) {
    cacheContent(entryId, html);
    entryEl.innerHTML = html;
    entryEl.classList.remove('loading');
    entryEl.dataset.loaded = 'true';
    // Content can arrive after edit mode's initial overflow sweep; re-check
    // now so a card that overflows only once its HTML loads gets flagged.
    if (typeof StructureUI !== 'undefined' && StructureUI.checkOverflow) {
      StructureUI.checkOverflow(entryEl.closest('.grid-card') || entryEl);
    }

    const temp = document.createElement('div');
    temp.innerHTML = html;
    const text = temp.textContent || temp.innerText || '';
    const heading = temp.querySelector('h2');
    const data = {
      id: entryId,
      title: heading ? heading.textContent : entryId.replace(/-/g, ' '),
      text: text,
      chapter: findChapterForEntry(entryId)
    };
    const existing = searchIndex.find(en => en.id === entryId);
    if (existing) Object.assign(existing, data);
    else searchIndex.push(data);
  }

  async function loadAllEntries() {
    const entryEls = document.querySelectorAll('#chapters-container .entry.loading');
    const loads = Array.from(entryEls).map(el => loadEntry(el));
    return Promise.allSettled(loads).then(() => undefined);
  }

  function setupLazyLoading() {
    // In the grid-driven model all entries load eagerly via loadAllEntries().
  }

  function findChapterForEntry(entryId) {
    let current = '';
    for (const obj of (layout.entries || [])) {
      const kind = obj.kind || 'entry';
       if (kind === 'chapter') {
        current = obj.sidebarTitle || obj.title || obj.id;
      } else if (obj.id === entryId) {
        return current;
      }
    }
    return '';
  }

  // ── Active TOC highlight ──────────────────
  let activeTOCObserver = null;
  function setupActiveTOC() {
    if (activeTOCObserver) {
      activeTOCObserver.disconnect();
      activeTOCObserver = null;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(observed => {
        if (observed.isIntersecting && !observed.target.classList.contains('placing')) {
          const id = observed.target.id;
          document.querySelectorAll('.toc-section-title.active').forEach(el => el.classList.remove('active'));
          const tocItem = document.querySelector(`.toc-section-title[data-target="${id}"]`);
          if (tocItem) tocItem.classList.add('active');
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });

    document.querySelectorAll('.grid-card[data-entry-id]').forEach(el => {
      if (!el.classList.contains('placing')) observer.observe(el);
    });
    activeTOCObserver = observer;
  }

  // ── Scroll Position ───────────────────────
  function restoreScrollPosition() {
    const main = document.getElementById('main-content');
    const saved = sessionStorage.getItem('rulebook-scroll');
    if (saved) {
      requestAnimationFrame(() => {
        main.scrollTo(0, parseInt(saved, 10));
      });
    }
    window.addEventListener('beforeunload', () => {
      sessionStorage.setItem('rulebook-scroll', main.scrollTop);
    });
  }

  // ── Helpers ───────────────────────────────
  // Force the zoom layer to fully re-rasterise. #main-content carries CSS
  // `zoom`, so the browser caches a rasterised layer of the entire content
  // subtree on that element. When a card is resized (a size change) or
  // overflow flips during an in-place rebuild, that cached raster keeps the
  // stale paint (e.g. overflowing content that should now be clipped) — only
  // a full reload repaints it.
  //
  // Invalidating a *child* (.pages) does nothing: the cache lives on the
  // #main-content zoom layer itself. A same-tick nudge also gets coalesced
  // into a no-op. The reliable fix is to hide #main-content synchronously
  // (committing the teardown), then restore it on the NEXT frame via
  // requestAnimationFrame — that genuine frame boundary forces the zoom
  // layer to be destroyed and re-rasterised from the corrected DOM/CSS.
  function forceRepaint() {
    const main = document.getElementById('main-content');
    if (!main) return;
    const prev = main.style.display;
    main.style.display = 'none';
    void main.offsetHeight;
    requestAnimationFrame(() => {
      main.style.display = prev;
    });
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    setLayout,
    getLayout,
    getSearchIndex,
    clearSearchIndex,
    getAppendixData,
    setAppendixData,
    renderTOC,
    renderChapters,
    renderAppendix,
    renderAppendixFromData,
    setupLazyLoading,
    loadAllEntries,
    setupActiveTOC,
    restoreScrollPosition,
    findChapterForEntry,
    teardownPages,
    forceRepaint,
    esc,
    cacheContent,
    getCachedContent,
    setCachedContent,
    clearContentCache,
    snapshotContentCache,
    restoreContentCache,
    // Stamp cached HTML into the cards currently rendered from the layout
    // model. Used by client-side undo/redo so a re-render never needs to
    // refetch entry content from the server.
    populateFromCache: function () {
      document.querySelectorAll('#chapters-container .entry[data-entry-id]').forEach(el => {
        const id = el.dataset.entryId;
        const html = contentCache.get(id);
        if (html != null) {
          el.innerHTML = html;
          el.classList.remove('loading');
          el.dataset.loaded = 'true';
        }
      });
    }
  };
})();
