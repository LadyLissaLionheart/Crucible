const IndexEditor = (() => {
  'use strict';

  let terms = [];

  // ── Setup ──────────────────────────────────
  function setup() {
    const rebuildBtn = document.getElementById('rebuild-btn');
    if (rebuildBtn) rebuildBtn.addEventListener('click', EditMode.rebuildIndex);
  }

  // Called by edit-mode when entering edit mode
  function enable() {
    terms = [...((Renderer.getAppendixData() || {}).terms || [])];
    renderTerms();
  }

  // Re-render the term list from the CURRENT `terms` without resetting them
  // (used by undo/redo, which restores `terms` externally beforehand).
  function render() {
    renderTerms();
  }

  function disable() {
    const container = document.getElementById('appendix-index');
    // Restore normal rendering
    Renderer.renderAppendixFromData(Renderer.getAppendixData() || { terms: [] });
  }

  function renderTerms() {
    const container = document.getElementById('appendix-index');
    container.innerHTML = '';

    // Add new term form
    const form = document.createElement('div');
    form.style.cssText = 'margin-bottom:1rem;padding:0.5rem;background:#f0f0f0;border-radius:4px;';
    form.innerHTML = `
      <strong style="font-size:0.8rem;">Add index term</strong>
      <div style="display:flex;gap:0.5rem;margin-top:0.3rem;flex-wrap:wrap;">
        <input type="text" id="idx-term-input" placeholder="Term" style="flex:2;min-width:120px;padding:0.2rem 0.4rem;font-size:0.8rem;border:1px solid #ccc;border-radius:3px;">
        <input type="text" id="idx-entry-input" placeholder="Entry ID" style="flex:1;min-width:80px;padding:0.2rem 0.4rem;font-size:0.8rem;border:1px solid #ccc;border-radius:3px;">
        <input type="text" id="idx-location-input" placeholder="Location" style="flex:1;min-width:80px;padding:0.2rem 0.4rem;font-size:0.8rem;border:1px solid #ccc;border-radius:3px;">
        <button class="struct-btn" id="idx-add-btn" style="padding:0.2rem 0.6rem;">Add</button>
      </div>
    `;
    container.appendChild(form);

    document.getElementById('idx-add-btn').addEventListener('click', addTerm);

    // Term list
    const list = document.createElement('div');
    list.id = 'idx-term-list';
    list.style.cssText = 'display:flex;flex-direction:column;gap:0.25rem;';
    container.appendChild(list);

    rebuildList();
  }

  function rebuildList() {
    const list = document.getElementById('idx-term-list');
    if (!list) return;
    list.innerHTML = '';

    const sorted = [...terms].sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));

    sorted.forEach((t, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:0.5rem;padding:0.25rem 0.5rem;border-bottom:1px solid #eee;font-size:0.8rem;';
      row.innerHTML = `
        <span style="flex:2;font-weight:600;">${esc(t.term)}</span>
        <span style="flex:1;color:#666;">${esc(t.entry)}</span>
        <span style="flex:1;color:#666;">${esc(t.location)}</span>
      `;
      const delBtn = document.createElement('button');
      delBtn.className = 'struct-btn danger';
      delBtn.textContent = 'X';
      delBtn.style.cssText = 'padding:0.1rem 0.3rem;font-size:0.65rem;';
      delBtn.setAttribute('data-tooltip', 'Delete term');
      delBtn.addEventListener('click', () => {
        terms.splice(terms.indexOf(t), 1);
        rebuildList();
        if (typeof EditMode !== 'undefined' && EditMode.setDirty) EditMode.setDirty();
        if (typeof History !== 'undefined' && History.commit) History.commit('delete index term');
      });
      row.appendChild(delBtn);
      list.appendChild(row);
    });
  }

  function addTerm() {
    const term = document.getElementById('idx-term-input').value.trim();
    const entry = document.getElementById('idx-entry-input').value.trim();
    const location = document.getElementById('idx-location-input').value.trim();
    if (!term) return;

    // Find entry ID if empty
    const entryId = entry || term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const loc = location || entryId;

    terms.push({ term, entry: entryId, location: loc });
    document.getElementById('idx-term-input').value = '';
    document.getElementById('idx-entry-input').value = '';
    document.getElementById('idx-location-input').value = '';
    rebuildList();
    if (typeof EditMode !== 'undefined' && EditMode.setDirty) EditMode.setDirty();
    if (typeof History !== 'undefined' && History.commit) History.commit('add index term');
  }

  async function save() {
    const data = { terms };
    try {
      await API.saveAppendix(data);
      Renderer.setAppendixData(data);
      return true;
    } catch (err) {
      Popup.alert({
        message: 'Failed to save index: ' + err.message,
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      });
      return false;
    }
  }

  function getTerms() { return terms; }
  function setTerms(t) { terms = t; }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { setup, enable, disable, render, save, getTerms, setTerms, addTerm };
})();
