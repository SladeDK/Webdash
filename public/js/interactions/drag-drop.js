// ============================
// Touch drag & drop bridge
// ============================
//
// WebDash reorders dashboards, categories, items and favorites with the
// HTML5 drag-and-drop API (draggable / dragstart / dragover / drop).
// That API never fires from touch input, so on a phone or tablet none of
// those lists can be reordered at all.
//
// Rather than reimplement four working drag flows, this module bridges
// touch input to the events those flows already listen for: a long press
// on a [draggable] element starts a synthetic drag, and finger movement
// dispatches real dragstart/dragenter/dragover/dragleave/drop/dragend
// events at the element under the finger.
//
// Consequences worth knowing:
//  - Mouse and pen input are ignored entirely (pointerType !== 'touch'),
//    so desktop keeps using the native API untouched.
//  - Because the synthetic events are dispatched on the true element under
//    the finger and bubble normally, existing handlers that read
//    e.target.closest(...), e.clientY or e.relatedTarget all keep working.
//  - Auto-scrolling is deliberately NOT implemented here. The layout editor
//    runs its own scroll loop off dragover, so adding a second one would
//    scroll at double speed.

(() => {
  'use strict';

  const LONG_PRESS_MS = 300;   // hold before a drag begins
  const MOVE_TOLERANCE = 10;   // px of drift that cancels the pending press
  const ROW_SELECTORS = [
    '.layout-category',
    '.layout-item',
    '.layout-dashboard'
  ].join(',');

  let pending = null; // { source, x, y, timer, pointerId }
  let active = null;  // { source, ghost, target, dataTransfer, offsetX, offsetY }

  // ------------------------------------------------------------------
  // Event synthesis
  // ------------------------------------------------------------------

  function makeDataTransfer() {
    try {
      return new DataTransfer();
    } catch {
      // Minimal stand-in for engines that don't allow construction.
      const store = new Map();
      return {
        dropEffect: 'move',
        effectAllowed: 'all',
        files: [],
        items: [],
        get types() { return [...store.keys()]; },
        setData(type, value) { store.set(type, String(value)); },
        getData(type) { return store.get(type) ?? ''; },
        clearData(type) { type ? store.delete(type) : store.clear(); },
        setDragImage() {}
      };
    }
  }

  function fireDragEvent(type, target, { clientX, clientY, dataTransfer, relatedTarget = null }) {
    if (!target) return false;

    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
      relatedTarget,
      dataTransfer
    };

    let event;
    try {
      event = new DragEvent(type, init);
    } catch {
      event = new MouseEvent(type, init);
    }

    // Some engines build a DragEvent with a null dataTransfer regardless of
    // the init dict, so attach ours when it didn't survive construction.
    if (!event.dataTransfer) {
      try {
        Object.defineProperty(event, 'dataTransfer', {
          value: dataTransfer,
          configurable: true
        });
      } catch {
        /* handlers that need dataTransfer will no-op; ordering still works */
      }
    }

    target.dispatchEvent(event);
    return event.defaultPrevented;
  }

  // ------------------------------------------------------------------
  // Drag ghost — setDragImage() does nothing for synthetic drags, so the
  // element that follows the finger has to be a real DOM node.
  // ------------------------------------------------------------------

  function createGhost(source, clientX, clientY) {
    const row = source.closest(ROW_SELECTORS) || source;
    const rect = row.getBoundingClientRect();

    const ghost = row.cloneNode(true);
    ghost.classList.add('touch-drag-ghost');
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));

    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;

    document.body.appendChild(ghost);

    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    positionGhost(ghost, clientX, clientY, offsetX, offsetY);

    return { ghost, offsetX, offsetY };
  }

  function positionGhost(ghost, clientX, clientY, offsetX, offsetY) {
    ghost.style.transform =
      `translate3d(${clientX - offsetX}px, ${clientY - offsetY}px, 0)`;
  }

  // ------------------------------------------------------------------
  // Drag lifecycle
  // ------------------------------------------------------------------

  function elementUnderFinger(clientX, clientY) {
    // The ghost carries pointer-events:none, so it never occludes the hit test.
    return document.elementFromPoint(clientX, clientY);
  }

  function beginDrag(source, clientX, clientY) {
    const dataTransfer = makeDataTransfer();
    const { ghost, offsetX, offsetY } = createGhost(source, clientX, clientY);

    active = { source, ghost, target: null, dataTransfer, offsetX, offsetY };

    document.documentElement.classList.add('touch-dragging');
    fireDragEvent('dragstart', source, { clientX, clientY, dataTransfer });

    if (navigator.vibrate) {
      try { navigator.vibrate(15); } catch { /* best effort */ }
    }
  }

  function moveDrag(clientX, clientY) {
    if (!active) return;

    positionGhost(active.ghost, clientX, clientY, active.offsetX, active.offsetY);

    const over = elementUnderFinger(clientX, clientY);
    const { dataTransfer } = active;

    if (over !== active.target) {
      if (active.target) {
        fireDragEvent('dragleave', active.target, {
          clientX, clientY, dataTransfer, relatedTarget: over
        });
      }
      if (over) {
        fireDragEvent('dragenter', over, {
          clientX, clientY, dataTransfer, relatedTarget: active.target
        });
      }
      active.target = over;
    }

    if (over) {
      fireDragEvent('dragover', over, { clientX, clientY, dataTransfer });
    }
  }

  function endDrag(clientX, clientY, { cancelled = false } = {}) {
    if (!active) return;

    const { source, ghost, dataTransfer } = active;
    const target = cancelled ? null : elementUnderFinger(clientX, clientY);

    // Drop first, then dragend — matching the native ordering the existing
    // handlers assume (dragend does the cleanup pass).
    if (target) {
      fireDragEvent('drop', target, { clientX, clientY, dataTransfer });
    }
    fireDragEvent('dragend', source, { clientX, clientY, dataTransfer });

    ghost.remove();
    document.documentElement.classList.remove('touch-dragging');
    active = null;
  }

  function cancelPending() {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
  }

  // ------------------------------------------------------------------
  // Input handling
  // ------------------------------------------------------------------

  function findDraggable(node) {
    let el = node instanceof Element ? node : null;
    while (el && el !== document.body) {
      if (el.draggable === true || el.getAttribute('draggable') === 'true') return el;
      el = el.parentElement;
    }
    return null;
  }

  document.addEventListener('pointerdown', e => {
    // Mouse and pen keep the native drag-and-drop path.
    if (e.pointerType !== 'touch' || active) return;

    const source = findDraggable(e.target);
    if (!source) return;

    pending = {
      source,
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      timer: setTimeout(() => {
        const p = pending;
        pending = null;
        if (p) beginDrag(p.source, p.x, p.y);
      }, LONG_PRESS_MS)
    };
  }, { passive: true });

  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch') return;

    if (pending) {
      // Drifting before the press completes means the user is scrolling.
      const dx = Math.abs(e.clientX - pending.x);
      const dy = Math.abs(e.clientY - pending.y);
      if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) cancelPending();
      return;
    }

    if (active) moveDrag(e.clientX, e.clientY);
  }, { passive: true });

  document.addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch') return;
    cancelPending();
    if (active) endDrag(e.clientX, e.clientY);
  });

  document.addEventListener('pointercancel', e => {
    if (e.pointerType !== 'touch') return;
    cancelPending();
    if (active) endDrag(e.clientX, e.clientY, { cancelled: true });
  });

  // Suppressing scroll requires a non-passive touchmove listener;
  // preventDefault on pointermove does not stop panning.
  document.addEventListener('touchmove', e => {
    if (active) e.preventDefault();
  }, { passive: false });

  // Long-press otherwise raises the text-selection callout / context menu.
  document.addEventListener('contextmenu', e => {
    if (active || pending) e.preventDefault();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && active) endDrag(0, 0, { cancelled: true });
  });
})();
