// =====================================================
// Modal stack (single source of truth for modal state)
// =====================================================
const modalStack = [];

function pushModal(overlay, onClose) {
  const restoreFocusTo = document.activeElement;

  modalStack.push({
    overlay,
    onClose,
    restoreFocusTo
  });
}

function popModal(overlay) {
  const index = modalStack.findIndex(m => m.overlay === overlay);
  if (index === -1) return;

  const [{ restoreFocusTo }] = modalStack.splice(index, 1);

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
document.addEventListener('mousedown', (e) => {
  const top = getTopModal();
  if (!top) return;

  const { overlay, onClose } = top;
  const modal = overlay.querySelector('.modal-container');

  // Only close if clicking outside the modal container
  if (modal && !modal.contains(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  }
});

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

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  pushModal(overlay, closeConfirm);

  requestAnimationFrame(() => {
    focusFirstFocusableElement(overlay);
  });
}

function closeConfirm() {
  const overlay = document.getElementById('confirm-overlay');
  if (!overlay) return;

  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  confirmCallback = null;

  popModal(overlay);
}

// =====================================================
// Confirm modal button wiring (must come AFTER helpers)
// =====================================================
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmAccept = document.getElementById('confirm-accept');

confirmCancel?.addEventListener('click', closeConfirm);

confirmOverlay
  ?.querySelector('.modal-close')
  ?.addEventListener('click', closeConfirm);

confirmAccept?.addEventListener('click', () => {
  if (typeof confirmCallback === 'function') {
    confirmCallback();
  }
  closeConfirm();
});