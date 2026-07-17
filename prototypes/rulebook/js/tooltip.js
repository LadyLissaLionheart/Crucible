const Tooltip = (() => {
  'use strict';

  let el = null;
  let showTimer = null;
  let pendingX = 0;
  let pendingY = 0;
  const DELAY = 100;
  const OFFSET = 14;

  function create() {
    el = document.createElement('div');
    el.className = 'tooltip';
    el.setAttribute('role', 'tooltip');
    el.style.display = 'none';
    document.body.appendChild(el);
  }

  function position() {
    el.style.left = '0';
    el.style.top = '0';
    el.style.display = 'block';

    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    let left = pendingX - tw / 2;
    let top = pendingY - th - OFFSET;

    if (left < 4) left = 4;
    if (left + tw > window.innerWidth - 4) left = window.innerWidth - tw - 4;
    if (top < 4) {
      top = pendingY + OFFSET;
      el.classList.add('tooltip--below');
    } else {
      el.classList.remove('tooltip--below');
    }

    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  function show(e) {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    const text = target.getAttribute('data-tooltip');
    if (!text) return;
    hide();
    pendingX = e.clientX;
    pendingY = e.clientY;
    showTimer = setTimeout(() => {
      el.textContent = text;
      position();
    }, DELAY);
  }

  function hide() {
    clearTimeout(showTimer);
    showTimer = null;
    if (el) {
      el.style.display = 'none';
      el.classList.remove('tooltip--below');
    }
  }

  function onOver(e) {
    show(e);
  }

  function onOut(e) {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    const related = e.relatedTarget;
    if (related && target.contains(related)) return;
    hide();
  }

  function init() {
    create();
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
  }

  function setTooltip(target, text) {
    target.setAttribute('data-tooltip', text);
  }

  return { init, setTooltip };
})();
