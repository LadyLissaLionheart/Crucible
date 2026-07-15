const EditMode = (() => {
  'use strict';

  let active = false;
  let layoutBackup = null;
  let dirty = false;

  function isActive() { return active; }
  function setDirty() {
    dirty = true;
    updateCancelButton();
  }
  function isDirty() { return dirty; }

  function updateCancelButton() {
    const toggle = document.getElementById('edit-toggle');
    if (!toggle || !active) return;
    const contentDirty = typeof ContentEditor !== 'undefined' && ContentEditor.hasUnsavedChanges && ContentEditor.hasUnsavedChanges();
    toggle.textContent = (dirty || contentDirty) ? 'Discard Changes' : 'Finish Editing';
  }

  function setup() {
    const toggle = document.getElementById('edit-toggle');
    toggle.addEventListener('click', (e) => {
      if (!active) {
        active = true;
        document.body.classList.add('edit-mode');
        toggle.classList.add('active');
        layoutBackup = JSON.parse(JSON.stringify(Renderer.getLayout()));
        updateCancelButton();
        const y = window.scrollY;
        Renderer.renderChapters();
        Renderer.loadAllEntries().then(() => {
          PageNumbers.paginate();
          StructureUI.enable();
          window.scrollTo(0, y);
        });
      } else if (dirty) {
        Popup.confirm({
          message: 'You have unsaved changes. Discard them and exit edit mode?',
          x: e.clientX,
          y: e.clientY,
          confirmText: 'Discard & Exit',
          confirmClass: 'popup-danger'
        }).then(confirmed => { if (confirmed) cancelEdit(); });
      } else {
        cancelEdit();
      }
    });

    document.getElementById('save-layout-btn').addEventListener('click', saveAll);
    document.getElementById('cancel-edit-btn').addEventListener('click', saveAndExit);
    document.getElementById('rebuild-btn').addEventListener('click', rebuildIndex);
    document.getElementById('add-entry-btn').addEventListener('click', (e) => {
      if (typeof StructureUI !== 'undefined' && StructureUI.startAddEntry) StructureUI.startAddEntry(e);
    });

    window.addEventListener('beforeunload', (e) => {
      const contentDirty = typeof ContentEditor !== 'undefined' && ContentEditor.hasUnsavedChanges && ContentEditor.hasUnsavedChanges();
      if (!dirty && !contentDirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  async function saveAndExit() {
    const toggle = document.getElementById('edit-toggle');
    StructureUI.syncLayoutFromDOM();
    const layout = Renderer.getLayout();
    try {
      await API.saveLayout(layout);
      // Commit any inline content edits before the view reloads from disk.
      await StructureUI.flushPendingEdits();
    } catch (err) {
      alert('Save failed: ' + err.message + '\n\nChanges were not persisted. Click Cancel & Exit to discard, or Save Layout to retry.');
      return;
    }
    dirty = false;
    active = false;
    document.body.classList.remove('edit-mode');
    toggle.classList.remove('active');
    toggle.textContent = 'Edit Mode';
    updateCancelButton();
    layoutBackup = null;
    StructureUI.disable();
    const y = window.scrollY;
    Renderer.renderChapters();
    Renderer.loadAllEntries().then(() => {
      PageNumbers.paginate();
      PageNumbers.stampPageNumbers();
      Renderer.setupActiveTOC();
      window.scrollTo(0, y);
    });
  }

  async function saveAll() {
    StructureUI.syncLayoutFromDOM();
    const layout = Renderer.getLayout();
    try {
      await API.saveLayout(layout);
      await StructureUI.flushPendingEdits();
      dirty = false;
      updateCancelButton();
      const y = window.scrollY;
      Renderer.renderChapters();
      Renderer.loadAllEntries().then(() => {
        PageNumbers.paginate();
        PageNumbers.stampPageNumbers();
        Renderer.setupActiveTOC();
        StructureUI.enable();
        window.scrollTo(0, y);
      });
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  }

  function cancelEdit() {
    // Drop buffered inline edits — the reload from disk below discards them.
    StructureUI.clearPendingEdits();
    if (layoutBackup) {
      Renderer.setLayout(layoutBackup);
      layoutBackup = null;
    }
    dirty = false;
    active = false;
    document.body.classList.remove('edit-mode');
    document.getElementById('edit-toggle').classList.remove('active');
    document.getElementById('edit-toggle').textContent = 'Edit Mode';
    updateCancelButton();
    StructureUI.disable();
    Renderer.renderTOC();
    const y = window.scrollY;
    Renderer.renderChapters();
    Renderer.loadAllEntries().then(() => {
      PageNumbers.paginate();
      PageNumbers.stampPageNumbers();
      Renderer.setupActiveTOC();
      window.scrollTo(0, y);
    });
    Renderer.setupLazyLoading();
  }

  async function rebuildIndex() {
    const terms = [];
    document.querySelectorAll('.entry[data-loaded="true"]').forEach(entryEl => {
      const entryId = entryEl.dataset.entryId;
      const locationStr = Renderer.findChapterForEntry(entryId);

      entryEl.querySelectorAll('h2').forEach(h2 => {
        terms.push({ term: h2.textContent.trim(), entry: entryId, location: locationStr });
      });
      entryEl.querySelectorAll('dt').forEach(dt => {
        terms.push({ term: dt.textContent.trim(), entry: entryId, location: locationStr });
      });
      entryEl.querySelectorAll('p > strong:first-child, li > strong:first-child').forEach(strong => {
        const text = strong.textContent.trim();
        if (text.length > 1 && text.length < 50 && !text.includes('.') && !text.includes('\u2014')) {
          terms.push({ term: text, entry: entryId, location: locationStr });
        }
      });
    });

    const seen = new Set();
    const unique = terms.filter(t => {
      const key = t.term.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    unique.sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));

    const newData = { terms: unique };
    Renderer.setAppendixData(newData);
    Renderer.renderAppendixFromData(newData);

    try {
      await API.saveAppendix(newData);
    } catch (err) {
      alert('Index save failed: ' + err.message);
    }
  }

  return { setup, isActive, saveAll, saveAndExit, rebuildIndex, setDirty, isDirty, updateCancelButton };
})();
