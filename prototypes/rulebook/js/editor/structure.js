const StructureUI = (() => {
  'use strict';

  let drag = null;

  // Active resize operation (mirrors `drag`): which edges are being pulled
  // and the card's starting pixel rect. null when not resizing.
  let resize = null;

  // Active "add entry" placement: the freshly created card follows the
  // mouse until the user presses the left button again to drop it. null
  // when not placing.
  let placement = null;

  // Inline edits are buffered here (id -> current HTML) and only committed
  // to the server on an explicit Save (Save & Exit / Save Layout). Cancel
  // discards them by reloading from the server, so edits are always
  // undoable. Matches the layout's save/cancel semantics.
  const pendingEdits = new Map();
  // Snapshot of each card's HTML when editing starts, so a no-op
  // (edit toggled on/off without changes) doesn't mark the doc dirty.
  const editOriginals = new Map();

  // ── Overflow Detection ────────────────────
  // Measures whether content extends past the card on either axis:
  //   vertical   — an element's bottom edge (incl. margin) past clientHeight
  //   horizontal — an element's right edge (incl. margin) past clientWidth
  // Both are flagged so shrinking/enlarging on EITHER axis behaves
  // identically. We measure real element edges rather than scrollHeight/
  // scrollWidth to avoid false positives from trailing margins, and we
  // walk the FULL descendant tree (a wide image/table is nested inside
  // `.entry`, so a direct-child-only scan misses it).
  const AFFORDANCE_SEL = '.entry-actions, .entry-edge-actions, .resize-handle, .struct-btn, .entry-add-actions';

  function checkOverflow(card) {
    if (!document.body.classList.contains('edit-mode')) {
      card.classList.remove('overflowing');
      const f = card.querySelector(':scope > .overflow-frame');
      if (f) f.remove();
      return;
    }
    // Union bounding box of ALL content (every descendant), in card coords
    // (may be negative when content spills up/left). We then draw ONE orange
    // frame at that box. The card itself sits on top of the in-bounds part,
    // so only the spilled portion shows — and it grows as the card shrinks.
    const cardW = card.clientWidth;
    const cardH = card.clientHeight;
    const tol = 1; // px tolerance so sub-pixel rounding doesn't false-flag
    let minTop = Infinity, minLeft = Infinity, maxBottom = -Infinity, maxRight = -Infinity;
    const walk = el => {
      for (const child of el.children) {
        if (child.matches(AFFORDANCE_SEL) || child.classList.contains('overflow-frame')) continue;
        let top = child.offsetTop;
        let left = child.offsetLeft;
        let p = child.offsetParent;
        while (p && p !== card) {
          top += p.offsetTop;
          left += p.offsetLeft;
          p = p.offsetParent;
        }
        // Measure at the TRUE content extent, not just the element box.
        // A block's offsetWidth stays pinned to the container width even when
        // its content (e.g. a single unbreakable word, or wide inline content)
        // spills past the right/bottom edge — scrollWidth/scrollHeight capture
        // that overflow, so the spill is actually detected.
        const bottom = top + Math.max(child.offsetHeight, child.scrollHeight);
        const right = left + Math.max(child.offsetWidth, child.scrollWidth);
        if (top < minTop) minTop = top;
        if (left < minLeft) minLeft = left;
        if (bottom > maxBottom) maxBottom = bottom;
        if (right > maxRight) maxRight = right;
        walk(child);
      }
    };
    walk(card);
    const overTop = minTop < -tol;
    const overBottom = maxBottom > cardH + tol;
    const overLeft = minLeft < -tol;
    const overRight = maxRight > cardW + tol;
    const any = overTop || overBottom || overLeft || overRight;
    card.classList.toggle('overflowing', any);
    let frame = card.querySelector(':scope > .overflow-frame');
    if (!any) {
      if (frame) frame.remove();
      return;
    }
    if (!frame) {
      frame = document.createElement('div');
      frame.className = 'overflow-frame';
      frame.innerHTML = '<i class="of-top"></i><i class="of-right"></i><i class="of-bottom"></i><i class="of-left"></i>';
      card.appendChild(frame);
    }
    const T = frame.querySelector('.of-top');
    const R = frame.querySelector('.of-right');
    const B = frame.querySelector('.of-bottom');
    const L = frame.querySelector('.of-left');
    const w = maxRight - minLeft;
    const h = maxBottom - minTop;
    T.style.display = overTop ? 'block' : 'none';
    B.style.display = overBottom ? 'block' : 'none';
    L.style.display = overLeft ? 'block' : 'none';
    R.style.display = overRight ? 'block' : 'none';
    // Each band is a FILLED strip in the overflow region (outside the card),
    // so the spilled area reads as solid orange rather than a thin line.
    T.style.left = minLeft + 'px'; T.style.top = minTop + 'px';
    T.style.width = w + 'px';      T.style.height = (-minTop) + 'px';
    B.style.left = minLeft + 'px'; B.style.top = cardH + 'px';
    B.style.width = w + 'px';      B.style.height = (maxBottom - cardH) + 'px';
    L.style.left = minLeft + 'px'; L.style.top = '0px';
    L.style.width = (-minLeft) + 'px'; L.style.height = cardH + 'px';
    R.style.left = cardW + 'px';   R.style.top = '0px';
    R.style.width = (maxRight - cardW) + 'px'; R.style.height = cardH + 'px';
  }

  function checkAllOverflows() {
    document.querySelectorAll('.pages .grid-card[data-entry-id]').forEach(checkOverflow);
  }

  function onInlineInput(e) {
    const card = e.currentTarget;
    const eid = card.dataset.entryId;
    if (!eid) return;
    checkOverflow(card);
    // Buffer + flag dirty live on every keystroke so the Save button enables
    // immediately and a Save while still focused captures the edit too.
    applyInlineEdit(card, eid);
  }

  // ── Enable / Disable ──────────────────────
  function enable() {
    disable();
    document.querySelectorAll('.pages .grid-card').forEach(card => {
      if (!card.dataset.itemType) return;
      addCardControls(card);
    });
    addGlobalAddChapter();
    bindDragGlobal();
    checkAllOverflows();
  }

  function disable() {
    document.removeEventListener('mousedown', onCardMouseDown, true);
    document.removeEventListener('mousemove', onHoverMove);
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    drag = null;
    _dragListenerBound = false;
    _lastHoverCard = null;
    document.querySelectorAll('.struct-btn').forEach(b => b.remove());
    document.querySelectorAll('.entry-actions').forEach(b => b.remove());
    document.querySelectorAll('.entry-edge-actions').forEach(b => b.remove());
    document.querySelectorAll('.entry-add-actions').forEach(n => n.remove());
    document.querySelectorAll('.resize-handle').forEach(n => n.remove());
    document.querySelectorAll('.struct-add-chapter').forEach(n => n.remove());
    // Drop any overflow marks so they never bleed into read/print view.
    document.querySelectorAll('.pages .grid-card').forEach(c => {
      c.classList.remove('overflowing', 'spill-hover');
      const f = c.querySelector(':scope > .overflow-frame');
      if (f) f.remove();
    });
  }

  // Sync stored card positions from the DOM back into the layout model.
  // Used by EditMode.saveAll(): iterates .pages .grid-card and writes
  // page/col/row/w/h into its item.
  function syncLayoutFromDOM() {
    const layout = Renderer.getLayout();
    if (!layout) return;
    document.querySelectorAll('.pages .grid-card').forEach(el => {
      const type = el.dataset.itemType;
      const id = el.dataset.itemId;
      if (!type || !id) return;
      const pageEl = el.closest('.page');
      const page = Number(pageEl?.dataset.page);
      const col = Number(el.dataset.gridCol);
      const row = Number(el.dataset.gridRow);
      const w = Number(el.dataset.gridW);
      const h = Number(el.dataset.gridH);
      const item = Grid.findItem(layout, type, id);
      if (!item) return;
      item.page = page;
      item.col = col;
      item.row = row;
      item.w = w;
      item.h = h;
    });
  }

  function syncLayoutFromCard(el) {
    const layout = Renderer.getLayout();
    if (!layout) return;
    const type = el.dataset.itemType;
    const id = el.dataset.itemId;
    if (!type || !id) return;
    const pageEl = el.closest('.page');
    const page = Number(pageEl?.dataset.page);
    const col = Number(el.dataset.gridCol);
    const row = Number(el.dataset.gridRow);
    const w = Number(el.dataset.gridW);
    const h = Number(el.dataset.gridH);
    const item = Grid.findItem(layout, type, id);
    if (!item) return;
    item.page = page;
    item.col = col;
    item.row = row;
    item.w = w;
    item.h = h;
  }

  // Rebuild the page stack and re-attach affordances. Called after any
  // structural mutation. Re-fetches entries from the server so newly
  // created entries have content to load.
  function rebuild() {
    Renderer.renderChapters();
    Renderer.loadAllEntries().then(() => {
      PageNumbers.paginate();
      enable();
      Renderer.renderTOC();
      Renderer.forceRepaint();
    });
  }

  // Re-pack without a network round trip: cache current entry content,
  // rebuild the flat DOM, restore cached content, then lay out again.
  // Used after drag-end / save so cards keep their loaded HTML.
  function repack() {
    const cache = new Map();
    document.querySelectorAll('.pages .entry[data-entry-id]').forEach(el => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('.entry-actions, .entry-edge-actions, .entry-add-actions, .struct-btn, .resize-handle').forEach(n => n.remove());
      cache.set(el.dataset.entryId, clone.innerHTML);
    });

    Renderer.renderChapters();

    cache.forEach((html, id) => {
      const el = document.getElementById('entry-' + id);
      if (!el) return;
      el.innerHTML = html;
      el.classList.remove('loading');
      el.dataset.loaded = 'true';
    });

    PageNumbers.paginate();
    enable();
    Renderer.renderTOC();
    // Force the page stack to repaint after the in-place rebuild so card
    // sizing updates correctly (otherwise stale paint persists until a
    // refresh).
    Renderer.forceRepaint();
  }

  // ── Card Controls ─────────────────────────
  // The Kind▾ + TOC-title bar floats above the card (left-aligned, title
  // fills the remaining width). Edit / Delete instead run DOWN the left
  // edge of the entry as a vertical icon stack (Edit on top).
  function addCardControls(card) {
    const type = card.dataset.itemType;
    const existing = card.querySelector('.entry-actions');
    if (existing) return;

    // Top bar: [Kind▾] [Title — full width]. Kind + Title sit on the left,
    // the title input grows to fill the rest of the entry width.
    const actions = document.createElement('div');
    actions.className = 'entry-actions';
    actions.style.cssText = 'display:flex;gap:0.25rem;align-items:center;';

    // Left group holds the kind select + TOC-title input.
    const leftGroup = document.createElement('div');
    leftGroup.className = 'entry-actions-left';
    leftGroup.style.cssText = 'display:flex;gap:0.25rem;align-items:center;flex:1;';

    // Edit button lives in the top bar, to the LEFT of the kind dropdown
    // (same row). It toggles inline contenteditable editing on the card.
    const editBtn = makeBtn(pencilIcon(), 'Edit');
    editBtn.setAttribute('data-tooltip', 'Edit content');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleInlineEdit(card, editBtn);
    });

    // Kind + TOC-title controls for every card. `kind` is just a property
     // on the entry (chapter / section / header / subheader / entry) that
    // drives TOC nesting — there is no parent/child relationship.
    {
      const id = card.dataset.itemId;
      const item = Grid.findItem(Renderer.getLayout(), type, id) || {};
      const kind = card.dataset.kind || item.kind || 'entry';

      const kindSelect = document.createElement('select');
      kindSelect.className = 'struct-kind-select';
      kindSelect.setAttribute('data-tooltip', 'Entry type determines table of content structure and default design');
      ['chapter', 'section', 'header', 'subheader', 'entry'].forEach(k => {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = k.charAt(0).toUpperCase() + k.slice(1);
        if (kind === k) opt.selected = true;
        kindSelect.appendChild(opt);
      });
      kindSelect.addEventListener('mousedown', (e) => e.stopPropagation());
      kindSelect.addEventListener('click', (e) => e.stopPropagation());
      kindSelect.addEventListener('change', (e) => {
        e.stopPropagation();
        changeKind(card, kindSelect.value);
      });
      leftGroup.appendChild(kindSelect);
      // Place the Edit button to the LEFT of the kind dropdown, on the
      // same row (the dropdown itself shifts right to make room).
      leftGroup.insertBefore(editBtn, kindSelect);

      // Only TOC-linked kinds have a title — it is the TOC label. A plain
      // `entry` never links back to the contents, so it gets no title input.
      if (kind !== 'entry') {
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'struct-title-input';
        titleInput.value = item.sidebarTitle || item.title || id.replace(/-/g, ' ');
        titleInput.setAttribute('data-tooltip', 'Title displayed in the table of contents');
        titleInput.placeholder = 'TOC title';
        titleInput.style.flex = '1';
        titleInput.addEventListener('mousedown', (e) => e.stopPropagation());
        titleInput.addEventListener('click', (e) => e.stopPropagation());
        titleInput.addEventListener('input', (e) => {
          e.stopPropagation();
          item.sidebarTitle = titleInput.value.trim();
          EditMode.setDirty();
        });
        titleInput.addEventListener('change', () => {
          Renderer.renderTOC();
        });
        titleInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') titleInput.blur();
        });
        leftGroup.appendChild(titleInput);
      }
    }

    actions.appendChild(leftGroup);

    card.appendChild(actions);

    // Vertical stack of action buttons running DOWN the left edge of the
    // entry, wrapped into columns of at most two (closest column sits
    // against the entry's left border; extra columns grow to the left).
    // Lives outside the title bar so it can be positioned independently.
    const edgeActions = document.createElement('div');
    edgeActions.className = 'entry-edge-actions';

    // `itemId` must come from the card directly — the `id` used inside the
    // Kind/TOC block above is block-scoped and NOT visible here.
    const itemId = card.dataset.itemId;
    const entryItem = Grid.findItem(Renderer.getLayout(), type, itemId) || {};

    const hideBtn = makeBtn(eyeIcon(), 'Hide');
    hideBtn.classList.add('hide-btn');
    hideBtn.setAttribute('data-tooltip', 'Hide');
    if (entryItem.hidden) {
      card.classList.add('entry-hidden');
      hideBtn.classList.add('active');
      hideBtn.innerHTML = '';
      hideBtn.appendChild(eyeOffIcon());
      hideBtn.setAttribute('data-tooltip', 'Show');
    }
    hideBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHide(card, hideBtn);
    });

    const zUpBtn = makeBtn(zUpIcon(), 'Bring forward (z-index up)');
    zUpBtn.classList.add('z-btn', 'z-up-btn');
    zUpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveZ(card, 'up');
    });

    const zDownBtn = makeBtn(zDownIcon(), 'Send backward (z-index down)');
    zDownBtn.classList.add('z-btn', 'z-down-btn');
    zDownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveZ(card, 'down');
    });

    const delBtn = makeBtn(trashIcon(), 'Delete', true);
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCard(card, e);
    });

    // Read-only z-index badge, sitting ABOVE the side buttons and to the LEFT
    // of the entry (so it reads as "above the left rail, left of the top bar"
    // without touching the type dropdown's position). Reflects stacking order.
    const zInd = document.createElement('span');
    zInd.className = 'z-indicator';
    zInd.setAttribute('data-tooltip', 'Z-index (stacking order) — higher is in front');
    zInd.textContent = (typeof entryItem.z === 'number') ? ('z ' + entryItem.z) : 'z ?';
    edgeActions.appendChild(zInd);

    // Order down the rail: z-up (1st), z-down (2nd), hide (3rd), then delete.
    // Chunk into columns of two for the left-edge wrap.
    const btnWrap = document.createElement('div');
    btnWrap.className = 'edge-btn-columns';
    const edgeButtons = [zUpBtn, zDownBtn, hideBtn, delBtn];
    const MAX_PER_COL = 2;
    for (let i = 0; i < edgeButtons.length; i += MAX_PER_COL) {
      const col = document.createElement('div');
      col.className = 'edge-col';
      edgeButtons.slice(i, i + MAX_PER_COL).forEach(b => col.appendChild(b));
      btnWrap.appendChild(col);
    }
    edgeActions.appendChild(btnWrap);

    card.appendChild(edgeActions);

    // Double-click the card body to jump straight into inline editing with
    // the caret placed near the pointer (bypasses the Edit button).
    card.addEventListener('dblclick', (e) => {
      if (card.getAttribute('contenteditable') === 'true') return;
      if (e.target.closest('button, input, select, .struct-btn, .entry-actions, .entry-edge-actions, .resize-handle')) return;
      e.stopPropagation();
      e.preventDefault();
      toggleInlineEdit(card, editBtn, e.clientX, e.clientY);
    });

    // Resize handles (8): 4 edges + 4 corners. Only used in edit mode and
    // hidden while a card is being edited inline (the CSS hides them). Each
    // handle reports which edge(s) it controls via data-edge.
    ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach(edge => {
      const h = document.createElement('div');
      h.className = 'resize-handle ' + edge;
      h.dataset.edge = edge;
      h.addEventListener('mousedown', onResizeDown);
      card.appendChild(h);
    });
  }

  // ── Hide / Show toggle ───────────────────
  // Fades the entry's content right down so it reads as "present but
  // hidden" while keeping its grid slot (and the floating controls, so it
  // can be toggled back). The state lives on the layout item and survives
  // re-renders within the edit session; it is persisted on Save.
  function toggleHide(card, btn) {
    const eid = card.dataset.entryId;
    const hidden = card.classList.toggle('entry-hidden');
    const item = Grid.findItem(Renderer.getLayout(), 'entry', eid);
    if (item) {
      item.hidden = hidden;
      EditMode.setDirty();
    }
    btn.classList.toggle('active', hidden);
    btn.innerHTML = '';
    btn.appendChild(hidden ? eyeOffIcon() : eyeIcon());
    btn.setAttribute('data-tooltip', hidden ? 'Show' : 'Hide');
  }

  // ── Z-index (stacking) ───────────────────
  // Brings the entry one step forward ('up') or backward ('down') in the
  // stacking order among entries on the SAME page (z-index only compares
  // within a page's stacking context). We swap z values with the immediate
  // neighbour in z-order, so repeated clicks walk the entry through the
  // stack without ever creating gaps or duplicates. State lives on the
  // layout item and is persisted on Save.
  function moveZ(card, dir) {
    const layout = Renderer.getLayout();
    if (!layout) return;
    Grid.ensureZ(layout);

    const id = card.dataset.itemId;
    const item = (layout.entries || []).find(e => e.id === id);
    if (!item || typeof item.z !== 'number' || typeof item.page !== 'number') return;

    const peers = (layout.entries || [])
      .filter(e => e.page === item.page && typeof e.z === 'number')
      .sort((a, b) => a.z - b.z);

    const i = peers.findIndex(e => e.id === id);
    if (i < 0) return;

    if (dir === 'up' && i < peers.length - 1) {
      const other = peers[i + 1];
      const t = item.z; item.z = other.z; other.z = t;
      applyZ(item, other);
    } else if (dir === 'down' && i > 0) {
      const other = peers[i - 1];
      const t = item.z; item.z = other.z; other.z = t;
      applyZ(item, other);
    } else {
      return; // already at the top/bottom of the stack — nothing to do
    }

    EditMode.setDirty();
  }

  // Write the just-swapped z values onto the two cards' DOM so the change is
  // visible immediately (a full re-render isn't needed for a z swap).
  function applyZ(a, b) {
    [a, b].forEach(it => {
      const el = document.getElementById('entry-' + it.id);
      if (!el) return;
      el.style.setProperty('--z', String(it.z));
      const ind = el.querySelector('.z-indicator');
      if (ind) ind.textContent = 'z ' + it.z;
    });
  }

  // ── Inline (contenteditable) editing ──────────
   // A chapter is just an entry; every card renders its own HTML, so the
  // only edit that makes sense is editing that HTML in place. We toggle
  // contenteditable on the card and keep the floating controls row
  // non-editable so the Edit/Delete buttons and Kind/Title inputs still
  // work. On exit we buffer the edited HTML; it is only written to the
  // server when the user explicitly Saves — Cancel discards it.

  // Resolve a collapsed text caret nearest a screen point. Uses the
  // Blink/WebKit API where available, falling back to the Firefox one.
  function caretFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r) return r;
    }
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) {
        const r = document.createRange();
        r.setStart(p.offsetNode, p.offset);
        r.collapse(true);
        return r;
      }
    }
    return null;
  }

  function toggleInlineEdit(card, btn, clientX, clientY) {
    const eid = card.dataset.entryId;
    if (!eid) return;

    const actions = card.querySelector('.entry-actions');
    const editing = card.getAttribute('contenteditable') === 'true';

    if (editing) {
      card.removeAttribute('contenteditable');
      card.classList.remove('editing');
      if (actions) actions.setAttribute('contenteditable', 'false');
      if (btn) btn.classList.remove('active');
      card.removeEventListener('input', onInlineInput);
      bufferInlineEdit(card, eid);
    } else {
      card.setAttribute('contenteditable', 'true');
      card.classList.add('editing');
      if (actions) actions.setAttribute('contenteditable', 'false');
      if (btn) btn.classList.add('active');
      card.addEventListener('input', onInlineInput);
      // An empty <p></p> has no line box, so the contenteditable caret has
      // nowhere to render and typing does nothing. Seed a <br> so there's a
      // caret position — done before the snapshot so an untouched entry
      // still compares equal and stays clean.
      const contentP = card.querySelector(':scope > p');
      if (contentP && !contentP.textContent && !contentP.querySelector('br, img, table')) {
        contentP.appendChild(document.createElement('br'));
      }
      // Snapshot current content to detect real changes on exit. Must strip
      // the same affordances as bufferInlineEdit so an untouched entry
      // still compares equal.
      const snap = card.cloneNode(true);
      const sa = snap.querySelector('.entry-actions');
      if (sa) sa.remove();
      snap.querySelectorAll('.entry-edge-actions, .resize-handle, .struct-btn, .entry-add-actions').forEach(n => n.remove());
      editOriginals.set(eid, snap.innerHTML.trim());
      card.focus();
      // Drop the caret as close to the pointer as possible when the edit was
      // opened from a double-click; otherwise leave the default focus caret.
      if (typeof clientX === 'number' && typeof clientY === 'number') {
        const range = caretFromPoint(clientX, clientY);
        if (range && card.contains(range.startContainer)) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      card.addEventListener('blur', onInlineBlur, true);
    }
  }

  // Auto-buffer when focus leaves the card while editing (e.g. clicking
  // elsewhere). Ignore blurs that land inside the card (its own controls).
  let _inlineBlurTimer = null;
  function onInlineBlur(e) {
    const card = e.currentTarget;
    if (!card || card.getAttribute('contenteditable') !== 'true') return;
    if (card.contains(document.activeElement)) return;
    if (_inlineBlurTimer) clearTimeout(_inlineBlurTimer);
    _inlineBlurTimer = setTimeout(() => {
      if (!card.isConnected) return;
      if (card.getAttribute('contenteditable') !== 'true') return;
      if (card.contains(document.activeElement)) return;
      toggleInlineEdit(card, card.querySelector('.entry-actions .icon-btn'));
    }, 150);
  }

  // Capture the edited HTML (minus the floating controls row) into the
  // pending-edits buffer. Nothing is sent to the server yet — Save commits
  // it, Cancel drops it. We still refresh the in-memory search index so the
  // sidebar stays accurate while editing. Returns true if the entry is now
  // considered changed (i.e. it sits in the pending buffer).
  function applyInlineEdit(card, eid) {
    // Only meaningful while an edit session is active (snapshot exists).
    if (!editOriginals.has(eid)) return false;
    const clone = card.cloneNode(true);
    // Strip the edit affordances — they live in the DOM as floating
    // controls, not in the entry's own HTML, so they must never be saved.
    const a = clone.querySelector('.entry-actions');
    if (a) a.remove();
    clone.querySelectorAll('.entry-edge-actions, .resize-handle, .struct-btn, .entry-add-actions').forEach(n => n.remove());
    const html = clone.innerHTML.trim();
    const original = editOriginals.get(eid);
    // No change → drop any prior pending edit for this entry, stay clean.
    if (html === original) {
      pendingEdits.delete(eid);
      return false;
    }
    pendingEdits.set(eid, html);
    EditMode.setDirty();
    reindexEntry(eid, html);
    checkOverflow(card);
    return true;
  }

  // Finalize an inline edit when editing toggles off (explicit toggle or
  // blur). Buffers the final HTML and tears down the live-edit session.
  function bufferInlineEdit(card, eid) {
    card.removeEventListener('blur', onInlineBlur, true);
    applyInlineEdit(card, eid);
    editOriginals.delete(eid);
  }

  // Commit all buffered inline edits to the server. Called by Save & Exit /
  // Save Layout before the view is rebuilt from the (now-updated) files.
  async function flushPendingEdits() {
    for (const [id, html] of pendingEdits) {
      try {
        await API.saveEntry(id, html);
      } catch (err) {
        console.warn('flushPendingEdits: failed to save ' + id, err);
      }
    }
    pendingEdits.clear();
  }

  // Drop buffered edits without writing them (used by Cancel).
  function clearPendingEdits() {
    pendingEdits.clear();
    editOriginals.clear();
  }

  // Keep the sidebar search index in sync with the edited HTML without a
  // full reload — mirrors what ContentEditor.save() does per entry.
  function reindexEntry(eid, html) {
    const idx = Renderer.getSearchIndex();
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const text = temp.textContent || '';
    const heading = temp.querySelector('h2');
    const data = {
      id: eid,
      title: heading ? heading.textContent : eid.replace(/-/g, ' '),
      text,
      chapter: Renderer.findChapterForEntry(eid)
    };
    const existing = idx.find(en => en.id === eid);
    if (existing) Object.assign(existing, data);
    else idx.push(data);
  }

  // ── Global + Add Chapter (appended below the page stack) ──
  function addGlobalAddChapter() {
    const pages = document.querySelector('.pages');
    if (!pages) return;
    if (pages.querySelector(':scope > .struct-add-chapter')) return;
    const div = document.createElement('div');
    div.className = 'struct-add-chapter';
    div.style.cssText = 'width:var(--page-w);text-align:center;padding:0.75rem 0;margin:0 auto;';
    const btn = document.createElement('button');
    btn.className = 'struct-btn';
    btn.style.cssText = 'padding:0.4rem 1rem;font-size:0.85rem;';
    btn.textContent = '+ Add Chapter';
    btn.addEventListener('click', addChapter);
    div.appendChild(btn);
    pages.appendChild(div);
  }

  // ── Change entry kind ────────────────────
  // Sets item.kind (entry / section / header / subheader) — purely a
  // layout.json property that drives TOC nesting. It never touches the
  // entry's HTML content. We only ensure an HTML file exists so the card
  // always has something to display.
  async function changeKind(card, newKind) {
    const id = card.dataset.itemId;
    const layout = Renderer.getLayout();
    const item = Grid.findItem(layout, 'entry', id);
    if (!item) return;
    if (item.kind === newKind) return;
    item.kind = newKind;
    EditMode.setDirty();

    // Make sure an HTML file exists (create-if-missing). Existing content
    // is preserved — createEntry 409s when the file is already there. A
    // plain 'entry' gets blank (title-less) content; TOC kinds get a title.
    try {
      if (newKind === 'entry') await API.createEntry(id, '', { empty: true });
      else await API.createEntry(id, item.sidebarTitle || id);
    } catch (err) {
      if (!err.message.includes('409')) {
        console.warn('changeKind: could not ensure entry HTML file', err);
      }
    }

    rebuild();
  }

  // ── Deletes ──────────────────────────────
  // Deletion is isolated: removing one item never touches any other
  // entry. There is no parent/child cascade to ripple through.
  async function deleteCard(card, e) {
    const id = card.dataset.itemId;
    const layout = Renderer.getLayout();
    if (!layout) return;
    const entries = layout.entries || [];
    const item = entries.find(en => en.id === id);
    if (!item) return;

    // Every kind is a real entry with its own HTML file, so deleting one
    // item removes that item and its file only — never any other entry.
    const confirmed = await Popup.confirm({
      message: item.kind === 'chapter'
        ? 'Delete chapter "' + (item.sidebarTitle || item.title || id) + '"?'
        : 'Delete this entry permanently?',
      x: e.clientX,
      y: e.clientY,
      confirmText: 'Delete',
      confirmClass: 'popup-danger'
    });
    if (!confirmed) return;

    layout.entries = entries.filter(en => en.id !== id);
    API.deleteEntry(id).catch(() => {});

    Renderer.renderTOC();
    EditMode.setDirty();
    rebuild();
  }

  // ── Add Operations ─────────────────────────
  // A chapter is just an entry of kind 'chapter' — give it an HTML file
  // so it renders its own content like every other entry.
  async function addChapter() {
    const layout = Renderer.getLayout();
    layout.entries = layout.entries || [];
    const id = 'chapter-' + Date.now();

    const lastItem = layout.entries[layout.entries.length - 1];
    const startPage = lastItem && lastItem.page ? lastItem.page : 1;
    const slot = Grid.findFreeSlot(layout, startPage, 0, Grid.DEFAULTS.chapter.h, Grid.DEFAULTS.chapter.w);

    try {
      await API.createEntry(id, 'New Chapter');
    } catch (err) {
      if (!err.message.includes('409')) console.warn('addChapter: could not create HTML file', err);
    }

    const chapterLayer = (typeof Layers !== 'undefined') ? Layers.getActiveLayerId(slot.page) : null;
    layout.entries.push({
      id,
      kind: 'chapter',
      sidebarTitle: 'New Chapter',
      title: 'New Chapter',
      page: slot.page,
      col: slot.col,
      row: slot.row,
      w: Grid.DEFAULTS.chapter.w,
      h: Grid.DEFAULTS.chapter.h,
      layerId: chapterLayer
    });

    Renderer.renderTOC();
    EditMode.setDirty();
    rebuild();
    setTimeout(() => {
      const t = document.querySelector('.pages .grid-card[data-item-id="' + id + '"]');
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  // ── Add Entry at the mouse (drag-to-place) ─────────────────────────
  // Clicking the toolbar "Add Entry" button (or picking a type from the
  // dropdown) drops a brand-new entry of the given kind at the cursor and
  // immediately enters placement mode: the card follows the mouse and is
  // committed when the user presses the left button again.
  async function startAddEntry(e, kind = 'entry') {
    if (placement) return;
    if (e) e.preventDefault();
    const layout = Renderer.getLayout();
    if (!layout) return;
    layout.entries = layout.entries || [];

    const id = (kind === 'chapter' ? 'chapter-' : 'entry-') + Date.now();

    // Every new entry comes in at 6 cells wide × 2 cells tall; the user can
    // resize afterwards.
    const w = 6;
    const h = 2;

    // Seed the placement at the cursor (or a sane fallback if the cursor
    // isn't over a page at click time).
    const target = pageCellAt(e ? e.clientX : -1, e ? e.clientY : -1);
    let page = target ? target.page : (maxPage(layout) || 1);
    let col = target ? target.col : Grid.CONTENT_COL;
    let row = target ? target.row : 4;

    const title = kind === 'entry' ? '' : 'New ' + kind[0].toUpperCase() + kind.slice(1);
    const activeLayer = (typeof Layers !== 'undefined') ? Layers.getActiveLayerId(page) : null;
    const item = { id, kind, page, col, row, w, h, layerId: activeLayer };
    if (kind !== 'entry') {
      item.sidebarTitle = title;
      item.title = title;
    }

    try {
      if (kind === 'entry') await API.createEntry(id, '', { empty: true });
      else await API.createEntry(id, title);
    } catch (err) {
      if (!err.message.includes('409')) console.warn('startAddEntry: could not create HTML file', err);
    }

    layout.entries.push(item);
    Renderer.renderTOC();
    EditMode.setDirty();

    // Rebuild the DOM so the new card exists, then begin placement.
    await new Promise(resolve => {
      Renderer.renderChapters();
      Renderer.loadAllEntries().then(() => {
        PageNumbers.paginate();
        enable();
        Renderer.renderTOC();
        resolve();
      });
    });

    const card = document.querySelector('.pages .grid-card[data-item-id="' + id + '"]');
    if (!card) { placement = null; return; }

    placement = { id, el: card, pageEl: card.closest('.page') };
    card.classList.add('placing');
    document.body.classList.add('placing-entry');

    // Snap to the cursor immediately so it tracks from the first frame.
    positionAtMouse(e.clientX, e.clientY);

    document.addEventListener('mousemove', onPlaceMove);
    document.addEventListener('mousedown', onPlaceDown, true);
    document.addEventListener('keydown', onPlaceKey);
  }

  // Move the placing card so its centre sits under the cursor, recomputing
  // ── Add Image Entry at the mouse (drag-to-place) ─────────────────────────
  // Mirror of startAddEntry, but the freshly created entry is seeded with a
  // single <img> (the chosen uploaded image) and defaults to kind 'entry'.
  // It then enters the same placement mode: the card follows the mouse until
  // the user presses the left button to drop it.
  async function startAddImageEntry(url) {
    if (placement) return;
    const layout = Renderer.getLayout();
    if (!layout) return;
    layout.entries = layout.entries || [];

    const id = 'entry-' + Date.now();
    const w = 6;
    const h = 2;

    const lastItem = layout.entries[layout.entries.length - 1];
    const startPage = lastItem && lastItem.page ? lastItem.page : 1;
    const slot = Grid.findFreeSlot(layout, startPage, 0, Grid.DEFAULTS.chapter.h, Grid.DEFAULTS.chapter.w);

    try {
      await API.createEntry(id, '', { empty: true });
      await API.saveEntry(id, '<img src="' + url + '" alt="">\n');
    } catch (err) {
      if (!err.message.includes('409')) console.warn('startAddImageEntry: could not create/seed entry', err);
    }

    const page = slot ? slot.page : (maxPage(layout) || 1);
    const col = slot ? slot.col : Grid.CONTENT_COL;
    const row = slot ? slot.row : 4;

    const activeLayer = (typeof Layers !== 'undefined') ? Layers.getActiveLayerId(page) : null;
    layout.entries.push({ id, kind: 'entry', page, col, row, w, h, layerId: activeLayer });
    Renderer.renderTOC();
    EditMode.setDirty();

    await new Promise(resolve => {
      Renderer.renderChapters();
      Renderer.loadAllEntries().then(() => {
        PageNumbers.paginate();
        enable();
        Renderer.renderTOC();
        resolve();
      });
    });

    const card = document.querySelector('.pages .grid-card[data-item-id="' + id + '"]');
    if (!card) { placement = null; return; }

    placement = { id, el: card, pageEl: card.closest('.page') };
    card.classList.add('placing');
    document.body.classList.add('placing-entry');

    document.addEventListener('mousemove', onPlaceMove);
    document.addEventListener('mousedown', onPlaceDown, true);
    document.addEventListener('keydown', onPlaceKey);
  }

  // the target page if the cursor crosses onto another page.
  function onPlaceMove(e) {
    if (!placement) return;
    positionAtMouse(e.clientX, e.clientY);
  }

  // Finalise placement on the next left-button press: stop following the
  // mouse, write the position back to the model, and re-sort the TOC.
  function onPlaceDown(e) {
    if (!placement) return;
    e.preventDefault();
    e.stopPropagation();
    const card = placement.el;
    document.removeEventListener('mousemove', onPlaceMove);
    document.removeEventListener('mousedown', onPlaceDown, true);
    document.removeEventListener('keydown', onPlaceKey);
    card.classList.remove('placing');
    document.body.classList.remove('placing-entry');
    syncLayoutFromCard(card);
    // If the entry landed on a different page, its layerId may no longer
    // belong to that page's layers — re-home it onto the new page's active
    // layer so it still groups correctly after the re-layout.
    if (typeof Layers !== 'undefined') {
      const layout = Renderer.getLayout();
      const id = card.dataset.itemId;
      const item = (layout.entries || []).find(en => en.id === id);
      if (item && typeof item.page === 'number') {
        const onPage = (layout.layers || []).some(l => l.id === item.layerId && l.page === item.page);
        if (!onPage) item.layerId = Layers.getActiveLayerId(item.page);
      }
    }
    Grid.sortEntriesByPosition(Renderer.getLayout());
    Renderer.renderTOC();
    EditMode.setDirty();
    placement = null;
  }

  // Escape during placement aborts the add entirely: drop the entry from the
  // model, delete its file, and rebuild.
  function onPlaceKey(e) {
    if (!placement) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelPlacement();
    }
  }

  function cancelPlacement() {
    const id = placement.id;
    document.removeEventListener('mousemove', onPlaceMove);
    document.removeEventListener('mousedown', onPlaceDown, true);
    document.removeEventListener('keydown', onPlaceKey);
    const card = placement.el;
    card.classList.remove('placing');
    document.body.classList.remove('placing-entry');
    placement = null;

    const layout = Renderer.getLayout();
    if (layout && layout.entries) {
      layout.entries = layout.entries.filter(en => en.id !== id);
    }
    API.deleteEntry(id).catch(() => {});
    rebuild();
  }

  // Position the placing card from viewport coords. The card's top-left
  // corner is locked to the cursor and is never clamped, so it can be placed
  // anywhere — including outside the page bounds.
  function positionAtMouse(clientX, clientY) {
    if (!placement) return;
    const card = placement.el;
    const item = Grid.findItem(Renderer.getLayout(), 'entry', placement.id);
    if (!item) return;
    const target = pageCellAt(clientX, clientY);
    if (!target) return;

    const w = Number(card.dataset.gridW);
    const h = Number(card.dataset.gridH);

    // Lock the card's top-left corner to the cursor (no clamping).
    const col = target.col;
    const row = target.row;

    item.page = target.page;
    item.col = col;
    item.row = row;

    // Move the element across pages if the cursor changed page.
    if (placement.pageEl !== target.pageEl) {
      target.pageEl.appendChild(card);
      placement.pageEl = target.pageEl;
    }
    PageNumbers.positionCard(card, col, row, w, h);
  }

  // Resolve viewport coords to the grid cell of the page under the cursor.
  // When the cursor isn't over any page (e.g. over the toolbar while placing)
  // it returns the nearest page instead of null, so a card being placed can
  // keep tracking the cursor everywhere — including outside the page bounds.
  function pageCellAt(clientX, clientY) {
    const pages = document.querySelectorAll('.pages .page');
    if (!pages.length) return null;
    let hit = null, hitDist = Infinity;
    pages.forEach(p => {
      const r = p.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        hit = p;
        hitDist = 0;
        return;
      }
      const dx = Math.max(r.left - clientX, 0, clientX - r.right);
      const dy = Math.max(r.top - clientY, 0, clientY - r.bottom);
      const d = dx * dx + dy * dy;
      if (d < hitDist) { hitDist = d; hit = p; }
    });
    if (!hit) return null;
    const zoom = getZoom();
    const r = hit.getBoundingClientRect();
    const localX = (clientX - r.left) / zoom;
    const localY = (clientY - r.top) / zoom;
    return {
      page: Number(hit.dataset.page),
      pageEl: hit,
      col: Math.round(localX / Grid.CELL_W),
      row: Math.round(localY / Grid.CELL_H)
    };
  }

  function maxPage(layout) {
    let m = 0;
    (layout.entries || []).forEach(it => { if (typeof it.page === 'number' && it.page > m) m = it.page; });
    return m;
  }

  // ── Drag-to-grid positioning ───────────────
  function bindDragGlobal() {
    document.addEventListener('mousedown', onCardMouseDown, true);
    document.addEventListener('mousemove', onHoverMove);
  }

  let _dragListenerBound = false;
  // Card currently under the hover-affordance scan, so we can clear its
  // spill-hover class when the pointer leaves it (even onto empty space).
  let _lastHoverCard = null;
  // Pending timer that reveals the drag "lift" (opacity/shadow/z-index).
  // Held back so a plain click or the first half of a double-click never
  // flashes the card up — only a real drag (or the double-click window
  // elapsing with no second click) commits to the lifted look.
  let _dragLiftTimer = null;
  // Delay before we treat a press as a genuine drag and show the lift.
  // Sits just under the OS double-click threshold so double-clicks stay
  // inert while a held-and-moved press still feels instant once it moves.
  const DRAG_LIFT_DELAY = 200;
  // How close (in screen px) to a card's edge the pointer must be to start
  // a resize instead of a move. Applies both just inside AND a little
  // outside the box, so the handles don't need pixel-perfect aim.
  const RESIZE_TOL = 13;
  function onCardMouseDown(e) {
    if (drag || resize) return;
    if (placement) return;
    if (e.button !== 0) return;

    // Resolve the card we're acting on. If the pointer is over a card, use
    // it. Otherwise (cursor just outside a card's box) search the page for
    // the nearest card whose edge is within tolerance.
    let card = e.target.closest && e.target.closest('.grid-card');
    let edge = card ? edgeForPoint(card.getBoundingClientRect(), e.clientX, e.clientY, RESIZE_TOL) : '';

    if (!card) {
      const pageEl = e.target.closest && e.target.closest('.page');
      if (pageEl) {
        let best = null, bestDist = Infinity;
        pageEl.querySelectorAll('.grid-card').forEach(c => {
          if (!c.dataset.itemType) return;
          if (c.getAttribute('contenteditable') === 'true') return;
          const r = c.getBoundingClientRect();
          if (!edgeForPoint(r, e.clientX, e.clientY, RESIZE_TOL)) return;
          const dist = Math.min(
            Math.abs(e.clientX - r.left), Math.abs(e.clientX - r.right),
            Math.abs(e.clientY - r.top), Math.abs(e.clientY - r.bottom)
          );
          if (dist < bestDist) { bestDist = dist; best = c; }
        });
        if (best) { card = best; edge = edgeForPoint(best.getBoundingClientRect(), e.clientX, e.clientY, RESIZE_TOL); }
      }
    }

    if (!card) return;
    const pageEl = card.closest('.page');
    if (!pageEl) return;
    if (!card.dataset.itemType) return;
    // While a card is being edited inline (contenteditable), let the user
    // click into the text instead of dragging the card around.
    if (card.getAttribute('contenteditable') === 'true') return;
    if (e.target.closest('button, input, select, .struct-btn, .entry-actions, .resize-handle')) return;

    // Only act from within the card's ACTUAL bounding box (the blue boundary).
    // Content spilling OUTSIDE the box (the orange overflow) must not start a
    // drag or a resize — grab the entry only from inside its bounds. Resize
    // handles still work via their own listener.
    const br = card.getBoundingClientRect();
    const insideBox = e.clientX >= br.left && e.clientX <= br.right &&
                      e.clientY >= br.top  && e.clientY <= br.bottom;
    if (!insideBox) return;

    // Near an edge → resize that edge; otherwise → move the card.
    if (edge) {
      startResize(card, edge, e);
      return;
    }

    if (!_dragListenerBound) {
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
      _dragListenerBound = true;
    }

    e.preventDefault();
    const zoom = getZoom();
    const rect = card.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();
    const startLeft = (rect.left - pageRect.left) / zoom;
    const startTop = (rect.top - pageRect.top) / zoom;
    drag = {
      el: card,
      pageEl,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origLeft: startLeft,
      origTop: startTop,
      // Cursor offset from the card's top-left, in layout px, so the grab
      // point stays under the cursor even when the card is re-parented to
      // another page mid-drag.
      grabDX: ((e.clientX - pageRect.left) / zoom) - startLeft,
      grabDY: ((e.clientY - pageRect.top) / zoom) - startTop,
      w: Number(card.dataset.gridW),
      h: Number(card.dataset.gridH),
      zoom
    };
    // Don't lift/transparency-fade the card yet — wait until we're sure
    // this isn't a click or the first half of a double-click.
    if (_dragLiftTimer) clearTimeout(_dragLiftTimer);
    _dragLiftTimer = setTimeout(() => {
      if (drag && drag.el === card) card.classList.add('dragging');
      _dragLiftTimer = null;
    }, DRAG_LIFT_DELAY);
  }

  // Hover-affordance scan: the cursor and resize handles must reflect the
  // card's BLUE boundary, never the orange overflow. When the pointer is
  // geometrically outside the box (over the spill), mark the card
  // .spill-hover so CSS hides the handles and shows the default cursor.
  // Resize handles (which sit ~5px outside the box) stay exempt so they
  // remain grabbable.
  function onHoverMove(e) {
    if (drag || resize || placement) return;
    const card = e.target.closest ? e.target.closest('.grid-card') : null;
    if (_lastHoverCard && _lastHoverCard !== card) {
      _lastHoverCard.classList.remove('spill-hover');
      _lastHoverCard = null;
    }
    if (!card) return;
    if (!document.body.classList.contains('edit-mode')) { _lastHoverCard = card; return; }
    if (e.target.closest('.resize-handle')) { _lastHoverCard = card; return; }
    const br = card.getBoundingClientRect();
    const insideBox = e.clientX >= br.left && e.clientX <= br.right &&
                      e.clientY >= br.top  && e.clientY <= br.bottom;
    card.classList.toggle('spill-hover', !insideBox);
    _lastHoverCard = card;
  }

  function getZoom() {
    const main = document.getElementById('main-content');
    return parseFloat(main && main.style.zoom) || 1;
  }

  function onDragMove(e) {
    if (!drag) return;
    const dx = (e.clientX - drag.startClientX) / drag.zoom;
    const dy = (e.clientY - drag.startClientY) / drag.zoom;
    // Real movement means this is a drag, not a double-click — commit to the
    // lifted look immediately instead of waiting out the delay timer.
    if (_dragLiftTimer && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      clearTimeout(_dragLiftTimer);
      _dragLiftTimer = null;
      drag.el.classList.add('dragging');
    }
    // Keep the grabbed point under the cursor and let the card move onto
    // whatever page is under the cursor (incl. outside the page bounds).
    const target = pageCellAt(e.clientX, e.clientY);
    if (!target) return;
    const pageEl = target.pageEl;
    const pageRect = pageEl.getBoundingClientRect();
    const newLeft = ((e.clientX - pageRect.left) / drag.zoom) - drag.grabDX;
    const newTop  = ((e.clientY - pageRect.top) / drag.zoom) - drag.grabDY;
    const col = Math.round(newLeft / Grid.CELL_W);
    const row = Math.round(newTop  / Grid.CELL_H);
    if (drag.pageEl !== pageEl) {
      pageEl.appendChild(drag.el);
      drag.pageEl = pageEl;
    }
    PageNumbers.positionCard(drag.el, col, row, drag.w, drag.h);
  }

  function onDragEnd(e) {
    if (!drag) return;
    const el = drag.el;
    if (_dragLiftTimer) { clearTimeout(_dragLiftTimer); _dragLiftTimer = null; }
    el.classList.remove('dragging');
    // A click (no real movement) is a no-op: don't dirty the layout or
    // reorder entries. This also keeps double-click-to-edit clean — its two
    // component clicks must not mark the card as changed.
    const moved = e && (Math.abs(e.clientX - drag.startClientX) > 2 || Math.abs(e.clientY - drag.startClientY) > 2);
    if (!moved) {
      drag = null;
      return;
    }
    syncLayoutFromCard(el);
    // Keep the flat list ordered by visual position so the TOC sidebar
    // structure follows where cards actually sit. No parent/child logic.
    Grid.sortEntriesByPosition(Renderer.getLayout());
    Renderer.renderTOC();
    EditMode.setDirty();
    drag = null;
  }

  // ── Resize (drag handles) ───────────────────
  // Resizing changes the card's grid rectangle: edge handles move the
  // corresponding side (updating col/row), corner handles move two sides.
  // All maths run in un-zoomed layout px (the px the grid model uses);
  // the starting rect is divided by the current zoom to undo getBounding-
  // ClientRect's scaling, matching how onDragMove handles movement.
  let _resizeListenerBound = false;
  function onResizeDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const handle = e.currentTarget;
    const card = handle.closest('.grid-card');
    if (!card) return;
    if (card.getAttribute('contenteditable') === 'true') return;
    startResize(card, handle.dataset.edge, e);
  }

  // Begin a resize on `edge` (one of n/s/e/w/ne/nw/se/sw) for `card`,
  // using the pointer position in `e` as the anchor. Shared by the
  // visible handles and proximity-based grabbing near a card's edge.
  function startResize(card, edge, e) {
    const pageEl = card.closest('.page');
    if (!pageEl) return;
    const rect = card.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();
    const zoom = getZoom();
    resize = {
      el: card,
      edge,
      pageEl,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origLeft: (rect.left - pageRect.left) / zoom,
      origTop: (rect.top - pageRect.top) / zoom,
      origW: parseFloat(card.style.width) || Number(card.dataset.gridW) * Grid.CELL_W,
      origH: parseFloat(card.style.height) || Number(card.dataset.gridH) * Grid.CELL_H,
      zoom
    };
    card.classList.add('resizing');

    if (!_resizeListenerBound) {
      document.addEventListener('mousemove', onResizeMove);
      document.addEventListener('mouseup', onResizeEnd);
      _resizeListenerBound = true;
    }
  }

  // Work out which edge(s) of a card's rect the point (x,y) is near. Uses
  // signed distance so it works both just inside AND a little outside the
  // box. Returns '' if the point is not within `tol` of any edge.
  function edgeForPoint(rect, x, y, tol) {
    const dLeft = x - rect.left;
    const dRight = rect.right - x;
    const dTop = y - rect.top;
    const dBottom = rect.bottom - y;
    const near = (d) => Math.abs(d) <= tol;
    const n = near(dTop) ? 'n' : '';
    const s = near(dBottom) ? 's' : '';
    const w = near(dLeft) ? 'w' : '';
    const e = near(dRight) ? 'e' : '';
    return n + s + w + e;
  }

  function onResizeMove(e) {
    if (!resize) return;
    const dx = (e.clientX - resize.startClientX) / resize.zoom;
    const dy = (e.clientY - resize.startClientY) / resize.zoom;
    const { origLeft, origTop, origW, origH, edge } = resize;

    let left = origLeft, top = origTop, w = origW, h = origH;
    const hasW = edge.indexOf('w') >= 0;
    const hasE = edge.indexOf('e') >= 0;
    const hasN = edge.indexOf('n') >= 0;
    const hasS = edge.indexOf('s') >= 0;

    if (hasE) w = origW + dx;
    if (hasW) { left = origLeft + dx; w = origW - dx; }
    if (hasS) h = origH + dy;
    if (hasN) { top = origTop + dy; h = origH - dy; }

    // Minimum 6 cells wide, 1 cell tall; keep the opposite edge fixed when
    // the min is hit by shifting the moving edge back.
    const minW = 6 * Grid.CELL_W, minH = Grid.CELL_H;
    if (w < minW) { if (hasW) left -= (minW - w); w = minW; }
    if (h < minH) { if (hasN) top -= (minH - h); h = minH; }

    // Lock to the grid: only whole cells are allowed — no free-form sizing.
    // Snap every edge to a cell boundary so the card can never sit between
    // grid lines while dragging. No page-bound clamping: cards may be placed
    // partly or fully outside the page (clipped by the page's overflow).
    const cw = Grid.CELL_W, ch = Grid.CELL_H;
    left = Math.round(left / cw) * cw;
    top  = Math.round(top / ch) * ch;
    w    = Math.max(6 * cw, Math.round(w / cw) * cw);
    h    = Math.max(ch, Math.round(h / ch) * ch);

    resize.el.style.left = left + 'px';
    resize.el.style.top = top + 'px';
    resize.el.style.width = w + 'px';
    resize.el.style.height = h + 'px';
    checkOverflow(resize.el);
  }

  function onResizeEnd() {
    if (!resize) return;
    const el = resize.el;
    el.classList.remove('resizing');

    // Snap the live px rect to grid cells and write back into the model.
    const left = parseFloat(el.style.left) || 0;
    const top = parseFloat(el.style.top) || 0;
    const w = parseFloat(el.style.width) || Grid.CELL_W;
    const h = parseFloat(el.style.height) || Grid.CELL_H;

    const col = Math.round(left / Grid.CELL_W);
    const row = Math.round(top / Grid.CELL_H);
    const cw = Math.max(6, Math.round(w / Grid.CELL_W));
    const ch = Math.max(1, Math.round(h / Grid.CELL_H));

    const id = el.dataset.itemId;
    const layout = Renderer.getLayout();
    const item = Grid.findItem(layout, 'entry', id);
    if (item) {
      item.col = col;
      item.row = row;
      item.w = cw;
      item.h = ch;
    }
    // Re-apply snapped values so the card sits exactly on the grid.
    PageNumbers.positionCard(el, col, row, cw, ch);
    checkOverflow(el);
    Grid.sortEntriesByPosition(layout);
    Renderer.renderTOC();
    EditMode.setDirty();
    resize = null;

    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
    _resizeListenerBound = false;
  }

  // ── Helpers ───────────────────────────────
  function makeBtn(content, title, danger) {
    const btn = document.createElement('button');
    btn.className = 'struct-btn' + (danger ? ' danger' : '');
    if (title) btn.setAttribute('data-tooltip', title);
    if (content == null) {
      // no visible label (caller sets one separately)
    } else if (typeof content === 'string') {
      btn.textContent = content;
    } else if (content instanceof Node) {
      btn.classList.add('icon-btn');
      btn.appendChild(content);
    }
    return btn;
  }

  // Inline SVG icon factory (stroke uses currentColor so danger styling applies).
  function svgIcon(paths, opts) {
    opts = opts || {};
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', opts.viewBox || '0 0 24 24');
    svg.setAttribute('width', opts.size || '14');
    svg.setAttribute('height', opts.size || '14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', opts.sw || '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    (Array.isArray(paths) ? paths : [paths]).forEach(d => {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  function pencilIcon() {
    return svgIcon([
      'M12 20h9',
      'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z'
    ]);
  }

  function trashIcon() {
    return svgIcon([
      'M3 6h18',
      'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
      'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
      'M10 11v6',
      'M14 11v6'
    ]);
  }

  function eyeIcon() {
    return svgIcon([
      'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z',
      'M12 9a3 3 0 1 0 0.0001 0z'
    ]);
  }

  function eyeOffIcon() {
    return svgIcon([
      'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24',
      'M1 1l22 22'
    ]);
  }

  function zUpIcon() {
    return svgIcon([
      'M12 19V5',
      'M5 12l7-7 7 7'
    ], { viewBox: '0 0 24 24' });
  }

  function zDownIcon() {
    return svgIcon([
      'M12 5v14',
      'M5 12l7 7 7-7'
    ], { viewBox: '0 0 24 24' });
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c);
  }

  return { enable, disable, syncLayoutFromDOM, rebuild, repack, flushPendingEdits, clearPendingEdits, startAddEntry, startAddImageEntry, checkOverflow, checkAllOverflows };
})();
