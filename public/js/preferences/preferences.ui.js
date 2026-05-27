// ======================================================================
// PREFERENCES UI
// ======================================================================
//
// Owns all DOM references and user interaction wiring related to the
// Preferences interface.
//
// Responsibilities:
// - Query preferences-related DOM elements
// - Wire event listeners (checkboxes, inputs, buttons, cards)
// - Open/close preferences and import modals
// - Delegate actions to preferences.state and preferences.import
// - Handle purely visual or interaction-based behavior
//
// Does NOT:
// - Define preference semantics or persistence logic
// - Execute import/export/reset operations directly
// - React to lifecycle or environment-driven events
//
// This file is the UI-to-logic bridge.
//



// ======================================================================
// DOM REFERENCES
// ======================================================================

const syncAppearanceCheckbox = document.getElementById('pref-sync-dashboard-appearance');
const syncIdentityCheckbox = document.getElementById('pref-sync-dashboard-identity');

const importSystemClose = document.getElementById('import-system-close');
const importSystemCancel = document.getElementById('import-system-cancel');
const importSystemConfirm = document.getElementById('import-system-confirm');

const importPreviewOverlay = document.getElementById('import-preview-overlay');
const importPreviewContent = document.getElementById('import-preview-content');
const importPreviewClose = document.getElementById('import-preview-close');
const importPreviewCancel = document.getElementById('import-preview-cancel');
const importPreviewConfirm = document.getElementById('import-preview-confirm');

const preferencesOverlay = document.getElementById('preferences-overlay');
const preferencesButton = document.getElementById('settings-button');

const deleteDefaultOverlay = document.getElementById('delete-default-dashboard-overlay');
const deleteDefaultSelect = document.getElementById('delete-default-dashboard-select');
const deleteDefaultConfirm = document.getElementById('delete-default-dashboard-confirm');
const deleteDefaultCancel = document.getElementById('delete-default-dashboard-cancel');
const deleteDefaultClose = document.getElementById('delete-default-dashboard-close');

const closeButton = preferencesOverlay?.querySelector('.modal-close');
const navItems = preferencesOverlay?.querySelectorAll('.nav-item');
const panels = preferencesOverlay?.querySelectorAll('.panel');

const importSystemOverlay = document.getElementById('import-system-overlay');

const openLinksCheckbox = document.getElementById('pref-open-links-new-tab');
const autoCloseCheckbox = document.getElementById('pref-dropdown-autoclose');

const themeRadios = document.querySelectorAll('input[name="pref-theme"]');
const themeCards = document.querySelectorAll('.theme-card:not(.bg-card)');
const backgroundCards = document.querySelectorAll('.bg-card');

const identityNameInput = document.querySelector('.identity-name-input');
const identityIconWrapper = document.querySelector('.identity-icon-wrapper');
const identityIconInput = document.getElementById('identity-icon-input');
const identityResetBtn = document.querySelector('.identity-reset-btn');

const exportDashboardBtn = document.getElementById('export-dashboard-btn');
const importDashboardBtn = document.getElementById('import-dashboard-btn');
const importDashboardFile = document.getElementById('import-dashboard-file');
const resetDashboardBtn = document.getElementById('reset-dashboard-btn');

let isRenamingIdentity = false;
let pendingIdentityName = '';

// ======================================================================
// UI Utilities
// ======================================================================

// Prevents double-clicking async actions (e.g. buttons)
function guardAsync(fn) {
  let running = false;

  return async (...args) => {
    if (running) return;
    running = true;

    try {
      await fn(...args);
    } finally {
      running = false;
    }
  };
}

// ======================================================================
// Register Import UI Context (Dependency Injection)
// ======================================================================

registerImportUI({
  systemOverlay: importSystemOverlay,
  previewOverlay: importPreviewOverlay,
  previewContent: importPreviewContent,
  previewConfirm: importPreviewConfirm
});


// ======================================================================
// PREFERENCES MODAL SHELL & NAVIGATION
// ======================================================================

function openPreferences() {
  const overlay = preferencesOverlay;
  if (!overlay) return;

  // Make visible, but KEEP initial animation state
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  // Force browser to render initial state
  overlay.classList.add('pre-open');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // Remove blocker class -> triggers animation
      overlay.classList.remove('pre-open');
    });
  });

  pushModal(overlay, closePreferences);

  requestAnimationFrame(() => {
    focusFirstFocusableElement(overlay);
  });

  const resetSystemBtn = document.getElementById('reset-system-btn');

  if (resetSystemBtn && !resetSystemBtn._wired) {
    resetSystemBtn.addEventListener('click', () => {
      openConfirm({
        title: 'Reset system',
        message:
          'This will delete ALL dashboards and ALL preferences and restore WebDash to its original default state.\n\n' +
          'This includes layouts, buttons, categories, identities, themes, and settings.\n\n' +
          'This action cannot be undone.',
        confirmLabel: 'Reset system',
        onConfirm: async () => {
          await resetSystem();
          closePreferences();
        }
      });
    });

    resetSystemBtn._wired = true;
  }

  syncDefaultDashboardSelector();
  syncLayoutDashboardSelector();
  renderDashboardManagementPanel();
}

// ---------- Close modal ----------
function closePreferences() {
  const overlay = preferencesOverlay;
  if (!overlay) return;

  // Start closing animation
  overlay.classList.add('is-closing');
  overlay.setAttribute('aria-hidden', 'true');

  // Delay removal so animation can play
  setTimeout(() => {
    overlay.hidden = true;

    // cleanup
    overlay.classList.remove('is-closing');

    popModal(overlay);
  }, 160);
}

function isPreferencesOpen() {
  const overlay = document.getElementById('preferences-overlay');
  return overlay && !overlay.hidden;
}

// Open button
if (preferencesButton && !preferencesButton._wired) {
  preferencesButton._wired = true;
  preferencesButton.addEventListener('click', openPreferences);
}

// Close via X
if (closeButton && !closeButton._wired) {
  closeButton._wired = true;
  closeButton.addEventListener('click', closePreferences);
}

// ---------- Panel switching ----------
navItems?.forEach(button => {
  if (button._wired) return;
  button._wired = true;

  button.addEventListener('click', () => {
    const panelName = button.dataset.panel;

    navItems.forEach(b => b.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));

    const target = preferencesOverlay.querySelector(`#panel-${panelName}`);

    if (target) {
      button.classList.add('active');
      target.classList.add('active');
    } else {
      console.warn(`Panel panel-${panelName} not found`);
    }
  });
});

// ======================================================================
// BEHAVIOR PREFERENCES UI
// ======================================================================

if (autoCloseCheckbox && !autoCloseCheckbox._wired) {
  autoCloseCheckbox._wired = true;
  autoCloseCheckbox.addEventListener('change', () => {
    autoCloseDropdowns = autoCloseCheckbox.checked;
    userPreferences.behavior.autoCloseDropdowns = autoCloseDropdowns;
    PreferencesService.save(userPreferences);
  });
}

if (openLinksCheckbox && !openLinksCheckbox._wired) {
  openLinksCheckbox._wired = true;
  
  // Persist preference + re-render dashboard on change
  openLinksCheckbox.addEventListener('change', () => {
    userPreferences.behavior.openLinksInNewTab =
      openLinksCheckbox.checked;

    PreferencesService.save(userPreferences);

    // Re-render so link targets update immediately
    renderCategories(pageCategories);
  });
}

// ======================================================================
// IDENTITY UI
// ======================================================================

if (syncIdentityCheckbox) {
  syncIdentityCheckbox.addEventListener('change', async () => {
    const enabled = syncIdentityCheckbox.checked;

    userPreferences.appearance.identity.syncWithDashboard = enabled;
    await PreferencesService.save(userPreferences);

    // Apply sync immediately when enabling
    if (enabled && dashboardState && dashboardState.identity) {
      dashboardState.identity.name = dashboardState.name;
      await DashboardService.save(dashboardState);
    }

    applyIdentityToUI();
  });
}

// Enter rename mode on focus
if (identityNameInput && !identityNameInput._wiredFocus) {
  identityNameInput._wiredFocus = true;

  identityNameInput.addEventListener('focus', () => {
    if (userPreferences.appearance.identity.syncWithDashboard) return;
    if (isRenamingIdentity) return;

    isRenamingIdentity = true;
    pendingIdentityName = dashboardState?.identity?.name ?? '';

    renderIdentityRenameControls();
    identityNameInput.select();
  })
};

// Keyboard shortcuts
if (identityNameInput && !identityNameInput._wiredKeydown) {
  identityNameInput._wiredKeydown = true;

  identityNameInput.addEventListener('keydown', (e) => {
    if (!isRenamingIdentity) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      confirmIdentityRename();
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelIdentityRename();
    }
  });
}


// Cancel rename when clicking outside (blur)
if (identityNameInput && !identityNameInput._wiredBlur) {
  identityNameInput._wiredBlur = true;

  identityNameInput.addEventListener('blur', () => {
    if (!isRenamingIdentity) return;
    cancelIdentityRename();
  });
}

if (identityIconWrapper && identityIconInput) {
  identityIconWrapper.addEventListener('click', () => {
    identityIconInput.click();
  });

  identityIconInput.addEventListener('change', async () => {
    const file = identityIconInput.files[0];
    if (!file) return;

    const MAX_UPLOAD_SIZE = 1 * 1024 * 1024; // 1 MB

    if (file.size > MAX_UPLOAD_SIZE) {
      showToast({
        title: 'File too large',
        lines: [
          'Please select an image smaller than 1 MB.'
        ],
        type: 'error',
        duration: 5000,
      });

      identityIconInput.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      showToast({
        title: 'Invalid file',
        lines: [
          'Please select a valid image file (PNG, JPG, etc.).'
        ],
        type: 'error',
        duration: 5000,
      });

      identityIconInput.value = '';
      return;
    }

    try {
      const compressed = await compressImage(file, 256, 0.8);

      if (dashboardState && dashboardState.identity) {
        dashboardState.identity.icon = compressed;
        await DashboardService.save(dashboardState);
      }
      applyIdentityToUI();
      
      showToast({
        title: 'Icon updated',
        lines: [
          'Your identity icon has been updated successfully.'
        ],
        type: 'success',
        duration: 5000,
      });
    } catch (err) {
      console.error('[WebDash] Image compression failed:', err);

      showToast({
        title: 'Image processing failed',
        lines: [
          'Could not process the selected image. Please try another file.'
        ],
        type: 'error',
        duration: 5000,
      });
    }

    identityIconInput.value = '';
  });
}

if (identityResetBtn) {
  identityResetBtn.addEventListener('click', () => {
    openConfirm({
      title: 'Reset identity',
      message:
        'Reset your name and icon to their default values?\n\n' +
        'This cannot be undone.',
      onConfirm: async () => {
        await resetIdentity();
      }
    });
  });
}

function renderIdentityRenameControls() {
  const wrapper = identityNameInput.parentElement;

  if (wrapper.querySelector('.identity-rename-actions')) return;

  const actions = document.createElement('div');
  actions.className = 'identity-rename-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'icon-button confirm';
  confirmBtn.title = 'Save';
  confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i>';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'icon-button cancel';
  cancelBtn.title = 'Cancel';
  cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';

  confirmBtn.addEventListener('click', confirmIdentityRename);
  cancelBtn.addEventListener('click', cancelIdentityRename);

  actions.append(confirmBtn, cancelBtn);

  // Prevent blur firing before button clicks
  actions.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });

  wrapper.appendChild(actions);
}

async function confirmIdentityRename() {
  if (!dashboardState || !dashboardState.identity) return;

  const trimmed = identityNameInput.value.trim();
  dashboardState.identity.name =
    trimmed.length > 0 ? trimmed : dashboardState.name;

  await DashboardService.save(dashboardState);

  cleanupIdentityRename();
  applyIdentityToUI();
}

function cancelIdentityRename() {
  identityNameInput.value = pendingIdentityName;
  cleanupIdentityRename();
  applyIdentityToUI();
}

function cleanupIdentityRename() {
  isRenamingIdentity = false;
  pendingIdentityName = '';

  const actions =
    identityNameInput.parentElement.querySelector('.identity-rename-actions');

  if (actions) actions.remove();
  identityNameInput.blur();
}

// Image compression helper (identity icon)
function compressImage(file, maxSize = 256, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target.result;
    };

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);

      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };

    reader.readAsDataURL(file);
  });
}

// ======================================================================
// APPEARANCE UI
// ======================================================================

backgroundCards.forEach(card => {
  if (card._wired) return;
  card._wired = true;

  card.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    changeBackground(card.dataset.bg);
  });
});

themeRadios.forEach(radio => {
  if (radio._wired) return;
  radio._wired = true;

  radio.addEventListener('change', () => {
    setActiveTheme(radio.value); // uses existing logic
    syncThemeRadios();
  });
});

themeCards.forEach(card => {
  if (card._wired) return;
  card._wired = true;

  card.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    changeTheme(card.dataset.theme);
  });
});

// ======================================================================
// IMPORT / PREVIEW UI WIRING
// ======================================================================

const safeExportSystem = guardAsync(exportSystem);

if (exportDashboardBtn) {
  exportDashboardBtn.addEventListener('click', safeExportSystem);
}


if (importDashboardBtn && importDashboardFile) {
  importDashboardBtn.addEventListener('click', () => {
    importDashboardFile.value = '';
    importDashboardFile.click();
  });

  importDashboardFile.addEventListener('change', async () => {
    const file = importDashboardFile.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      validateSystemImportPayload(payload);
      openImportSystemModal(payload);
    } catch (err) {
      console.error('[WebDash] Import failed:', err);

      showToast({
        title: 'Import failed',
        lines: [
          err?.message || 'Invalid or unsupported import file.'
        ],
        type: 'error',
        duration: 7000
      });
    }
  });
}

const safeResetDashboard = guardAsync(async () => {
  await resetDashboard();
  closePreferences();
});

if (resetDashboardBtn) {
  resetDashboardBtn.addEventListener('click', () => {
    openConfirm({
      title: 'Reset dashboard',
      message:
        `This will reset the dashboard "${dashboardState?.name ?? 'Dashboard'}" back to the default dashboard layout.\n\nAll categories, buttons, and the dashboard identity will be restored to their original defaults.\n\nThis action cannot be undone.`,
      confirmLabel: 'Reset',
      onConfirm: safeResetDashboard
    });
  });
}

if (importSystemOverlay && !importSystemOverlay._wired) {
  importSystemOverlay._wired = true;
  importSystemOverlay.addEventListener('mousedown', (e) => {
    if (e.target !== importSystemOverlay) return;

    // Prevent click from bubbling to Preferences overlay
    e.preventDefault();
    e.stopPropagation();
    closeImportSystem();
  });
};

if (importSystemClose && !importSystemClose._wired) {
  importSystemClose._wired = true;
  importSystemClose.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeImportSystem();
  });
};

if (importSystemCancel && !importSystemCancel._wired) {
  importSystemCancel._wired = true;
  importSystemCancel.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeImportSystem();
  });
};

if (importPreviewClose && !importPreviewClose._wired) {
  importPreviewClose._wired = true;
  importPreviewClose.addEventListener('click', closeImportPreview);
}

if (importPreviewCancel && !importPreviewCancel._wired) {
  importPreviewCancel._wired = true;
  importPreviewCancel.addEventListener('click', closeImportPreview);
}

// ======================================================================
// MISC UI HELPERS
// ======================================================================

document.documentElement.classList.add('bg-visible');

['button-label-input', 'button-url-input'].forEach(id => {
  const input = document.getElementById(id);

  if (!input || input._wired) return;
  input._wired = true;

  input.addEventListener('input', () => {
    const nameErrorEl = document.getElementById('button-name-error');
    const urlErrorEl = document.getElementById('button-editor-error');

    if (nameErrorEl) nameErrorEl.classList.remove('is-visible');
    if (urlErrorEl) urlErrorEl.classList.remove('is-visible');
  });
});

const settingsBtn = document.getElementById('settings-button');

if (settingsBtn && !settingsBtn._wiredExtra) {
  settingsBtn._wiredExtra = true;

  settingsBtn.addEventListener('click', () => {
    syncThemeRadios();
    syncThemeCards();
    syncBackgroundCards();
  });
}