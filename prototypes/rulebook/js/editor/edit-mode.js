const EditMode = (() => {
  'use strict';

  let active = false;
  let layoutBackup = null;
  let dirty = false;

  function isActive() { return active; }
  function setDirty() {
    dirty = true;
    updateCancelButton();
    syncMenuButtons();
  }
  function isDirty() { return dirty; }

  function updateCancelButton() {
    // The toolbar's Finish Editing button has a static label; no refresh needed.
  }

  function syncMenuButtons() {
    const pairs = [
      { edit: 'menu-edit-btn', save: 'save-layout-btn', discard: 'discard-btn', finish: 'finish-edit-btn', undo: 'undo-btn', redo: 'redo-btn' },
      { edit: 'menu-edit-btn-bottom', save: 'save-layout-btn-bottom', discard: 'discard-btn-bottom', finish: 'finish-edit-btn-bottom', undo: 'undo-btn-bottom', redo: 'redo-btn-bottom' }
    ];
    pairs.forEach(({ edit, save, discard, finish, undo, redo }) => {
      const menuEdit = document.getElementById(edit);
      const saveBtn = document.getElementById(save);
      const discardBtn = document.getElementById(discard);
      const finishBtn = document.getElementById(finish);
      const undoBtn = document.getElementById(undo);
      const redoBtn = document.getElementById(redo);
      if (menuEdit) menuEdit.disabled = active;
      if (saveBtn) saveBtn.disabled = !(active && dirty);
      if (discardBtn) discardBtn.disabled = !(active && dirty);
      if (finishBtn) finishBtn.disabled = !active;
      if (undoBtn) undoBtn.disabled = !(active && History.canUndo());
      if (redoBtn) redoBtn.disabled = !(active && History.canRedo());
    });
  }

  function setup() {
    const menuEdit = document.getElementById('menu-edit-btn');

    function contentDirty() {
      return typeof ContentEditor !== 'undefined' && ContentEditor.hasUnsavedChanges && ContentEditor.hasUnsavedChanges();
    }

    function handleEditEnter() {
      if (active) return;
      active = true;
      document.body.classList.add('edit-mode');
      if (typeof Layers !== 'undefined') Layers.setTab('layers');
      layoutBackup = JSON.parse(JSON.stringify(Renderer.getLayout()));
      History.reset();
      updateCancelButton();
      syncMenuButtons();
      const main = document.getElementById('main-content');
      const y = main.scrollTop;
      Renderer.renderChapters();
      Renderer.loadAllEntries().then(() => {
        PageNumbers.paginate();
        StructureUI.enable();
        if (typeof Layers !== 'undefined') Layers.sync();
        main.scrollTo(0, y);
      });
    }

    function handleFinishEditing(e) {
      if (!active) return;
      if (!dirty && !contentDirty()) {
        cancelEdit();
        return;
      }
      Popup.choice({
        message: 'You have unsaved changes, how would you like to proceed?',
        x: e.clientX,
        y: e.clientY,
        options: [
          { text: 'Cancel', value: 'cancel', class: 'popup-cancel' },
          { text: 'Save & Exit', value: 'save', class: 'popup-confirm' },
          { text: 'Discard & Exit', value: 'discard', class: 'popup-danger' }
        ]
      }).then(result => {
        if (result === 'save') saveAndExit();
        else if (result === 'discard') cancelEdit();
      });
    }

    function handleDiscard(e) {
      if (!active) return;
      if (dirty || contentDirty()) {
        Popup.confirm({
          message: 'Discard unsaved changes and revert to the last saved state?',
          x: e.clientX,
          y: e.clientY,
          confirmText: 'Discard',
          confirmClass: 'popup-danger'
        }).then(confirmed => { if (confirmed) discardChanges(); });
      } else {
        discardChanges();
      }
    }

    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };

    bind('menu-edit-btn', handleEditEnter);
    bind('menu-edit-btn-bottom', handleEditEnter);
    bind('finish-edit-btn', handleFinishEditing);
    bind('finish-edit-btn-bottom', handleFinishEditing);

    syncMenuButtons();

    bind('save-layout-btn', saveAll);
    bind('save-layout-btn-bottom', saveAll);
    bind('discard-btn', handleDiscard);
    bind('discard-btn-bottom', handleDiscard);
    bind('rebuild-btn', rebuildIndex);

    // ── Undo / Redo ──
    // The history stores snapshots of the layout model + inline pending
    // edits + index terms. `apply` re-renders the DOM from the restored
    // state and recomputes the dirty flag from the history pointer.
    History.register(rerenderFromHistory, syncMenuButtons);
    bind('undo-btn', () => History.undo());
    bind('undo-btn-bottom', () => History.undo());
    bind('redo-btn', () => History.redo());
    bind('redo-btn-bottom', () => History.redo());

    // ── Undo / Redo hotkeys ──
    // Ctrl/Cmd+Z = undo, Ctrl+Y = redo. Ignored while typing in a field or
    // editing a card inline so native text undo still works there.
    document.addEventListener('keydown', (e) => {
      if (!active) return;
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                t.getAttribute && t.getAttribute('contenteditable') === 'true')) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        History.undo();
      } else if (e.key === 'y') {
        e.preventDefault();
        History.redo();
      }
    });

    if (typeof Layers !== 'undefined') Layers.setup();
    bind('add-entry-btn', (e) => {
      if (typeof StructureUI !== 'undefined' && StructureUI.startAddEntry) StructureUI.startAddEntry(e, 'entry');
    });
    bind('add-entry-btn-bottom', (e) => {
      if (typeof StructureUI !== 'undefined' && StructureUI.startAddEntry) StructureUI.startAddEntry(e, 'entry');
    });

    // ── Add Entry dropdown (choose type) ──
    const addEntrySplit = document.getElementById('add-entry-split');
    const addEntryCaret = document.getElementById('add-entry-caret');
    const addEntryMenu = document.getElementById('add-entry-menu');
    function openAddEntryMenu() {
      if (!addEntryMenu) return;
      addEntryMenu.hidden = false;
      if (addEntryCaret) addEntryCaret.setAttribute('aria-expanded', 'true');
      document.addEventListener('mousedown', onAddEntryOutside, true);
    }
    function closeAddEntryMenu() {
      if (!addEntryMenu) return;
      addEntryMenu.hidden = true;
      if (addEntryCaret) addEntryCaret.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', onAddEntryOutside, true);
    }
    function onAddEntryOutside(e) {
      if (addEntrySplit && !addEntrySplit.contains(e.target)) closeAddEntryMenu();
    }
    if (addEntryCaret) {
      addEntryCaret.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (addEntryMenu && addEntryMenu.hidden) openAddEntryMenu();
        else closeAddEntryMenu();
      });
    }
    if (addEntryMenu) {
      addEntryMenu.querySelectorAll('.add-entry-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const kind = item.dataset.kind || 'entry';
          closeAddEntryMenu();
          if (typeof StructureUI !== 'undefined' && StructureUI.startAddEntry) StructureUI.startAddEntry(e, kind);
        });
      });
    }

    bind('add-image-btn', addImage);
    bind('add-image-btn-bottom', addImage);

    const imageFileInput = document.getElementById('image-file-input');
    const uploadImageBtn = document.getElementById('upload-image-btn');
    if (uploadImageBtn && imageFileInput) {
      const ALLOWED = ['image/jpeg', 'image/png'];
      uploadImageBtn.addEventListener('click', () => imageFileInput.click());
      imageFileInput.addEventListener('change', async () => {
        const file = imageFileInput.files && imageFileInput.files[0];
        imageFileInput.value = '';
        if (!file) return;
        if (!ALLOWED.includes(file.type)) {
          Banner.error('That file type is not allowed. Please choose a JPEG or PNG image.');
          return;
        }
        Banner.progress('Uploading "' + file.name + '"…');
        try {
          const result = await API.uploadImage(file);
          let msg;
          if (result.duplicate) {
            msg = (result.filename === result.previousName)
              ? 'This image was already in the rulebook.'
              : 'This image was already in the rulebook. It has been renamed to "' + result.filename + '".';
          } else {
            msg = 'Upload complete: "' + file.name + '" was saved.';
          }
          try {
            await navigator.clipboard.writeText(window.location.origin + result.url);
            msg += ' Its link is copied to your clipboard.';
          } catch {
            msg += ' You can use it at ' + window.location.origin + result.url + '.';
          }
          Banner.success(msg);
        } catch (err) {
          Banner.error('Upload failed: ' + (err.message || 'the server rejected the file') + '. Please try again.');
        }
      });
    }

    async function addImage() {
      if (typeof ImagePicker === 'undefined') return;
      const img = await ImagePicker.open();
      if (!img) return;
      if (typeof StructureUI !== 'undefined' && StructureUI.startAddImageEntry) {
        StructureUI.startAddImageEntry(img.url);
      }
    }

    window.addEventListener('beforeunload', (e) => {
      if (!dirty && !contentDirty()) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  async function saveAndExit() {
    StructureUI.syncLayoutFromDOM();
    const layout = Renderer.getLayout();
    try {
      await API.saveLayout(layout);
      // Commit any inline content edits before the view reloads from disk,
      // and finalize any deferred entry deletions.
      await StructureUI.flushPendingEdits();
      await StructureUI.finalizeDeletes();
    } catch (err) {
      Popup.alert({
        message: 'Save failed: ' + err.message + '\n\nChanges were not saved. Click Save Layout to retry.',
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      });
      return;
    }
    dirty = false;
    active = false;
    document.body.classList.remove('edit-mode');
    if (typeof Layers !== 'undefined') Layers.setTab('nav');
    updateCancelButton();
    syncMenuButtons();
    layoutBackup = null;
    History.clear();
    StructureUI.disable();
    const main = document.getElementById('main-content');
    const y = main.scrollTop;
    Renderer.renderChapters();
    Renderer.loadAllEntries().then(() => {
      PageNumbers.paginate();
      PageNumbers.stampPageNumbers();
      Renderer.setupActiveTOC();
      if (typeof Layers !== 'undefined') Layers.sync();
      // Force the page stack to repaint so overflow:hidden clips correctly
      // after leaving edit mode — without this the previously-visible
      // overflowing content stays painted until a full refresh.
      Renderer.forceRepaint();
      main.scrollTo(0, y);
    });
  }

  async function saveAll() {
    StructureUI.syncLayoutFromDOM();
    const layout = Renderer.getLayout();
    try {
       await API.saveLayout(layout);
      await StructureUI.flushPendingEdits();
      await StructureUI.finalizeDeletes();
      // Refresh the backup so a later Cancel/Finish (which restores this
      // backup) keeps the just-saved layout instead of reverting it.
      layoutBackup = JSON.parse(JSON.stringify(layout));
      dirty = false;
      History.reset();
      updateCancelButton();
      syncMenuButtons();
      const main = document.getElementById('main-content');
      const y = main.scrollTop;
      Renderer.renderChapters();
      Renderer.loadAllEntries().then(() => {
        PageNumbers.paginate();
        PageNumbers.stampPageNumbers();
        Renderer.setupActiveTOC();
      if (typeof Layers !== 'undefined') Layers.sync();
        StructureUI.enable();
        // Force the page stack to repaint after the in-place rebuild so card
        // sizing / overflow updates correctly (otherwise stale paint persists
        // until a full refresh).
        Renderer.forceRepaint();
        main.scrollTo(0, y);
      });
    } catch (err) {
      Popup.alert({
        message: 'Save failed: ' + err.message,
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      });
    }
  }

  // Re-render the whole editor from the state restored by History.applyState
  // (layout, pendingEdits, index terms). Called on every undo/redo step.
  // Unlike discardChanges we do NOT clear pendingEdits — History has already
  // restored them — and the dirty flag is derived from the history pointer
  // (at baseline = clean) rather than forced false.
  function rerenderFromHistory() {
    const main = document.getElementById('main-content');
    const y = main ? main.scrollTop : 0;
    dirty = !History.atBaseline();
    updateCancelButton();
    syncMenuButtons();
    if (typeof IndexEditor !== 'undefined' && IndexEditor.render) IndexEditor.render();
    const layout = Renderer.getLayout();
    if (layout && typeof Layers !== 'undefined') Layers.migrateLayout(layout);
    // Synchronous, client-side re-render: build the grid from the restored
    // model, stamp cached entry HTML (no server round-trip), then re-paginate.
    // This is what keeps undo/redo flicker-free.
    Renderer.renderChapters();
    if (typeof Renderer.populateFromCache === 'function') Renderer.populateFromCache();
    PageNumbers.paginate();
    PageNumbers.stampPageNumbers();
    Renderer.setupActiveTOC();
    if (typeof Layers !== 'undefined') Layers.sync();
    Renderer.forceRepaint();
    // Inline content edits live in pendingEdits (not the content cache), so
    // stamp those too BEFORE enabling affordances / checking overflow — the
    // card must have its final content before the overflow frame is drawn.
    if (typeof StructureUI !== 'undefined' && StructureUI.applyPendingEditsToDOM) {
      StructureUI.applyPendingEditsToDOM();
    }
    StructureUI.enable();
    // Re-check overflow AND re-sync the fixed UI (overflow frame, handles,
    // controls) on the next frame. forceRepaint() restores the container
    // display inside a requestAnimationFrame, so a synchronous pass here would
    // measure cards while still display:none (zero geometry) — the frame would
    // be detected but pinned to (0,0) with zero size until the next scroll.
    if (typeof StructureUI !== 'undefined') {
      requestAnimationFrame(() => {
        if (StructureUI.checkAllOverflows) StructureUI.checkAllOverflows();
        if (StructureUI.syncAllFixedUI) StructureUI.syncAllFixedUI();
      });
    }
    if (main) main.scrollTo(0, y);
  }

  function discardChanges() {
    // Revert layout to the last saved state but remain in edit mode.
    // layoutBackup holds the saved state, so keep it for future discards.
    StructureUI.clearPendingEdits();
    // A discard restores the backup layout, which still references any entries
    // deleted this session — so their server files must NOT be removed.
    StructureUI.clearPendingDeletes();
    if (layoutBackup) Renderer.setLayout(layoutBackup);
    dirty = false;
    History.reset();
    updateCancelButton();
    syncMenuButtons();
    const main = document.getElementById('main-content');
    const y = main.scrollTop;
    // Same synchronous, cache-only re-render as undo/redo (no server round-trip)
    // so discarding doesn't blank-and-refill the cards and flicker. The backup
    // layout's content is already in the in-memory content cache.
    Renderer.renderChapters();
    if (typeof Renderer.populateFromCache === 'function') Renderer.populateFromCache();
    PageNumbers.paginate();
    PageNumbers.stampPageNumbers();
    Renderer.setupActiveTOC();
    if (typeof Layers !== 'undefined') Layers.sync();
    Renderer.forceRepaint();
    StructureUI.enable();
    main.scrollTo(0, y);
  }

  function cancelEdit() {
    // Drop buffered inline edits — the reload from disk below discards them.
    StructureUI.clearPendingEdits();
    // Leaving edit mode entirely: keep server files for any entries deleted
    // this session (the restored layout still references them).
    StructureUI.clearPendingDeletes();
    if (layoutBackup) {
      Renderer.setLayout(layoutBackup);
      layoutBackup = null;
    }
    dirty = false;
    active = false;
    History.clear();
    document.body.classList.remove('edit-mode');
    if (typeof Layers !== 'undefined') Layers.setTab('nav');
    updateCancelButton();
    syncMenuButtons();
    StructureUI.disable();
    Renderer.renderTOC();
    const main = document.getElementById('main-content');
    const y = main.scrollTop;
    Renderer.renderChapters();
    Renderer.loadAllEntries().then(() => {
      PageNumbers.paginate();
      PageNumbers.stampPageNumbers();
      Renderer.setupActiveTOC();
      if (typeof Layers !== 'undefined') Layers.sync();
      Renderer.forceRepaint();
      main.scrollTo(0, y);
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
      Popup.alert({
        message: 'Index save failed: ' + err.message,
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      });
    }
  }

  return { setup, isActive, saveAll, saveAndExit, rebuildIndex, setDirty, isDirty, updateCancelButton };
})();
