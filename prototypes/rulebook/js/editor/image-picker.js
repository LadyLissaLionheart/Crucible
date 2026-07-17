const ImagePicker = (() => {
  'use strict';

  let active = null;

  function close(result) {
    if (!active) return;
    const { overlay, el } = active;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    el.remove();
    active = null;
    document.body.classList.remove('img-picker-open');
    resolveRef(result);
  }

  let resolveRef = null;
  function onKey(e) {
    if (e.key === 'Escape') close(null);
  }

  function tile(filename, url) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'img-tile';
    btn.dataset.name = filename.toLowerCase();

    const thumb = document.createElement('span');
    thumb.className = 'img-thumb';
    const img = document.createElement('img');
    img.src = url;
    img.alt = filename;
    img.loading = 'lazy';
    img.draggable = false;
    thumb.appendChild(img);

    const name = document.createElement('span');
    name.className = 'img-name';
    name.textContent = filename;
    name.title = filename;

    btn.appendChild(thumb);
    btn.appendChild(name);

    btn.addEventListener('click', () => close({ filename, url }));
    return btn;
  }

  function renderGrid(grid, images, query) {
    grid.innerHTML = '';
    const q = (query || '').trim().toLowerCase();
    const list = q
      ? images.filter(im => im.filename.toLowerCase().includes(q))
      : images;

    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'img-picker-empty';
      empty.textContent = q
        ? 'No images match "' + q + '".'
        : 'No images uploaded yet. Use the Upload button to add some.';
      grid.appendChild(empty);
      return;
    }

    list.forEach(im => grid.appendChild(tile(im.filename, im.url)));
  }

  function open() {
    return new Promise((resolve) => {
      if (active) close(null);
      resolveRef = resolve;

      const overlay = document.createElement('div');
      overlay.className = 'img-picker-overlay';

      const el = document.createElement('div');
      el.className = 'img-picker';

      // Header
      const header = document.createElement('div');
      header.className = 'img-picker-header';
      const title = document.createElement('span');
      title.className = 'img-picker-title';
      title.textContent = 'Select an image';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'img-picker-close';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.innerHTML = '&times;';
      closeBtn.addEventListener('click', () => close(null));
      header.appendChild(title);
      header.appendChild(closeBtn);

      // Search
      const search = document.createElement('div');
      search.className = 'img-picker-search';
      search.innerHTML =
        '<i class="fa-solid fa-magnifying-glass"></i>';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Search images…';
      input.autocomplete = 'off';
      search.appendChild(input);

      // Grid
      const grid = document.createElement('div');
      grid.className = 'img-picker-grid';

      // Status
      const status = document.createElement('div');
      status.className = 'img-picker-status';
      status.textContent = 'Loading images…';

      el.appendChild(header);
      el.appendChild(search);
      el.appendChild(grid);
      el.appendChild(status);

      document.body.appendChild(overlay);
      document.body.appendChild(el);
      document.body.classList.add('img-picker-open');

      active = { overlay, el };
      document.addEventListener('keydown', onKey);
      overlay.addEventListener('click', () => close(null));

      input.focus();

      API.listImages()
        .then(images => {
          status.textContent = images.length
            ? images.length + ' image' + (images.length === 1 ? '' : 's')
            : 'No images uploaded yet.';
          renderGrid(grid, images, '');
          input.addEventListener('input', () => renderGrid(grid, images, input.value));
        })
        .catch(err => {
          status.textContent = '';
          grid.innerHTML = '';
          const errEl = document.createElement('p');
          errEl.className = 'img-picker-empty';
          errEl.textContent = 'Could not load images: ' + (err.message || 'unknown error') + '.';
          grid.appendChild(errEl);
        });
    });
  }

  return { open };
})();

window.ImagePicker = ImagePicker;
