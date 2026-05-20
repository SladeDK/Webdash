if (!document._keyboardHandler) {
  document._keyboardHandler = true;

  document.addEventListener('keydown', (e) => {
    const confirmOverlay = document.getElementById('confirm-overlay');
    const confirmOpen = confirmOverlay && !confirmOverlay.hidden;

    // ===============================
    // ENTER = confirm delete
    // ===============================
    if (e.key === 'Enter' && confirmOpen) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof confirmCallback === 'function') {
        confirmCallback();
      }
      closeConfirm();
      return;
    }

    // ===============================
    // ESCAPE handling (layered)
    // ===============================
    if (e.key !== 'Escape') return;

    // Inline rename always wins
    if (renamingDashboardId !== null || renamingCategoryId !== null) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Modal stack behavior
    const top = getTopModal();

    if (top) {
      e.preventDefault();
      e.stopPropagation();
      top.onClose();
      return;
    }

    // Fallback: close dropdowns
    if (typeof closeAllDropdowns === 'function') {
      e.preventDefault();
      e.stopPropagation();
      closeAllDropdowns();
    }
  })
};