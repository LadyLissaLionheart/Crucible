import { EditorView } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { lineNumbers, highlightActiveLineGutter, highlightActiveLine, keymap } from '@codemirror/view';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import { bracketMatching, syntaxHighlighting } from '@codemirror/language';
import { defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';

const ContentEditor = (() => {
  'use strict';

  let currentEntryId = null;
  let currentEntryEl = null;
  let editorView = null;
  let isPreview = false;
  let savedContent = '';

  const SNIPPETS = {
    bold: { wrap: ['<strong>', '</strong>'], desc: 'Bold' },
    italic: { wrap: ['<em>', '</em>'], desc: 'Italic' },
    h3: { insert: '<h3>Heading</h3>\n', desc: 'Heading 3' },
    h4: { insert: '<h4>Heading</h4>\n', desc: 'Heading 4' },
    ul: { insert: '<ul>\n  <li>Item</li>\n</ul>\n', desc: 'Unordered list' },
    ol: { insert: '<ol>\n  <li>Item</li>\n</ol>\n', desc: 'Ordered list' },
    table: { insert: '<table>\n  <thead>\n    <tr><th>Header</th></tr>\n  </thead>\n  <tbody>\n    <tr><td>Cell</td></tr>\n  </tbody>\n</table>\n', desc: 'Table' },
    link: { insert: '<a href="">Link text</a>', desc: 'Link' },
    mechanic: { insert: '<div class="mechanic-box">\n  <div class="mechanic-label">Mechanic</div>\n  <p>Content here...</p>\n</div>\n', desc: 'Mechanic box' },
    callout: { insert: '<div class="callout">\n  <strong>Note:</strong> Content here...\n</div>\n', desc: 'Callout' },
    img: { insert: '<img src="/data/images/" alt="">\n', desc: 'Insert image' }
  };

  function init() {
    document.getElementById('editor-overlay').addEventListener('click', close);
    document.querySelectorAll('.editor-toolbar [data-cmd]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        if (SNIPPETS[cmd]) insertSnippet(SNIPPETS[cmd]);
      });
    });
    document.getElementById('cm-preview-toggle').addEventListener('click', togglePreview);
    document.getElementById('editor-save-btn').addEventListener('click', save);
    document.getElementById('editor-cancel-btn').addEventListener('click', close);
    document.getElementById('editor-delete-btn').addEventListener('click', (e) => deleteEntry(e));
  }

  async function open(entryId, entryEl) {
    currentEntryId = entryId;
    currentEntryEl = entryEl;

    document.getElementById('editor-overlay').classList.add('active');
    document.getElementById('editor-modal').classList.add('active');
    document.getElementById('entry-label').textContent = entryId + '.html';

    const statusEl = document.getElementById('editor-status');
    statusEl.textContent = 'Loading...';

    let content = '';
    try {
      content = await API.getEntry(entryId);
    } catch (err) {
      content = '<h2>' + entryId.replace(/-/g, ' ') + '</h2>\n<p>Error loading entry.</p>\n';
    }
    statusEl.textContent = 'Loaded';
    savedContent = content;

    if (editorView) {
      editorView.destroy();
      editorView = null;
    }

    const parent = document.getElementById('cm-host');
    parent.innerHTML = '';

    isPreview = false;
    document.getElementById('cm-preview-toggle').classList.remove('active');
    document.getElementById('cm-preview-toggle').textContent = 'Preview';
    document.getElementById('editor-preview').classList.remove('active');
    parent.style.display = '';

    editorView = new EditorView({
      doc: content,
      extensions: [
        EditorState.tabSize.of(2),
        EditorState.allowMultipleSelections.of(true),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab
        ]),
        html(),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        bracketMatching(),
        syntaxHighlighting(oneDark),
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' }
        })
      ],
      parent
    });

    document.getElementById('editor-save-btn').textContent = 'Save';
    document.getElementById('editor-delete-btn').style.display = '';
  }

  function close() {
    if (editorView) {
      editorView.destroy();
      editorView = null;
    }
    currentEntryId = null;
    currentEntryEl = null;
    isPreview = false;
    document.getElementById('editor-overlay').classList.remove('active');
    document.getElementById('editor-modal').classList.remove('active');
    document.getElementById('editor-preview').classList.remove('active');
    document.getElementById('cm-preview-toggle').classList.remove('active');
    document.getElementById('cm-preview-toggle').textContent = 'Preview';
  }

  function togglePreview() {
    if (!editorView) return;
    isPreview = !isPreview;
    const toggle = document.getElementById('cm-preview-toggle');
    toggle.classList.toggle('active', isPreview);
    toggle.textContent = isPreview ? 'Code' : 'Preview';

    const host = document.getElementById('cm-host');
    const preview = document.getElementById('editor-preview');

    if (isPreview) {
      host.style.display = 'none';
      preview.classList.add('active');
      const entryDiv = preview.querySelector('.entry') || document.createElement('div');
      entryDiv.className = 'entry';
      entryDiv.innerHTML = editorView.state.doc.toString();
      if (!preview.contains(entryDiv)) {
        preview.innerHTML = '';
        preview.appendChild(entryDiv);
      }
    } else {
      host.style.display = '';
      preview.classList.remove('active');
    }
  }

  async function save() {
    if (!editorView || !currentEntryId) return;
    const content = editorView.state.doc.toString();

    const statusEl = document.getElementById('editor-status');
    statusEl.textContent = 'Saving...';

    try {
      await API.saveEntry(currentEntryId, content);
      statusEl.textContent = 'Saved';
      savedContent = content;

      if (typeof EditMode !== 'undefined' && EditMode.updateCancelButton) {
        EditMode.updateCancelButton();
      }

      if (currentEntryEl) {
        currentEntryEl.innerHTML = content;
        currentEntryEl.dataset.loaded = 'true';
      }

      Renderer.clearSearchIndex();
      document.querySelectorAll('.entry[data-loaded="true"]').forEach(el => {
        const id = el.dataset.entryId;
        const temp = document.createElement('div');
        temp.innerHTML = el.innerHTML;
        const text = temp.textContent || '';
        const heading = temp.querySelector('h2');
        Renderer.getSearchIndex().push({
          id,
          title: heading ? heading.textContent : id.replace(/-/g, ' '),
          text,
          chapter: Renderer.findChapterForEntry(id)
        });
      });

      // If we're editing inside the page-card view, re-pack the cards so the
      // saved entry's new size is reflected and affordances re-attach.
      // repack() caches current DOM content (incl. the just-saved entry),
      // rebuilds the flat DOM, restores it, then paginates — no refetch.
      if (typeof EditMode !== 'undefined' && EditMode.isActive && EditMode.isActive()) {
        StructureUI.repack();
      }
    } catch (err) {
      statusEl.textContent = 'Save failed: ' + err.message;
    }
  }

  async function deleteEntry(e) {
    if (!currentEntryId) return;
    const confirmed = await Popup.confirm({
      message: 'Delete "' + currentEntryId + '" permanently?',
      x: e.clientX,
      y: e.clientY,
      confirmText: 'Delete',
      confirmClass: 'popup-danger'
    });
    if (!confirmed) return;
    try {
      await API.deleteEntry(currentEntryId);
      const layout = Renderer.getLayout();
      layout.entries = (layout.entries || []).filter(en => en.id !== currentEntryId);
      if (currentEntryEl) currentEntryEl.remove();
      close();
      Renderer.renderTOC();
    } catch (err) {
      await Popup.alert({ message: 'Delete failed: ' + err.message, x: e.clientX, y: e.clientY });
    }
  }

  function hasUnsavedChanges() {
    if (!editorView || !currentEntryId) return false;
    return editorView.state.doc.toString() !== savedContent;
  }

  function insertSnippet(snippet) {
    if (!editorView || isPreview) return;
    if (snippet.wrap) {
      const sel = editorView.state.selection.main;
      const text = editorView.state.sliceDoc(sel.from, sel.to);
      const wrapped = snippet.wrap[0] + (text || 'text') + snippet.wrap[1];
      editorView.dispatch({
        changes: { from: sel.from, to: sel.to, insert: wrapped },
        selection: { anchor: sel.from + wrapped.length }
      });
    } else if (snippet.insert) {
      const sel = editorView.state.selection.main;
      editorView.dispatch({
        changes: { from: sel.from, insert: snippet.insert },
        selection: { anchor: sel.from + snippet.insert.length }
      });
    }
    editorView.focus();
  }

  return { init, open, close, save, hasUnsavedChanges };
})();

window.ContentEditor = ContentEditor;
