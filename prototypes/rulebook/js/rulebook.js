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

    SearchUI.setup();
    EditMode.setup();
    IndexEditor.setup();
    ContentEditor.init();
    Renderer.restoreScrollPosition();
    Renderer.setupActiveTOC();
  }

  function setupZoom() {
    var zoom = 1.0;
    var prevZoom = 1.0;
    var step = 0.1;
    var min = 0.5;
    var max = 3.0;
    var main = document.getElementById('main-content');
    var label = document.getElementById('zoom-label');

    var scrollAnim = null;
    var scrollTarget = null;
    function animateScroll(target, duration) {
      scrollTarget = target;
      if (scrollAnim) cancelAnimationFrame(scrollAnim);
      var start = window.scrollY;
      var change = target - start;
      if (change === 0) { scrollAnim = null; return; }
      var startTime = null;
      function step(ts) {
        if (startTime === null) startTime = ts;
        var p = Math.min(1, (ts - startTime) / duration);
        var eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        window.scrollTo(0, start + change * eased);
        if (p < 1) scrollAnim = requestAnimationFrame(step);
        else scrollAnim = null;
      }
      scrollAnim = requestAnimationFrame(step);
    }

    function update() {
      var scrollY = window.scrollY || document.documentElement.scrollTop;
      var viewH = window.innerHeight;
      var viewportCenter = scrollY + viewH / 2;

      main.style.zoom = zoom;

      var ratio = zoom / prevZoom;
      var newScrollY = viewportCenter * ratio - viewH / 2;
      window.scrollTo(0, Math.max(0, newScrollY));

      prevZoom = zoom;
      label.textContent = Math.round(zoom * 100) + '%';
    }

    document.getElementById('zoom-in').addEventListener('click', function() {
      if (zoom + step <= max) { zoom += step; update(); }
    });

    document.getElementById('zoom-out').addEventListener('click', function() {
      if (zoom - step >= min) { zoom -= step; update(); }
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
        if (scrollAnim === null && scrollTarget !== null && Math.abs(window.scrollY - scrollTarget) > 4) {
          scrollTarget = null;
        }
        var base = (scrollAnim !== null && scrollTarget !== null) ? scrollTarget : window.scrollY;
        var eps = 2;
        var target = null;
        if (dy < 0) {
          for (var i = pages.length - 1; i >= 0; i--) {
            var top = pages[i].getBoundingClientRect().top + window.scrollY;
            if (top < base - eps) { target = top; break; }
          }
        } else {
          for (var j = 0; j < pages.length; j++) {
            var t = pages[j].getBoundingClientRect().top + window.scrollY;
            if (t > base + eps) { target = t; break; }
          }
        }
        if (target === null) return;
        animateScroll(target, 250);
      }
    }, { passive: false });

    var viewToggle = document.getElementById('view-toggle');
    var bookMode = false;
    viewToggle.addEventListener('click', function() {
      bookMode = !bookMode;
      var pagesEl = document.querySelector('#main-content .pages');
      var mainEl = document.getElementById('main-content');
      if (pagesEl) pagesEl.classList.toggle('book-mode', bookMode);
      if (mainEl) mainEl.classList.toggle('book-mode', bookMode);
      viewToggle.classList.toggle('active', bookMode);
      viewToggle.setAttribute('aria-pressed', bookMode ? 'true' : 'false');
      viewToggle.textContent = bookMode ? '▤' : '▭';
      viewToggle.title = bookMode ? 'Single page view' : 'Book view';
    });
  }

  init();
  setupZoom();
})();
