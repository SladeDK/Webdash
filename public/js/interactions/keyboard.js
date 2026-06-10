if (!document._keyboardHandler) {
  document._keyboardHandler = true;

  document.addEventListener('keydown', (e) => {

    const confirmOverlay = document.getElementById('confirm-overlay');
    const confirmOpen = confirmOverlay && !confirmOverlay.hidden;

    // ===============================
    // CTRL + K → Command palette (GLOBAL)
    // ===============================
    if (e.ctrlKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      e.stopPropagation();

      if (typeof toggleCommandPalette === 'function') {
        toggleCommandPalette();
      }

      return;
    }

    // ===============================
    // ENTER = confirm dialog (only if open)
    // ===============================
    if (e.key === 'Enter' && confirmOpen) {
      const active = document.activeElement;

      // ONLY confirm if "Continue" is focused
      if (active && active.id === 'confirm-accept') {
        e.preventDefault();
        e.stopPropagation();

        confirmCallback?.();
        closeConfirm();
      }

      // Otherwise let browser handle it
      return;
    }

    // ===============================
    // ESCAPE handling (layered system)
    // ===============================
    if (e.key !== 'Escape') return;

    // Command palette ALWAYS has priority
    const palette = document.getElementById('command-palette');
    if (palette && !palette.hidden) {
      e.preventDefault();
      e.stopPropagation();

      if (typeof closeCommandPalette === 'function') {
        closeCommandPalette();
      }

      return;
    }

    // Inline rename protection
    const isRenamingIdentitySafe =
      typeof isRenamingIdentity !== 'undefined' &&
      isRenamingIdentity === true;

    if (
      renamingDashboardId !== null ||
      renamingCategoryId !== null ||
      isRenamingIdentitySafe
    ) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Modal stack handling
    const top = typeof getTopModal === 'function' ? getTopModal() : null;

    if (top) {
      e.preventDefault();
      e.stopPropagation();
      top.onClose?.();
      return;
    }

    // Fallback → dropdowns
    if (typeof closeAllDropdowns === 'function') {
      e.preventDefault();
      e.stopPropagation();
      closeAllDropdowns();
    }
  });
}