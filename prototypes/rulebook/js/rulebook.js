(function() {
  'use strict';

  async function init() {
    try {
      const layout = await API.getLayout();
      Renderer.setLayout(layout);
    } catch (err) {
      document.getElementById('chapters-container').innerHTML =
        '<p style="color:var(--negative)">Error loading layout.json. Is the server running? (npm start)</p>';
      return;
    }

    const layout = Renderer.getLayout();

    Renderer.renderTOC();
    Renderer.renderChapters();

    // Load all entries before paginating (entries must be in DOM)
    await Renderer.loadAllEntries();

    await Renderer.renderAppendix();

    // Flow the flat DOM into discrete letter-sized .page cards.
    PageNumbers.paginate();
    PageNumbers.stampPageNumbers();

    Tooltip.init();
    SearchUI.setup();
    EditMode.setup();
    IndexEditor.setup();
    ContentEditor.init();
    Renderer.restoreScrollPosition();
    Renderer.setupActiveTOC();
  }

  function setupZoom() {
    var saved = parseFloat(localStorage.getItem('rulebook-zoom'));
    var zoom = (saved && saved >= 0.5 && saved <= 3.0) ? saved : 1.0;
    var prevZoom = zoom;
    var step = 0.1;
    var min = 0.5;
    var max = 3.0;
    var main = document.getElementById('main-content');
    var labels = [
      document.getElementById('zoom-label'),
      document.getElementById('zoom-label-bottom')
    ].filter(Boolean);

    var scrollAnim = null;
    var scrollTarget = null;
    function animateScroll(target, duration) {
      scrollTarget = target;
      if (scrollAnim) cancelAnimationFrame(scrollAnim);
      var start = main.scrollTop;
      var change = target - start;
      if (change === 0) { scrollAnim = null; return; }
      var startTime = null;
      function step(ts) {
        if (startTime === null) startTime = ts;
        var p = Math.min(1, (ts - startTime) / duration);
        var eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        main.scrollTo(0, start + change * eased);
        if (p < 1) scrollAnim = requestAnimationFrame(step);
        else scrollAnim = null;
      }
      scrollAnim = requestAnimationFrame(step);
    }

    function update() {
      var scrollY = main.scrollTop;
      var viewH = main.clientHeight;
      var viewportCenter = scrollY + viewH / 2;

      main.style.zoom = zoom;
      void main.scrollWidth;
      localStorage.setItem('rulebook-zoom', zoom);
      if (typeof StructureUI !== 'undefined' && StructureUI.scheduleSyncFixedUI) StructureUI.scheduleSyncFixedUI();

      var ratio = zoom / prevZoom;
      var newScrollY = viewportCenter * ratio - viewH / 2;
      main.scrollTo(0, Math.max(0, newScrollY));

      prevZoom = zoom;
      labels.forEach(function (l) {
        l.querySelector('.zoom-value').textContent = Math.round(zoom * 100) + '%';
      });
    }

    ['zoom-in', 'zoom-in-bottom'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function() {
        if (zoom + step <= max) { zoom += step; update(); }
      });
    });

    ['zoom-out', 'zoom-out-bottom'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function() {
        if (zoom - step >= min) { zoom -= step; update(); }
      });
    });

    window.addEventListener('wheel', function(e) {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          if (zoom + step <= max) { zoom += step; update(); }
        } else if (e.deltaY > 0) {
          if (zoom - step >= min) { zoom -= step; update(); }
        }
        return;
      }

      if (e.shiftKey) {
        e.preventDefault();
        var dy = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        if (dy === 0) return;
        var pages = Array.prototype.slice.call(document.querySelectorAll('#main-content .page'));
        if (!pages.length) return;
        if (scrollAnim === null && scrollTarget !== null && Math.abs(main.scrollTop - scrollTarget) > 4) {
          scrollTarget = null;
        }
        var base = (scrollAnim !== null && scrollTarget !== null) ? scrollTarget : main.scrollTop;
        var eps = 2;
        var target = null;
        if (dy < 0) {
          for (var i = pages.length - 1; i >= 0; i--) {
            var top = pages[i].offsetTop;
            if (top < base - eps) { target = top; break; }
          }
        } else {
          for (var j = 0; j < pages.length; j++) {
            var t = pages[j].offsetTop;
            if (t > base + eps) { target = t; break; }
          }
        }
        if (target === null) return;
        animateScroll(target, 250);
      }
    }, { passive: false });

    var viewButtons = [
      { single: document.getElementById('view-single'), book: document.getElementById('view-book') },
      { single: document.getElementById('view-single-bottom'), book: document.getElementById('view-book-bottom') }
    ].filter(function (pair) { return pair.single && pair.book; });
    var bookMode = false;
    function applyView(mode) {
      bookMode = mode;
      var pagesEl = document.querySelector('#main-content .pages');
      var mainEl = document.getElementById('main-content');
      if (pagesEl) pagesEl.classList.toggle('book-mode', bookMode);
      if (mainEl) mainEl.classList.toggle('book-mode', bookMode);
      viewButtons.forEach(function (pair) {
        pair.single.classList.toggle('active', !bookMode);
        pair.book.classList.toggle('active', bookMode);
        pair.single.setAttribute('aria-pressed', bookMode ? 'false' : 'true');
        pair.book.setAttribute('aria-pressed', bookMode ? 'true' : 'false');
      });
    }
    viewButtons.forEach(function (pair) {
      pair.single.addEventListener('click', function() { applyView(false); });
      pair.book.addEventListener('click', function() { applyView(true); });
    });

    function bindToggle(toggleId, barId, storageKey) {
      var actionBarToggle = document.getElementById(toggleId);
      var actionBar = document.getElementById(barId);
      if (!actionBarToggle || !actionBar) return;
      if (localStorage.getItem(storageKey) === 'true') {
        actionBar.classList.add('expanded');
      }
      actionBarToggle.addEventListener('click', function() {
        actionBar.classList.toggle('expanded');
        localStorage.setItem(storageKey, actionBar.classList.contains('expanded'));
        Tooltip.setTooltip(actionBarToggle, actionBar.classList.contains('expanded') ? 'Collapse toolbar' : 'Expand toolbar');
      });
      Tooltip.setTooltip(actionBarToggle, actionBar.classList.contains('expanded') ? 'Collapse toolbar' : 'Expand toolbar');
    }
    bindToggle('action-bar-toggle', 'action-bar', 'rulebook-action-bar-expanded');
    bindToggle('action-bar-toggle-bottom', 'action-bar-bottom', 'rulebook-action-bar-bottom-expanded');
  }

  init();
  setupZoom();
})();
