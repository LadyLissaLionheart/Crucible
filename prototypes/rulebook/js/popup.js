const Popup = (() => {
  'use strict';

  let activePopup = null;

  function dismiss(result) {
    if (!activePopup) return;
    const { overlay, el, resolve } = activePopup;
    overlay.remove();
    el.remove();
    activePopup = null;
    resolve(result);
  }

  function position(el, x, y) {
    const gap = 10;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const popupW = el.offsetWidth || 240;
    const popupH = el.offsetHeight || 80;

    // Prefer above the mouse
    let top = y - gap - popupH;
    let above = true;
    if (top < 0) {
      top = y + gap;
      above = false;
    }

    // Clamp vertical within viewport
    if (top + popupH > viewH) top = viewH - popupH - 4;
    if (top < 4) top = 4;

    // Center horizontally on mouse, clamp to viewport edges
    let left = x - popupW / 2;
    if (left < 4) left = 4;
    if (left + popupW > viewW - 4) left = viewW - popupW - 4;

    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.transform = 'none';
    el.classList.toggle('popup--above', above);

    // Arrow points to the click x, clamped within the popup
    const arrowPad = 14;
    let arrowX = x - left;
    arrowX = Math.max(arrowPad, Math.min(popupW - arrowPad, arrowX));
    el.style.setProperty('--arrow-x', arrowX + 'px');
  }

  function create(opts) {
    return new Promise((resolve) => {
      if (activePopup) dismiss(null);

      const overlay = document.createElement('div');
      overlay.className = 'popup-overlay';

      const el = document.createElement('div');
      el.className = 'popup';

      const msg = document.createElement('p');
      msg.className = 'popup-message';
      msg.textContent = opts.message;
      el.appendChild(msg);

      const actions = document.createElement('div');
      actions.className = 'popup-actions';

      if (opts.cancelText) {
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = opts.cancelText;
        cancelBtn.addEventListener('click', () => dismiss(false));
        actions.appendChild(cancelBtn);
      }

      const confirmBtn = document.createElement('button');
      confirmBtn.className = opts.confirmClass || 'popup-confirm';
      confirmBtn.textContent = opts.confirmText || 'OK';
      confirmBtn.addEventListener('click', () => dismiss(true));
      actions.appendChild(confirmBtn);

      el.appendChild(actions);
      document.body.appendChild(overlay);
      document.body.appendChild(el);

      activePopup = { overlay, el, resolve };

      // Position after render so offsetWidth/Height are available
      requestAnimationFrame(() => position(el, opts.x, opts.y));

      overlay.addEventListener('click', () => dismiss(false));

      const onKey = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onKey);
          dismiss(false);
        }
      };
      document.addEventListener('keydown', onKey);

      confirmBtn.focus();
    });
  }

  function confirm({ message, x, y, confirmText, cancelText, confirmClass }) {
    return create({
      message,
      x: x || 0,
      y: y || 0,
      confirmText: confirmText || 'Confirm',
      cancelText: cancelText || 'Cancel',
      confirmClass
    });
  }

  function alert({ message, x, y, buttonText }) {
    return create({
      message,
      x: x || 0,
      y: y || 0,
      confirmText: buttonText || 'OK',
      cancelText: null
    });
  }

  return { confirm, alert };
})();

window.Popup = Popup;
