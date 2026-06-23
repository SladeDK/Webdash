if (!document._keyboardHandler) {
  document._keyboardHandler = true;

  document.addEventListener('keydown', (e) => {

    const key = e.key;

    const confirmOverlay = document.getElementById('confirm-overlay');
    const confirmOpen = confirmOverlay && !confirmOverlay.hidden;

    // ===============================
    // CTRL / CMD + K → Command palette (GLOBAL)
    // ===============================
    if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'k') {
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
    if (key === 'Enter' && confirmOpen) {
      const active = document.activeElement;

      if (active && active.id === 'confirm-accept') {
        e.preventDefault();
        e.stopPropagation();

        confirmCallback?.();
        closeConfirm();
      }

      return;
    }

    // ===============================
    // ESCAPE handling (layered system)
    // ===============================
    if (key === 'Escape') {

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

      // Inline rename protection (but allow cancel)
      const isRenamingIdentitySafe =
        typeof isRenamingIdentity !== 'undefined' &&
        isRenamingIdentity === true;

      if (
        renamingDashboardId !== null ||
        renamingCategoryId !== null ||
        isRenamingIdentitySafe
      ) {
        // Let rename handlers handle ESC themselves
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
        return;
      }
    }
  });
}