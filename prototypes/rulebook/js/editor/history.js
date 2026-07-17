// Undo / Redo — snapshot-based command history.
//
// The rulebook editor keeps all DIRTYING state in three places:
//   1. the layout model (Renderer.getLayout(): entries, layers, z-order,
//      positions, sizes, kind, hidden, sidebar titles …)
//   2. inline content edits buffered in StructureUI (pendingEdits: id -> html)
//   3. the appendix index terms (IndexEditor.getTerms())
//
// Anything that flips the Save/Discard button to enabled is captured here.
// Things that do NOT dirty the doc (e.g. Layers' edit-only visibility
// checkbox, which persists straight to the server) are intentionally left
// out of the history.
//
// We snapshot the full undoable state on every committed mutation. Undo
// walks one step back, redo walks forward. The actual DOM re-render and the
// restore of pendingEdits / index terms are delegated to a single `apply`
// callback registered by EditMode, so this module stays ignorant of the
// renderer internals.
//
// NOTE on server-side file side effects: adding/deleting an entry also
// creates/deletes its HTML file via API immediately. Like Discard (which
// restores the layout from a backup without reversing those API calls),
// undo/redo restores the LAYOUT + content model only. An undone Add leaves
// an orphaned file on the server; an undone Delete brings the entry's
// layout/content back using whatever file is still present. This matches
// the existing Discard behaviour and keeps the history purely a layout/
// content concern.

const History = (() => {
  'use strict';

  // Each entry: { label, state } where state is a deep-cloned snapshot of
  // { layout, pendingEdits, indexTerms }.
  let stack = [];
  let index = -1;          // points at the CURRENT state (last applied)
  let applyFn = null;      // (state) => void, registered by EditMode
  let onStateChange = null; // () => void, to refresh button disabled state

  function cloneLayout(layout) {
    return layout ? JSON.parse(JSON.stringify(layout)) : null;
  }

  function capturePendingEdits() {
    // pendingEdits is a Map<id, html>; snapshot as a plain object.
    if (typeof StructureUI === 'undefined' || !StructureUI.getPendingEdits) return {};
    const map = StructureUI.getPendingEdits();
    const out = {};
    map.forEach((html, id) => { out[id] = html; });
    return out;
  }

  function captureIndexTerms() {
    if (typeof IndexEditor === 'undefined' || !IndexEditor.getTerms) return [];
    return JSON.parse(JSON.stringify(IndexEditor.getTerms() || []));
  }

  function snapshot(label) {
    return {
      label: label || '',
      state: {
        layout: cloneLayout(Renderer.getLayout()),
        pendingEdits: capturePendingEdits(),
        indexTerms: captureIndexTerms(),
        contentCache: (typeof Renderer !== 'undefined' && Renderer.snapshotContentCache)
          ? Renderer.snapshotContentCache() : new Map()
      }
    };
  }

  function register(apply, onChange) {
    applyFn = apply;
    onStateChange = onChange;
  }

  // Take a fresh snapshot of the CURRENT state and push it onto the stack.
  // Call this AFTER a dirtying mutation has been applied to the model.
  function commit(label) {
    // Drop any redo branch — once a new action is committed, the future
    // that was undone is no longer reachable.
    if (index < stack.length - 1) {
      stack = stack.slice(0, index + 1);
    }
    stack.push(snapshot(label));
    index = stack.length - 1;
    if (onStateChange) onStateChange();
  }

  function canUndo() { return index > 0; }
  function canRedo() { return index < stack.length - 1; }

  // True when the pointer sits on the seeded baseline (index 0) — i.e. the
  // doc matches the last reset/clear and is therefore NOT dirty.
  function atBaseline() { return index === 0; }

  function applyState(state) {
    if (!applyFn) return;
    // Restore layout model.
    if (state.layout) Renderer.setLayout(JSON.parse(JSON.stringify(state.layout)));
    // Restore inline pending edits.
    if (typeof StructureUI !== 'undefined' && StructureUI.setPendingEdits) {
      const map = new Map();
      Object.keys(state.pendingEdits || {}).forEach(id => map.set(id, state.pendingEdits[id]));
      StructureUI.setPendingEdits(map);
    }
    // Restore index terms.
    if (typeof IndexEditor !== 'undefined' && IndexEditor.setTerms) {
      IndexEditor.setTerms(JSON.parse(JSON.stringify(state.indexTerms || [])));
    }
    // Restore the client-side entry-content cache so undone entries (e.g. an
    // undone delete) get their HTML back without a server fetch.
    if (typeof Renderer !== 'undefined' && Renderer.restoreContentCache) {
      Renderer.restoreContentCache(state.contentCache);
    }
    applyFn();
  }

  function undo() {
    if (!canUndo()) return;
    index--;
    applyState(stack[index].state);
    if (onStateChange) onStateChange();
  }

  function redo() {
    if (!canRedo()) return;
    index++;
    applyState(stack[index].state);
    if (onStateChange) onStateChange();
  }

  // Reset the history and seed it with the current (clean) state. Called on
  // edit-enter and whenever we leave edit mode (save / discard / cancel), so
  // a fresh session always starts from a clean baseline.
  function reset() {
    stack = [snapshot('initial')];
    index = 0;
    if (onStateChange) onStateChange();
  }

  function clear() {
    stack = [];
    index = -1;
    if (onStateChange) onStateChange();
  }

  return { register, commit, undo, redo, canUndo, canRedo, atBaseline, reset, clear };
})();

window.History = History;
