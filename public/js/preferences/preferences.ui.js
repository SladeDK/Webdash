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
  preferencesOverlay.hidden = false;
  preferencesOverlay.setAttribute('aria-hidden', 'false');

  pushModal(preferencesOverlay, closePreferences);

  
  requestAnimationFrame(() => {
    focusFirstFocusableElement(preferencesOverlay);
  });

  // --------------------------------------------------
  // Wire "Reset system" button (Preferences lifecycle)
  // --------------------------------------------------
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

    // Prevent duplicate listeners if Preferences is opened again
    resetSystemBtn._wired = true;
  }

  syncDefaultDashboardSelector();
  syncLayoutDashboardSelector();
  renderDashboardManagementPanel();
}

// ---------- Close modal ----------
function closePreferences() {
  preferencesOverlay.hidden = true;
  preferencesOverlay.setAttribute('aria-hidden', 'true');
  popModal(preferencesOverlay);
}

function isPreferencesOpen() {
  const overlay = document.getElementById('preferences-overlay');
  return overlay && !overlay.hidden;
}

// Open button
preferencesButton?.addEventListener('click', openPreferences);

// Close via X
closeButton?.addEventListener('click', closePreferences);

// ---------- Panel switching ----------
navItems?.forEach(button => {
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

if (autoCloseCheckbox) {
  autoCloseCheckbox.addEventListener('change', () => {
    autoCloseDropdowns = autoCloseCheckbox.checked;
    userPreferences.behavior.autoCloseDropdowns = autoCloseDropdowns;
    PreferencesService.save(userPreferences);
  });
}

if (openLinksCheckbox) {
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
identityNameInput.addEventListener('focus', () => {
  if (userPreferences.appearance.identity.syncWithDashboard) return;
  if (isRenamingIdentity) return;

  isRenamingIdentity = true;
  pendingIdentityName = dashboardState?.identity?.name ?? '';

  renderIdentityRenameControls();
  identityNameInput.select();
});

// Keyboard shortcuts
identityNameInput.addEventListener('keydown', (e) => {
  if (!isRenamingIdentity) return;

  if (e.key === 'Enter') {
    e.preventDefault();
    confirmIdentityRename();
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    cancelIdentityRename();
  }
});

// Cancel rename when clicking outside (blur)
identityNameInput.addEventListener('blur', () => {
  if (!isRenamingIdentity) return;

  cancelIdentityRename();
});

if (identityIconWrapper && identityIconInput) {
  identityIconWrapper.addEventListener('click', () => {
    identityIconInput.click();
  });

  identityIconInput.addEventListener('change', () => {
    const file = identityIconInput.files[0];
    if (!file) return;

    // Basic validation (keep it simple for now)
    if (!file.type.startsWith('image/')) {
      showToast({
        title: 'Invalid file',
        lines: ['Please select a valid image file (PNG, JPG, etc.).'],
        type: 'error'
      });
      identityIconInput.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      userPreferences.appearance.identity.icon = reader.result;
      PreferencesService.save(userPreferences);
      applyIdentityToUI();
    };

    reader.readAsDataURL(file);
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

// ======================================================================
// APPEARANCE UI
// ======================================================================

backgroundCards.forEach(card => {
  card.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    changeBackground(card.dataset.bg);
  });
});

themeRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    setActiveTheme(radio.value); // uses existing logic
    syncThemeRadios();
  });
});

themeCards.forEach(card => {
  card.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    changeTheme(card.dataset.theme);
  });
});

// ======================================================================
// IMPORT / PREVIEW UI WIRING
// ======================================================================


if (exportDashboardBtn) {
  exportDashboardBtn.addEventListener('click', () => {
    exportSystem();
  });
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
      validateSystemImport(payload);
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

if (resetDashboardBtn) {
  resetDashboardBtn.addEventListener('click', () => {
    openConfirm({
      title: 'Reset dashboard',
      message:
        `This will reset the dashboard "${dashboardState?.name ?? 'Dashboard'}" back to the default dashboard layout.\n\nAll categories, buttons, and the dashboard identity will be restored to their original defaults.\n\nThis action cannot be undone.`,
      confirmLabel: 'Reset',
      onConfirm: () => {
        resetDashboard();
        closePreferences();
      }
    });
  });
}

importSystemOverlay?.addEventListener('mousedown', (e) => {
  if (e.target !== importSystemOverlay) return;

  // Prevent click from bubbling to Preferences overlay
  e.preventDefault();
  e.stopPropagation();

  closeImportSystem();
});

importSystemClose?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeImportSystem();
});

importSystemCancel?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeImportSystem();
});

importPreviewClose?.addEventListener('click', closeImportPreview);
importPreviewCancel?.addEventListener('click', closeImportPreview);

// ======================================================================
// MISC UI HELPERS
// ======================================================================

document.documentElement.classList.add('bg-visible');

['button-label-input', 'button-url-input'].forEach(id => {
  const input = document.getElementById(id);
  input?.addEventListener('input', () => {
    const nameErrorEl = document.getElementById('button-name-error');
    const urlErrorEl = document.getElementById('button-editor-error');

    if (nameErrorEl) nameErrorEl.classList.remove('is-visible');
    if (urlErrorEl) urlErrorEl.classList.remove('is-visible');
  });
});

document.getElementById('settings-button')?.addEventListener('click', syncThemeRadios);

document
  .getElementById('settings-button')
  ?.addEventListener('click', () => {
    syncThemeCards();
    syncBackgroundCards();
  }
);