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

const themeRadios = document.querySelectorAll('input[name="pref-theme"]');

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

// DOM references for behavior preference toggles and other toggles
const syncAppearanceCheckbox = document.getElementById('pref-sync-dashboard-appearance');
const syncIdentityCheckbox = document.getElementById('pref-sync-dashboard-identity');
const openLinksCheckbox = document.getElementById('pref-open-links-new-tab');
const confirmDeleteButtonsCheckbox = document.getElementById('pref-confirm-delete-buttons');
const recentsLimitInput = document.getElementById('pref-recents-limit');
const trackRecentCheckbox = document.getElementById('pref-track-recent');
const autoCloseCheckbox = document.getElementById('pref-dropdown-autoclose');
const enableAnimationsCheckbox = document.getElementById('pref-enable-animations');
const storeRecentsCheckbox = document.getElementById('pref-store-recents');
const debugModeCheckbox = document.getElementById('pref-debug-mode');

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

async function openPreferences(panelNameOrEvent = null) {
  
  // Normalize input (supports both button click and CP usage)
  let panelName = null;

  if (typeof panelNameOrEvent === 'string') {
    panelName = panelNameOrEvent;
  }
  
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
  await rebuildGlobalItemIndex();
  renderQuickAccessFavorites();
  renderFavoritesManager();

  // Switch to specific panel if requested
  if (panelName) {
    setTimeout(() => {
      const targetButton = preferencesOverlay.querySelector(
        `[data-panel="${panelName}"]`
      );

      if (targetButton) {
        targetButton.click();
      } else {
        console.warn(`Panel "${panelName}" not found`);
      }
    }, 0);
  }

  // Ensure all settings reflect current preferences
  renderBehaviorToggles();
  wireSyncAppearanceBehavior();
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

      if (panelName === 'quick-access') {
        (async () => {
          await rebuildGlobalItemIndex();
          renderQuickAccessFavorites();
          renderFavoritesManager();
        })();
      }
    } else {
      console.warn(`Panel panel-${panelName} not found`);
    }
  });
});

// ======================================================================
// BEHAVIOR PREFERENCES UI
// ======================================================================

function renderBehaviorToggles() {
  const container = document.getElementById('behavior-container');
  if (!container) return;

  container.innerHTML = '';

  const groups = {};

  // Group toggles using new layout metadata
  (window.TOGGLE_DEFINITIONS || [])
    .filter(toggle => toggle.panel === 'behavior')
    .forEach(toggle => {
      const groupName = toggle.group || 'Other';

      if (!groups[groupName]) {
        groups[groupName] = [];
      }

      groups[groupName].push(toggle);
    });

  // Desired order (matches your original UI)
  const groupOrder = [
    'Appearance',
    'Buttons',
    'Dropdowns',
    'Accessibility'
  ];

  groupOrder.forEach(groupName => {
    const toggles = groups[groupName];
    if (!toggles) return;

    // Sort toggles within the group
    toggles.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const fieldset = document.createElement('fieldset');
    fieldset.className = 'setting-group';

    const legend = document.createElement('legend');
    legend.textContent = groupName + ':';
    fieldset.appendChild(legend);

    toggles.forEach(toggle => {
      const label = document.createElement('label');
      label.className = 'setting-row';

      const text = document.createElement('span');
      text.textContent = toggle.label;

      const toggleWrapper = document.createElement('span');
      toggleWrapper.className = 'toggle';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = toggle.get();

      input.addEventListener('change', async () => {
        await toggle.set(input.checked);
      });

      const track = document.createElement('span');
      track.className = 'toggle-track';

      toggleWrapper.appendChild(input);
      toggleWrapper.appendChild(track);

      label.appendChild(text);
      label.appendChild(toggleWrapper);

      fieldset.appendChild(label);
    });

    container.appendChild(fieldset);
  });
}

if (recentsLimitInput && !recentsLimitInput._wired) {
  recentsLimitInput._wired = true;

  recentsLimitInput.addEventListener('change', async () => {
    userPreferences.behavior.recentsLimit =
      Number(recentsLimitInput.value);

    await PreferencesService.save(userPreferences);
  });
}

if (autoCloseCheckbox && !autoCloseCheckbox._wired) {
  autoCloseCheckbox._wired = true;

  autoCloseCheckbox.addEventListener('change', async () => {
    const toggle = getToggleByKey('autoCloseDropdowns');
    await toggle?.set(autoCloseCheckbox.checked);
  });
}

if (openLinksCheckbox && !openLinksCheckbox._wired) {
  openLinksCheckbox._wired = true;

  openLinksCheckbox.addEventListener('change', async () => {
    const toggle = getToggleByKey('openLinksInNewTab');
    await toggle?.set(openLinksCheckbox.checked);
  });
}

if (confirmDeleteButtonsCheckbox && !confirmDeleteButtonsCheckbox._wired) {
  confirmDeleteButtonsCheckbox._wired = true;

  confirmDeleteButtonsCheckbox.addEventListener('change', async () => {
    const toggle = getToggleByKey('confirmDeleteButtons');
    await toggle?.set(confirmDeleteButtonsCheckbox.checked);
  });
}

if (trackRecentCheckbox && !trackRecentCheckbox._wired) {
  trackRecentCheckbox._wired = true;

  trackRecentCheckbox.addEventListener('change', async () => {
    const toggle = getToggleByKey('trackRecents');
    await toggle?.set(trackRecentCheckbox.checked);
  });
}

function wireSyncAppearanceBehavior() {
  if (!syncAppearanceCheckbox || syncAppearanceCheckbox._wired) return;

  syncAppearanceCheckbox._wired = true;

  syncAppearanceCheckbox.addEventListener('change', async () => {
    const toggle = getToggleByKey('syncDashboardAppearance');
    await toggle?.set(syncAppearanceCheckbox.checked);
  });
}

if (enableAnimationsCheckbox && !enableAnimationsCheckbox._wired) {
  enableAnimationsCheckbox._wired = true;

  enableAnimationsCheckbox.addEventListener('change', async () => {
    const toggle = getToggleByKey('enableAnimations');
    await toggle?.set(enableAnimationsCheckbox.checked);
  });
}

function applyAnimationPreference() {
  const enabled =
    userPreferences?.behavior?.enableAnimations !== false;

  document.documentElement.classList.toggle(
    'no-animations',
    !enabled
  );
}

if (storeRecentsCheckbox && !storeRecentsCheckbox._wired) {
  storeRecentsCheckbox._wired = true;

  storeRecentsCheckbox.addEventListener('change', async () => {
    const toggle = getToggleByKey('storeRecentsAcrossReloads');
    await toggle?.set(storeRecentsCheckbox.checked);
  });
}

if (debugModeCheckbox && !debugModeCheckbox._wired) {
  debugModeCheckbox._wired = true;

  debugModeCheckbox.addEventListener('change', async () => {
    const toggle = getToggleByKey('debugMode');
    await toggle?.set(debugModeCheckbox.checked);
  });
}

function applyDebugMode() {
  const enabled =
    userPreferences?.behavior?.debugMode === true;

  document.documentElement.classList.toggle(
    'debug-mode',
    enabled
  );
}

// ======================================================================
// IDENTITY UI
// ======================================================================

function wireSyncIdentityBehavior() {
  if (!syncIdentityCheckbox || syncIdentityCheckbox._wired) return;

  syncIdentityCheckbox._wired = true;

  syncIdentityCheckbox.addEventListener('change', async () => {
    const enabled = syncIdentityCheckbox.checked;

    if (!userPreferences.appearance) {
      userPreferences.appearance = {};
    }

    if (!userPreferences.appearance.identity) {
      userPreferences.appearance.identity = {};
    }

    userPreferences.appearance.identity.syncWithDashboard = enabled;

    if (enabled && dashboardState && dashboardState.identity) {
      const syncedName = dashboardState.name ?? 'Dashboard';

      userPreferences.appearance.identity.name = syncedName;

      dashboardState.identity.name = syncedName;

      await DashboardService.save(dashboardState);
    }

    await PreferencesService.save(userPreferences);
    applyIdentityToUI();
    syncIdentityInputState();
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

async function handleAppearanceChange({ theme, background }) {
  const isSyncOn =
    userPreferences?.behavior?.syncDashboardAppearance !== false;

  if (isSyncOn) {
    if (theme !== undefined) {
      userPreferences.appearance.theme = theme;
    }

    if (background !== undefined) {
      userPreferences.appearance.background = background;
    }

    await PreferencesService.save(userPreferences);
    await syncAppearanceToAllDashboards();
  } else {
    if (!dashboardState.appearance) {
      dashboardState.appearance = {};
    }

    if (theme !== undefined) {
      dashboardState.appearance.theme = theme;
    }

    if (background !== undefined) {
      dashboardState.appearance.background = background;
    }

    await DashboardService.save(dashboardState);
  }

  applyDashboardAppearance();

  if (theme !== undefined) {
    updateThemeSelectionUI(theme);
  }

  if (background !== undefined) {
    updateBackgroundSelectionUI(background);
  }

  syncThemeRadios?.();
}

function renderThemeGrid() {
  const grid = document.querySelector('.theme-grid:not(.background-grid)');
  if (!grid) return;

  grid.innerHTML = '';

  THEMES.forEach(theme => {
    const btn = document.createElement('button');
    btn.className = 'theme-card';
    btn.type = 'button';
    btn.dataset.theme = theme.id;

    const preview = document.createElement('span');
    preview.className =
      theme.id === 'system'
        ? 'theme-preview theme-system'
        : `theme-preview ${theme.id}`;

    const label = document.createElement('span');
    label.className = 'theme-name';
    label.textContent = theme.label;

    btn.appendChild(preview);
    btn.appendChild(label);

    const currentTheme =
      userPreferences?.appearance?.theme ??
      dashboardState?.appearance?.theme;

    if (theme.id === currentTheme) {
      btn.classList.add('active');
    }

    // Debug mode
    if (userPreferences?.behavior?.debugMode) {
      const debug = document.createElement('span');
      debug.className = 'debug-id';
      debug.textContent = ` [${theme.id}]`;
      btn.appendChild(debug);
    }

    btn.addEventListener('click', () => {
      handleAppearanceChange({ theme: theme.id });
    });

    grid.appendChild(btn);
  });
}

function renderBackgroundGrid() {
  const grid = document.querySelector('.background-grid');
  if (!grid) return;

  grid.innerHTML = '';

  BACKGROUNDS.forEach(bg => {
    const btn = document.createElement('button');
    btn.className = 'theme-card bg-card';
    btn.type = 'button';
    btn.dataset.bg = bg.id;

    const preview = document.createElement('span');
    preview.className = `theme-preview ${bg.previewClass}`;

    const label = document.createElement('span');
    label.className = 'theme-name';
    label.textContent = bg.label;

    btn.appendChild(preview);
    btn.appendChild(label);

    const currentBackground =
      userPreferences?.appearance?.background ??
      dashboardState?.appearance?.background;

    if (bg.id === currentBackground) {
      btn.classList.add('active');
    }

    // Debug mode
    if (userPreferences?.behavior?.debugMode) {
      const debug = document.createElement('span');
      debug.className = 'debug-id';
      debug.textContent = ` [${bg.id}]`;
      btn.appendChild(debug);
    }

    // Click behavior
    btn.addEventListener('click', () => {
      handleAppearanceChange({ background: bg.id });
    });

    grid.appendChild(btn);
  });
}

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
    syncThemeRadios?.();

    renderThemeGrid();
    renderBackgroundGrid();
  });
}

function renderQuickAccessFavorites() {
  ensureBehaviorDefaults();

  if (userPreferences?.behavior?.trackRecents === undefined) {
    userPreferences.behavior.trackRecents = true;
  }

  const container =
    document.getElementById('quick-access-favorites-list');

  if (!container) return;

  container.innerHTML = '';

  const favorites = userPreferences?.behavior?.favorites ?? [];

  if (!favorites.length) {
    container.innerHTML = '<div class="empty-state">No favorites yet</div>';
    return;
  }

  favorites.forEach(id => {
    let item = globalItemIndex.get(id);

    // Fallback to current dashboard
    if (!item) {
      item = pageCategories
        .flatMap(cat => cat.items)
        .find(i => i.id === id);
    }

    if (!item) {
      const row = document.createElement('div');
      row.className = 'layout-item missing';
      row.textContent = '[Missing item]';
      container.appendChild(row);
      return;
    }

    const row = document.createElement('div');
    row.className = 'layout-item';
    row.dataset.itemId = id;

    const drag = document.createElement('span');
    drag.className = 'drag-handle';
    drag.textContent = '☰';

    const label = document.createElement('span');
    label.className = 'item-label';
    label.textContent = item.label;

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const star = document.createElement('button');
    star.className = 'icon-button';
    star.innerHTML = '<i class="fa-solid fa-star"></i>';
    star.title = 'Remove from favorites';

    star.onclick = async () => {
      await toggleFavorite(id);
      renderQuickAccessFavorites();
      renderCategories(pageCategories);
    };

    actions.appendChild(star);

    row.appendChild(drag);
    row.appendChild(label);
    row.appendChild(actions);

    container.appendChild(row);
  });

  setupFavoritesDragAndDrop(container);
}

function renderFavoritesManager() {
  let showAll = false;
  const DEFAULT_VISIBLE = 5;

  const container = document.getElementById('quick-access-manager');
  if (!container) return;

  container.innerHTML = '';

  const input = document.createElement('input');
  input.className = 'quick-access-search';
  input.id = 'quick-access-search';
  input.placeholder = 'Search items...';

  // Input row (unchanged)
  const row = document.createElement('div');
  row.className = 'setting-row';
  row.appendChild(input);

  // Create a category container (THIS is what you're missing)
  const category = document.createElement('div');
  category.className = 'layout-category';

  // Optional: header label to mirror layout editor
  const header = document.createElement('div');
  header.className = 'layout-category-header';
  const allItemsCount = getAllItemsSafe().length;
  header.textContent = `All items (${allItemsCount})`;

  // Item container (same as layout editor)
  const list = document.createElement('div');
  list.className = 'layout-category-items';

  // Build structure
  category.appendChild(header);
  category.appendChild(list);

  container.appendChild(row);
  container.appendChild(category);

  function getAllItemsSafe() {
    // Use global index if available
    if (globalItemIndex && globalItemIndex.size > 0) {
      return [...globalItemIndex.values()];
    }

    // Fallback to current dashboard
    return pageCategories.flatMap(cat => cat.items);
  }

  function renderList(query = '') {
    list.innerHTML = '';

    const favorites = userPreferences?.behavior?.favorites ?? [];

    const allItems = getAllItemsSafe()
      .filter(item => item.label.toLowerCase().includes(query))
      .sort((a, b) => a.label.localeCompare(b.label));

    const items = showAll
      ? allItems
      : allItems.slice(0, DEFAULT_VISIBLE);


    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No matching items';
      list.appendChild(empty);
      return;
    }

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'layout-item';

      const label = document.createElement('span');
      label.className = 'item-label';
      label.textContent = item.label;

      const btn = document.createElement('button');
      btn.className = 'icon-button';

      const isFav = favorites.includes(item.id);

      btn.innerHTML = isFav
        ? '<i class="fa-solid fa-star"></i>'
        : '<i class="fa-regular fa-star"></i>';

      btn.title = isFav ? 'Remove from favorites' : 'Add to favorites';

      btn.onclick = async () => {
        await toggleFavorite(item.id);

        renderList(query);
        renderQuickAccessFavorites();
        renderCategories(pageCategories);
      };

      const actions = document.createElement('div');
      actions.className = 'item-actions';

      actions.appendChild(btn);

      row.appendChild(label);
      row.appendChild(actions);
      list.appendChild(row);
    });
    // Expand / Collapse toggle
    if (allItems.length > DEFAULT_VISIBLE) {
      const toggleRow = document.createElement('div');
      toggleRow.className = 'layout-item';

      const label = document.createElement('span');
      label.className = 'item-label';
      label.textContent = showAll ? 'Show less' : 'Show more';

      const actions = document.createElement('div');
      actions.className = 'item-actions';

      const btn = document.createElement('button');
      btn.className = 'icon-button';
      btn.innerHTML = showAll
        ? '<i class="fa-solid fa-chevron-up"></i>'
        : '<i class="fa-solid fa-chevron-down"></i>';

      btn.onclick = () => {
        showAll = !showAll;
        renderList(query);
      };

      actions.appendChild(btn);

      toggleRow.appendChild(label);
      toggleRow.appendChild(actions);
      list.appendChild(toggleRow);
    }
  }

  input.addEventListener('input', () => {
    renderList(input.value.toLowerCase());
  });

  renderList();
}

function setupFavoritesDragAndDrop(container) {
  let draggedId = null;

  function clearDragIndicators() {
    container.querySelectorAll('.layout-item').forEach(el => {
      el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
    });
  }

  container.querySelectorAll('.layout-item').forEach(el => {
    const id = el.dataset.itemId;

    el.draggable = true;

    el.addEventListener('dragstart', () => {
      draggedId = id;
      el.classList.add('is-dragging');
    });

    el.addEventListener('dragend', () => {
      draggedId = null;
      el.classList.remove('is-dragging');
      clearDragIndicators();
    });
  });

  container.addEventListener('dragover', (e) => {
    if (!draggedId) return;

    e.preventDefault();

    const target = e.target.closest('.layout-item');

    container.querySelectorAll(
      '.layout-item.drag-over, .layout-item.drag-over-top, .layout-item.drag-over-bottom'
    ).forEach(el => {
      el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
    });

    if (target && target.dataset.itemId !== draggedId) {
      const rect = target.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;

      if (e.clientY < midpoint) {
        target.classList.add('drag-over-top');
      } else {
        target.classList.add('drag-over-bottom');
      }

      target.classList.add('drag-over');
    }
  });

  container.addEventListener('drop', async (e) => {
  e.preventDefault();

  if (!draggedId) return;

  const target = e.target.closest('.layout-item');
  if (!target) return;

  const targetId = target.dataset.itemId;
  if (!targetId || targetId === draggedId) return;

  const insertBefore = target.classList.contains('drag-over-top');

  const favs = [...(userPreferences?.behavior?.favorites ?? [])];

  const from = favs.indexOf(draggedId);
  const to = favs.indexOf(targetId);

  if (from === -1 || to === -1) return;

  const [moved] = favs.splice(from, 1);

  let newIndex = insertBefore ? to : to + 1;

  if (from < newIndex) newIndex--;

  favs.splice(newIndex, 0, moved);

  userPreferences.behavior.favorites = favs;

  await PreferencesService.save(userPreferences);

  // Cleanup visuals
  container.querySelectorAll(
    '.layout-item.drag-over, .layout-item.drag-over-top, .layout-item.drag-over-bottom'
  ).forEach(el => {
      el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
    });

    renderQuickAccessFavorites();
  });
}