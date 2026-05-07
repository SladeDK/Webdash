//  * ui/preferences.js
//  *
//  * Preferences UI:
//  * - Appearance
//  * - Identity
//  * - Import / export
//  * - Reset workflows

// =====================================================
// DOM references
// =====================================================

const syncAppearanceCheckbox = document.getElementById('pref-sync-dashboard-appearance');

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

// =====================================================
// Preferences modal shell & navigation
// =====================================================

// ---------- Open modal ----------
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

// =====================================================
// Behavior preferences (non-visual)
// =====================================================

if (autoCloseCheckbox) {
  autoCloseCheckbox.addEventListener('change', () => {
    autoCloseDropdowns = autoCloseCheckbox.checked;
    userPreferences.behavior.autoCloseDropdowns = autoCloseDropdowns;
    PreferencesService.save(userPreferences);
  });
}

function initSyncAppearanceBehavior() {
  const checkbox =
    document.getElementById('pref-sync-dashboard-appearance');

  if (!checkbox || !userPreferences) return;

  // Default ON unless explicitly disabled
  checkbox.checked =
    userPreferences.behavior.syncDashboardAppearance !== false;

  // Prevent duplicate listeners
  if (checkbox._wired) return;
  checkbox._wired = true;

  checkbox.addEventListener('change', async () => {
    const enabled = checkbox.checked;

    userPreferences.behavior.syncDashboardAppearance = enabled;
    await PreferencesService.save(userPreferences);

    // Only propagate when turning ON
    if (enabled) {
      await syncAppearanceToAllDashboards();
    }
  });
}

function initSyncDashboardIdentityBehavior() {
  const checkbox = document.getElementById('pref-sync-dashboard-identity');
  if (!checkbox || !userPreferences) return;

  checkbox.checked =
    userPreferences.appearance.identity.syncWithDashboard !== false;

  if (checkbox._wired) return;
  checkbox._wired = true;

  checkbox.addEventListener('change', async () => {
    const enabled = checkbox.checked;
    userPreferences.appearance.identity.syncWithDashboard = enabled;

    if (enabled) {
      // Force identity to match current dashboard
      userPreferences.appearance.identity.name =
        dashboardState?.name ?? 'Dashboard';
    }

    await PreferencesService.save(userPreferences);
    applyIdentityToUI();
    syncIdentityInputState();
  });
}

// =====================================================
// Identity preferences
// =====================================================

const INITIAL_IDENTITY = (() => {
  const name =
    document.querySelector('.header-center h1')?.textContent?.trim()
    || 'Dashboard';

  const icon =
    document.querySelector('.header-center img')?.getAttribute('src')
    || null;

  return { name, icon };
})();

/* While typing: allow empty, do NOT auto-fill */
identityNameInput.addEventListener('input', () => {
  if (userPreferences.appearance.identity.syncWithDashboard) {
    return;
  }

  const trimmed = identityNameInput.value.trim();
  if (trimmed) {
    userPreferences.appearance.identity.name = trimmed;
    PreferencesService.save(userPreferences);
    applyIdentityToUI();
  }
});

/* When user leaves the field: enforce default if empty */
identityNameInput.addEventListener('blur', () => {
  const trimmed = identityNameInput.value.trim();

  if (!trimmed) {
    userPreferences.appearance.identity.name = 'Dashboard';
    PreferencesService.save(userPreferences);
    applyIdentityToUI();
  }
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

function resetIdentity() {
  const defaults = getDefaultIdentity();

  userPreferences.appearance.identity = {
    name: defaults.name,
    icon: defaults.icon
  };

  PreferencesService.save(userPreferences);
  applyIdentityToUI();
}

function applyIdentityToUI() {
  const { name, icon } = userPreferences.appearance.identity;

  // Header title
  const headerTitle = document.querySelector('.header-center h1');
  if (headerTitle) headerTitle.textContent = name;

  // Header icon
  const headerIcon = document.querySelector('.header-center img');
  if (headerIcon && icon) {
    headerIcon.src = icon;
  }

  // Identity preview name
  const previewName = document.querySelector('.identity-name-preview');
  if (previewName) previewName.textContent = name;

  // Identity preview icon
  const previewIcon = document.querySelector('.identity-icon-preview');
  if (previewIcon && icon) {
    previewIcon.src = icon;
  }

  // Input value
  const input = document.querySelector('.identity-name-input');
  if (input && input.value !== name) {
    input.value = name;
  }
  applyDocumentTitle()
}

function syncIdentityInputState() {
  const input = document.querySelector('.identity-name-input');
  if (!input) return;

  const synced =
    userPreferences.appearance.identity.syncWithDashboard !== false;

  if (synced) {
    input.readOnly = true;
    input.tabIndex = -1;   // cannot be focused
    input.blur();          // drop focus immediately
    input.classList.add('is-synced');
    input.setAttribute('aria-readonly', 'true');
    input.setAttribute(
      'title',
      'Identity name is synchronized with the active dashboard'
    );
  } else {
    input.readOnly = false;
    input.tabIndex = 0;
    input.classList.remove('is-synced');
    input.removeAttribute('aria-readonly');
    input.removeAttribute('title');
  }
}

// =====================================================
// Appearance preferences
// =====================================================

function getCurrentTheme() {
  const themes = [
    'theme-dark',
    'theme-light',
    'theme-midnight',
    'theme-slate',
    'theme-nord',
    'theme-carbon',
    'theme-glass'
  ];

  return themes.find(t =>
    document.documentElement.classList.contains(t)
  );
}

function syncThemeRadios() {
  const activeTheme = getCurrentTheme();
  themeRadios.forEach(radio => {
    radio.checked = radio.value === activeTheme;
  });
}

backgroundCards.forEach(card => {
  card.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    changeBackground(card.dataset.bg);
  });
});

function syncThemeCards() {
  const activeTheme = getCurrentTheme();

  themeCards.forEach(card => {
    card.classList.toggle(
      'active',
      card.dataset.theme === activeTheme
    );
  });
}

function syncBackgroundCards() {
  const activeBg = BACKGROUNDS.find(bg =>
    document.documentElement.classList.contains(bg)
  );

  backgroundCards.forEach(card => {
    card.classList.toggle(
      'active',
      card.dataset.bg === activeBg
    );
  });
}

function resolveSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'theme-dark'
    : 'theme-light';
}

function setActiveTheme(theme) {
  document.documentElement.classList.add('theme-switching');

  const resolvedTheme = theme === 'system'
    ? resolveSystemTheme()
    : theme;

  document.documentElement.classList.remove(
    'theme-dark',
    'theme-light',
    'theme-midnight',
    'theme-slate',
    'theme-nord',
    'theme-carbon',
    'theme-glass'
  );

  document.documentElement.classList.add(resolvedTheme);

  requestAnimationFrame(() => {
    document.documentElement.classList.remove('theme-switching');
  });
}

function changeTheme(theme) {
  setActiveTheme(theme);
  userPreferences.appearance.theme = theme;

  const syncOn =
    userPreferences.behavior.syncDashboardAppearance !== false;

  PreferencesService.save(userPreferences);

  if (syncOn) {
    // Propagate change globally
    syncAppearanceToAllDashboards();
  } else if (dashboardState) {
    // Store locally (future‑safe)
    dashboardState.appearance = {
      ...dashboardState.appearance,
      theme
    };
    DashboardService.save(dashboardState);
  }

  syncThemeCards();
  syncBackgroundCards();
  syncThemeRadios();
}

function setActiveBackground(bg) {
  const root = document.documentElement;

  const currentBg = BACKGROUNDS.find(b =>
    root.classList.contains(b)
  );

  if (currentBg === bg) return;

  if (currentBg) {
    root.classList.replace(currentBg, bg);
  } else {
    root.classList.add(bg);
  }
}

function changeBackground(bg) {
  setActiveBackground(bg);
  userPreferences.appearance.background = bg;

  const syncOn =
    userPreferences.behavior.syncDashboardAppearance !== false;

  PreferencesService.save(userPreferences);

  if (syncOn) {
    // Propagate change globally
    syncAppearanceToAllDashboards();
  } else if (dashboardState) {
    // Store locally (future‑safe)
    dashboardState.appearance = {
      ...dashboardState.appearance,
      background: bg
    };
    DashboardService.save(dashboardState);
  }

  syncBackgroundCards();
  syncThemeCards();
}

window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    const savedTheme = localStorage.getItem(THEME_KEY);

    if (savedTheme === 'system') {
      setActiveTheme('system');
    }
});

// Apply theme when user selects a radio
themeRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    setActiveTheme(radio.value); // uses existing logic
    syncThemeRadios();
  });
});

// =====================================================
// Import / export UI
// =====================================================

function buildExportFilename() {
  const rawName = userPreferences.appearance.identity.name || 'Dashboard';

  // Normalize for filesystem safety
  const dashboardName = rawName
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '');

  // YYYY-MM-DD
  const date = new Date().toISOString().split('T')[0];

  return `WebDash-${dashboardName}-${date}.json`;
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

function openImportSystemModal(payload) {
  const overlay = document.getElementById('import-system-overlay');
  if (!overlay) {
    console.error('[WebDash] Import system overlay not found');
    return;
  }

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  
  // Sync preference checkbox with current mode
  syncImportPreferenceState(overlay);

  overlay
  .querySelectorAll('input[name="import-mode"]')
  .forEach(radio => {
    radio.addEventListener('change', () =>
      syncImportPreferenceState(overlay)
    );
  });

  pushModal(importSystemOverlay, closeImportSystemModal);

  requestAnimationFrame(() => {
    focusFirstFocusableElement(overlay);
  });

  const confirmBtn = overlay.querySelector('#import-system-confirm');
  if (!confirmBtn) {
    console.error('[WebDash] Import confirm button not found');
    return;
  }

  confirmBtn.onclick = async () => {
    const mode =
      overlay.querySelector('input[name="import-mode"]:checked')?.value ??
      IMPORT_MODE.MERGE;

    const replacePreferences =
      overlay.querySelector('#import-replace-preferences')?.checked ?? true;

    // Build preview context FIRST
    const plan = await buildPreviewContext(payload, mode);

    openImportPreviewModal(plan, async () => {
      closeImportSystemModal();
      if (plan.type === SystemTransitionType.IMPORT_OVERWRITE) {
        await overwriteSystemImport(payload, replacePreferences);
      } else {
        await mergeSystemImport(payload, replacePreferences);
      }
    });
  };
}

function closeImportSystemModal() {
  if (!importSystemOverlay) return;

  importSystemOverlay.hidden = true;
  importSystemOverlay.setAttribute('aria-hidden', 'true');

  popModal(importSystemOverlay);
}

function renderImportPreview(plan) {
  if (!importPreviewContent) return;

  let html = '';
  const dashboards = plan.dashboards ?? { added: [], updated: [], removed: [] };

  // ==================================================
  // AFFECTED DASHBOARDS
  // ==================================================
  html += `
    <div class="preview-section">
      <h3>Affected Dashboards:</h3>

      <div class="dashboard-summary-header">
        <div class="dashboard-header-name">Dashboard</div>
        <div class="dashboard-header-changes">Changes</div>
      </div>

      <ul class="dashboard-summary">
  `;

  dashboards.removed.forEach(d => {
    html += `
      <li class="dashboard-item removed">
        <div class="dashboard-name">${d.name.before}</div>
        <div class="dashboard-state">Removed</div>
      </li>
    `;
  });

  dashboards.added.forEach(d => {
    html += `
      <li class="dashboard-item added">
        <div class="dashboard-name">${d.name.after}</div>
        <div class="dashboard-state">Added</div>
      </li>
    `;
  });

  dashboards.updated.forEach(d => {
    const renamed = d.name.before !== d.name.after;
    const hasInternalChanges =
      d.categories &&
      (
        d.categories.added.length ||
        d.categories.updated.length ||
        d.categories.removed.length ||
        d.categories.updated.some(c =>
          c.items &&
          (c.items.added.length || c.items.updated.length || c.items.removed.length)
        )
      );

    html += `
      <li class="dashboard-item">
        <div class="dashboard-name">
          ${renamed
            ? `${d.name.before} <span class="rename-arrow">→</span> ${d.name.after}`
            : d.name.after}
        </div>
        <div class="dashboard-changes">
          ${renamed ? `<div class="change-label renamed">Renamed</div>` : ``}
          ${hasInternalChanges ? `<div class="change-label internal">Modified Internally</div>` : ``}
        </div>
      </li>
    `;
  });

  html += `
      </ul>
    </div>
  `;

  // ==================================================
  // AFFECTED CATEGORIES
  // ==================================================
  html += `
    <div class="preview-section">
      <h3>Affected Categories:</h3>

      <div class="dashboard-summary-header">
        <div class="dashboard-header-name">Category Path</div>
        <div class="dashboard-header-changes">Changes</div>
      </div>

      <ul class="dashboard-summary">
  `;

  dashboards.updated.forEach(d => {
    if (!d.categories) return;

    d.categories.updated.forEach(cat => {
      const renamed = cat.name.before !== cat.name.after;

      html += `
        <li class="dashboard-item">
          <div class="dashboard-name">
            <div class="preview-muted">
              Dashboard · ${d.name.after}
            </div>
            <div class="item-entity">
              ${renamed ? `${cat.name.before} → ${cat.name.after}` : cat.name.after}
            </div>
          </div>
          <div class="dashboard-changes">
            ${renamed ? `<div class="change-label updated">Renamed</div>` : ``}
            <div class="change-label internal">Modified Internally</div>
          </div>
        </li>
      `;
    });

    d.categories.added.forEach(cat => {
      html += `
        <li class="dashboard-item">
          <div class="dashboard-name">
            <div class="preview-muted">
              Dashboard · ${d.name.after}
            </div>
            <div class="item-entity">
              ${cat.name.after}
            </div>
          </div>
          <div class="dashboard-changes">
            <div class="change-label added">Added</div>
            <div class="change-label internal">Modified Internally</div>
          </div>
        </li>
      `;
    });

    d.categories.removed.forEach(cat => {
      html += `
        <li class="dashboard-item removed">
          <div class="dashboard-name">
            <div class="preview-muted">
              Dashboard · ${d.name.after}
            </div>
            <div class="item-entity">
              ${cat.name.before}
            </div>
          </div>
          <div class="dashboard-changes">
            <div class="change-label removed">Removed</div>
          </div>
        </li>
      `;
    });
  });

  html += `
      </ul>
    </div>
  `;

  // ==================================================
  // AFFECTED BUTTONS
  // ==================================================
  html += `
    <div class="preview-section">
      <h3>Affected Buttons:</h3>

      <div class="dashboard-summary-header">
        <div class="dashboard-header-name">Button Path</div>
        <div class="dashboard-header-changes">Changes</div>
      </div>

      <ul class="dashboard-summary">
  `;

  dashboards.updated.forEach(d => {
    if (!d.categories) return;

    d.categories.updated.forEach(cat => {
      if (!cat.items) return;

      cat.items.updated.forEach(item => {
        const renamed = item.name.before !== item.name.after;
        const urlChanged = item.url.before !== item.url.after;

        html += `
          <li class="dashboard-item">
            <div class="dashboard-name">
              <div class="preview-muted">
                Dashboard · ${d.name.after} → Category · ${cat.name.after}
              </div>

              <div class="item-entity">
                ${renamed ? `${item.name.before} → ${item.name.after}` : item.name.after}
              </div>

              <div class="preview-muted">
                ${urlChanged
                  ? `${item.url.before} → ${item.url.after}`
                  : item.url.after}
              </div>
            </div>
            <div class="dashboard-changes">
              ${renamed ? `<div class="change-label updated">Renamed</div>` : ``}
              ${urlChanged ? `<div class="change-label updated">Modified URL</div>` : ``}
            </div>
          </li>
        `;
      });

      cat.items.added.forEach(item => {
        html += `
          <li class="dashboard-item">
            <div class="dashboard-name">
              <div class="preview-muted">
                Dashboard · ${d.name.after} → Category · ${cat.name.after}
              </div>
              <div class="item-entity">
                ${item.name.after}
              </div>
              <div class="preview-muted">${item.url.after}</div>
            </div>
            <div class="dashboard-changes">
              <div class="change-label added">Added</div>
            </div>
          </li>
        `;
      });

      cat.items.removed.forEach(item => {
        html += `
          <li class="dashboard-item removed">
            <div class="dashboard-name">
              <div class="preview-muted">
                Dashboard · ${d.name.after} → Category · ${cat.name.after}
              </div>
              <div class="item-entity">
                ${item.name.before}
              </div>
            </div>
            <div class="dashboard-changes">
              <div class="change-label removed">Removed</div>
            </div>
          </li>
        `;
      });
    });
  });

  html += `
      </ul>
    </div>
  `;

  importPreviewContent.innerHTML = html;
}

function openImportPreviewModal(changePlan, onConfirm) {
  if (!importPreviewOverlay) return;

  importPreviewOverlay.hidden = false;
  importPreviewOverlay.setAttribute('aria-hidden', 'false');

  // Render preview UI
  renderImportPreview(changePlan);

  pushModal(importPreviewOverlay, closeImportPreviewModal);

  requestAnimationFrame(() => {
    focusFirstFocusableElement(importPreviewOverlay);
  });

  importPreviewConfirm.onclick = async () => {
    closeImportPreviewModal();
    if (typeof onConfirm === 'function') {
      await onConfirm();
    }
  };
}

function closeImportPreviewModal() {
  if (!importPreviewOverlay) return;

  importPreviewOverlay.hidden = true;
  importPreviewOverlay.setAttribute('aria-hidden', 'true');
  popModal(importPreviewOverlay);
}

function showImportSuccess(summary) {
  const lines = [];

  if (summary.dashboardsCreated > 0) {
    lines.push(`${summary.dashboardsCreated} dashboard(s) added`);
  }
  if (summary.dashboardsMerged > 0) {
    lines.push(`${summary.dashboardsMerged} dashboard(s) updated`);
  }
  lines.push(
    summary.preferencesReplaced
      ? 'Preferences replaced'
      : 'Preferences preserved'
  );

  showToast({
    title: 'Import completed',
    lines,
    type: 'success',
    duration: 5000
  });
}

function isImportSystemOpen() {
  const overlay = document.getElementById('import-system-overlay');
  return overlay && !overlay.hidden;
}

function syncImportPreferenceState(overlay) {
  const overwriteRadio = overlay.querySelector('input[name="import-mode"][value="overwrite"]');
  const replacePrefsCheckbox = overlay.querySelector('#import-replace-preferences');

  const optionWrapper = replacePrefsCheckbox?.closest('.import-option');

  if (!overwriteRadio || !replacePrefsCheckbox) return;

  if (overwriteRadio.checked) {
    // Force preferences replacement
    replacePrefsCheckbox.checked = true;
    replacePrefsCheckbox.disabled = true;
    optionWrapper?.classList.add('import-option--disabled');
  } 
  else {
    // Restore user control
    replacePrefsCheckbox.disabled = false;
    optionWrapper?.classList.remove('import-option--disabled');
  }
}

if (exportDashboardBtn) {
  exportDashboardBtn.addEventListener('click', async () => {
    try {
      const dashboards = [];

      for (const { id } of availableDashboards) {
        await DashboardService.setActiveDashboardId(id);
        const state = await DashboardService.load();
        if (!state) continue;

        dashboards.push({
          id: state.id,
          identity: {
            name: state.name,
            icon: userPreferences?.appearance?.identity?.icon ?? null
          },
          categories: structuredClone(state.categories)
        });
      }

      await DashboardService.setActiveDashboardId(activeDashboardId);

      const exportPayload = {
        schemaVersion: 2,
        type: 'system',
        exportedAt: new Date().toISOString(),
        dashboards,
        meta: { activeDashboardId, defaultDashboardId },
        preferences: {
          appearance: structuredClone(userPreferences.appearance),
          behavior: structuredClone(userPreferences.behavior)
        }
      };

      const json = JSON.stringify(exportPayload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = buildExportFilename();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error('[WebDash] System export failed:', err);

      showToast({
        title: 'Export failed',
        lines: [
          'Failed to export system backup.'
        ],
        type: 'error',
        duration: 7000
      });
    }
  });
}

// =====================================================
// Reset & destructive actions
// =====================================================

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

// =====================================================
// UI helpers
// =====================================================

importSystemOverlay?.addEventListener('mousedown', (e) => {
  if (e.target !== importSystemOverlay) return;

  // Prevent click from bubbling to Preferences overlay
  e.preventDefault();
  e.stopPropagation();

  closeImportSystemModal();
});

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

// Sync radios when modal opens
document.getElementById('settings-button')?.addEventListener('click', syncThemeRadios);

// Sync when modal or preferences open
document
  .getElementById('settings-button')
  ?.addEventListener('click', () => {
    syncThemeCards();
    syncBackgroundCards();
  }
);

if (identityResetBtn) {
  identityResetBtn.addEventListener('click', () => {
    resetIdentity();
  });
}

themeCards.forEach(card => {
  card.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    changeTheme(card.dataset.theme);
  });
});

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

importSystemClose?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeImportSystemModal();
});

importSystemCancel?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeImportSystemModal();
});

importPreviewClose?.addEventListener('click', closeImportPreviewModal);
importPreviewCancel?.addEventListener('click', closeImportPreviewModal);