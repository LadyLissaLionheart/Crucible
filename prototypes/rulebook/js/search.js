const SearchUI = (() => {
  'use strict';

  function setup() {
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    const clearBtn = document.getElementById('search-clear');
    let debounce;

    function updateClearBtn() {
      clearBtn.classList.toggle('visible', input.value.length > 0);
    }

    input.addEventListener('input', () => {
      updateClearBtn();
      clearTimeout(debounce);
      debounce = setTimeout(() => doSearch(input.value.trim()), 200);
    });

    input.addEventListener('focus', () => {
      updateClearBtn();
      if (input.value.trim()) doSearch(input.value.trim());
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      updateClearBtn();
      results.classList.remove('active');
      input.focus();
    });

    results.addEventListener('wheel', (e) => {
      e.preventDefault();
      results.scrollTop += e.deltaY;
    }, { passive: false });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box')) {
        results.classList.remove('active');
      }
    });
  }

  function doSearch(query) {
    const resultsEl = document.getElementById('search-results');
    const searchIndex = Renderer.getSearchIndex();
    if (!query || query.length < 2) {
      resultsEl.classList.remove('active');
      return;
    }

    const q = query.toLowerCase();
    const matches = searchIndex
       .filter(entry => entry.text.toLowerCase().includes(q) || entry.header.toLowerCase().includes(q))
      .slice(0, 20);

    if (matches.length === 0) {
      resultsEl.innerHTML = '<div class="search-result-item"><em>No results</em></div>';
    } else {
      resultsEl.innerHTML = matches.map(m => {
        const ctx = getContextSnippet(m.text, q);
        return `<div class="search-result-item" data-entry-id="${esc(m.id)}">
          <div class="search-result-chapter">${esc(m.chapter || '')}</div>
           <div class="search-result-text">${esc(m.header)}: ${ctx}</div>
        </div>`;
      }).join('');
    }

    resultsEl.classList.add('active');

    resultsEl.querySelectorAll('.search-result-item[data-entry-id]').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.entryId;
        const target = document.getElementById('entry-' + id);
        if (target) {
          Renderer.scrollToEl(target);
        }
        resultsEl.classList.remove('active');
      });
    });
  }

  function getContextSnippet(text, query) {
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query);
    if (idx === -1) return '';
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + query.length + 60);
    let snippet = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
    const re = new RegExp('(' + escRegex(query) + ')', 'gi');
    return esc(snippet).replace(new RegExp('(' + escRegex(esc(query)) + ')', 'gi'), '<mark>$1</mark>');
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return { setup, doSearch };
})();
