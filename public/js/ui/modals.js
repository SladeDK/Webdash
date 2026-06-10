// =====================================================
// Modal stack (single source of truth for modal state)
// =====================================================
const modalStack = [];

// Modal invariant assertions (dev-time)
function assertModalInvariants(context = '') {
  if (modalStack.length === 0) return;

  const top = getTopModal();
  if (!top || !top.overlay) {
    console.error(
      '[Invariant] modalStack corrupted or top modal invalid',
      { modalStack, context }
    );
  }

  // Overlays in stack must be visible
  modalStack.forEach(({ overlay }, index) => {
    if (overlay.hidden) {
      console.error(
        '[Invariant] modal in stack is hidden',
        { index, overlay, context }
      );
    }
  });
}

function pushModal(overlay, onClose) {
  const restoreFocusTo = document.activeElement;

  modalStack.push({
    overlay,
    onClose,
    restoreFocusTo
  });
  assertModalInvariants('after pushModal');
}

function popModal(overlay) {
  const index = modalStack.findIndex(m => m.overlay === overlay);
  if (index === -1) return;

  const [{ restoreFocusTo }] = modalStack.splice(index, 1);
  assertModalInvariants('after popModal');

  // Restore focus AFTER removal
  requestAnimationFrame(() => {
    if (restoreFocusTo && typeof restoreFocusTo.focus === 'function') {
      restoreFocusTo.focus();
    }
  });
}

function getTopModal() {
  return modalStack[modalStack.length - 1] || null;
}

function focusFirstElement(container) {
  const focusable = container.querySelector(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );

  focusable?.focus();
}

function focusFirstFocusableElement(overlay) {
  const focusableSelectors = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ];

  const focusable = overlay.querySelector(focusableSelectors.join(','));
  if (focusable && typeof focusable.focus === 'function') {
    focusable.focus();
  }
}

// =====================================================
// Global click-outside handler (modal-stack driven)
// =====================================================
if (!document._modalOutsideHandler) {
  document._modalOutsideHandler = true;

  document.addEventListener('mousedown', (e) => {
    const top = getTopModal();
    if (!top) return;

    const { overlay, onClose } = top;
    const modal = overlay.querySelector('.modal-container');

    const isInsideModal = modal && modal.contains(e.target);
    const isInsideToast = e.target.closest('#toast-container');

    // Only close when clicking truly outside modal UI
    if (!isInsideModal && !isInsideToast) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  });
}

// =====================================================
// Confirmation modal helper function
// =====================================================

let confirmCallback = null;

function openConfirm({ title, message, confirmLabel = 'Delete', onConfirm }) {
  const overlay = document.getElementById('confirm-overlay');
  const titleEl = document.getElementById('confirm-title');
  const messageEl = document.getElementById('confirm-message');
  const confirmBtn = document.getElementById('confirm-accept');

  if (!overlay || !titleEl || !messageEl || !confirmBtn) return;

  // Title
  titleEl.textContent = title;

  // Message: support string OR DOM node
  messageEl.innerHTML = '';
  if (typeof message === 'string') {
    messageEl.textContent = message;
  } else if (message instanceof Node) {
    messageEl.appendChild(message);
  }

  // Confirm button
  confirmBtn.textContent = confirmLabel;

  // Store callback
  confirmCallback = onConfirm;

  // OPEN with animation support
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  // Force animation trigger (same as preferences)
  overlay.classList.add('pre-open');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.remove('pre-open');
    });
  });

  pushModal(overlay, closeConfirm);

  setTimeout(() => {
    document.getElementById('confirm-accept')?.focus();
  }, 0);
}

function closeConfirm() {
  const overlay = document.getElementById('confirm-overlay');
  if (!overlay) return;

  // Start closing animation
  overlay.classList.add('is-closing');
  overlay.setAttribute('aria-hidden', 'true');

  // Delay actual removal
  setTimeout(() => {
    overlay.hidden = true;

    // cleanup
    overlay.classList.remove('is-closing');

    confirmCallback = null;

    popModal(overlay);
  }, 160);
}

// =====================================================
// Confirm modal button wiring (must come AFTER helpers)
// =====================================================
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmAccept = document.getElementById('confirm-accept');

if (confirmCancel && !confirmCancel._wired) {
  confirmCancel._wired = true;
  confirmCancel.addEventListener('click', closeConfirm);
}

const confirmCloseBtn = confirmOverlay
  ?.querySelector('.modal-close');

if (confirmCloseBtn && !confirmCloseBtn._wired) {
  confirmCloseBtn._wired = true;
  confirmCloseBtn.addEventListener('click', closeConfirm);
}

if (confirmAccept && !confirmAccept._wired) {
  confirmAccept._wired = true;
  confirmAccept.addEventListener('click', () => {
    if (typeof confirmCallback === 'function') {
      const cb = confirmCallback;
      confirmCallback = null;
      cb();
    }
    closeConfirm();
  });
}