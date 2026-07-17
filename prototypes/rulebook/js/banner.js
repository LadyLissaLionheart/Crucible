const Banner = (() => {
  'use strict';

  let el = null;
  let msgEl = null;
  let hideTimer = null;

  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'banner';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');

    msgEl = document.createElement('span');
    msgEl.className = 'banner__msg';
    el.appendChild(msgEl);

    const close = document.createElement('button');
    close.className = 'banner__close';
    close.setAttribute('type', 'button');
    close.setAttribute('aria-label', 'Dismiss');
    close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    close.addEventListener('click', hide);
    el.appendChild(close);

    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }

  function show(message, kind) {
    const b = ensure();
    clearTimeout(hideTimer);
    msgEl.textContent = message;
    b.className = 'banner banner--' + (kind || 'progress');
    b.style.display = 'flex';
  }

  function progress(message) { show(message, 'progress'); }

  function success(message) {
    show(message, 'success');
    hideTimer = setTimeout(hide, 10000);
  }

  function error(message) {
    show(message, 'error');
    hideTimer = setTimeout(hide, 10000);
  }

  function hide() {
    clearTimeout(hideTimer);
    if (el) el.style.display = 'none';
  }

  return { show, progress, success, error, hide };
})();

window.Banner = Banner;
