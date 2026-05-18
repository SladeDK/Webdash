// ======================================================================
// PREFERENCES IMPORT / EXPORT
// ======================================================================
//
// Owns all system-level import, export, preview, merge, overwrite,
// and reset logic for preferences and dashboards.
//
// Responsibilities:
// - Export system state (dashboards + preferences)
// - Validate import payloads
// - Build and render import previews
// - Execute merge / overwrite imports
// - Reset dashboards and full system state
// - Provide user feedback for import results
//
// Does NOT:
// - Wire UI event listeners (handled by preferences.ui.js)
// - Own DOM query definitions
// - Manage visual UI state outside import flows
//
// This file contains all destructive and high-impact operations.
//



// ======================================================================
// Import UI context (injected by preferences.ui.js)
// ======================================================================

let importUI = null;

function registerImportUI(context) {
  importUI = context;
}

// ======================================================================
// IMPORT / EXPORT CONSTANTS & MODES
// ======================================================================

// ======================================================================
// EXPORT LOGIC
// ======================================================================

function buildExportFilename() {
  const rawName = 
		userPreferences.appearance.identity.name || 'Dashboard';

  // Normalize for filesystem safety
  const dashboardName = rawName
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '');

  // YYYY-MM-DD
  const date = new Date().toISOString().split('T')[0];

  return `WebDash-${dashboardName}-${date}.json`;
}

async function exportSystem() {
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
    showToast({
      title: 'Export completed',
      lines: [
        'Your system configuration is being exported...'
      ],
      type: 'success',
      duration: 5000
    });
  } catch (err) {
    console.error('[WebDash] System export failed:', err);
    showToast({
      title: 'Export failed',
      lines: [
        'The system configuration could not be exported.',
        'Please try again.'
      ],
      type: 'error',
      duration: 5000
    });
  }
}

// ======================================================================
// IMPORT VALIDATION & PREVIEW
// ======================================================================

function renderImportPreview(plan) {
  if (!importUI?.previewContent) return;

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

  importUI.previewContent.innerHTML = html;
}

// ======================================================================
// IMPORT NORMALIZATION HELPERS (local, runtime-safe)
// ======================================================================

function isValidTheme(theme) {
  if (typeof theme !== 'string') return false;
  return (
    theme === 'system' ||
    [
      'theme-dark',
      'theme-light',
      'theme-midnight',
      'theme-slate',
      'theme-nord',
      'theme-carbon',
      'theme-glass'
    ].includes(theme)
  );
}

function isValidBackground(bg) {
  if (typeof bg !== 'string') return false;
  return BACKGROUNDS.includes(bg);
}

// ======================================================================
// IMPORT NORMALIZATION & COMPATIBILITY
// ======================================================================

function normalizeImportedPreferences(prefs) {
  const defaults = createDefaultPreferences();
  const warnings = [];

  if (!prefs.appearance) {
    prefs.appearance = {};
  }

  if (!isValidTheme(prefs.appearance.theme)) {
    warnings.push('theme');
    prefs.appearance.theme = defaults.appearance.theme;
  }

  if (!isValidBackground(prefs.appearance.background)) {
    warnings.push('background');
    prefs.appearance.background = defaults.appearance.background;
  }

  if (!prefs.behavior) {
    prefs.behavior = structuredClone(defaults.behavior);
  }

  return { prefs, warnings };
}

// ======================================================================
// IMPORT / PREVIEW MODALS
// ======================================================================

function openImportSystemModal(payload) {
  const overlay = importUI?.systemOverlay;
  if (!overlay) {
    console.error('[WebDash] Import system overlay not registered');
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

	pushModal(overlay, closeImportSystemModal);

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
  const overlay = importUI?.systemOverlay;
  if (!overlay) return;

  // ✅ Start closing animation
  overlay.classList.add('is-closing');
  overlay.setAttribute('aria-hidden', 'true');

  setTimeout(() => {
    overlay.hidden = true;

    // cleanup
    overlay.classList.remove('is-closing');

    popModal(overlay);
  }, 160);
}

function openImportPreviewModal(changePlan, onConfirm) {
  if (!importUI) return;

  const { previewOverlay, previewConfirm } = importUI;
  if (!previewOverlay || !previewConfirm) return;

  previewOverlay.hidden = false;
  previewOverlay.setAttribute('aria-hidden', 'false');

  renderImportPreview(changePlan);
  pushModal(previewOverlay, closeImportPreviewModal);

  requestAnimationFrame(() => {
    focusFirstFocusableElement(previewOverlay);
  });

  previewConfirm.onclick = async () => {
    closeImportPreviewModal();
    await onConfirm?.();
  };
}

function closeImportPreviewModal() {
  const overlay = importUI?.previewOverlay;
  if (!overlay) return;

  // ✅ Start closing animation
  overlay.classList.add('is-closing');
  overlay.setAttribute('aria-hidden', 'true');

  // ✅ Delay removal so animation can play
  setTimeout(() => {
    overlay.hidden = true;

    // cleanup
    overlay.classList.remove('is-closing');

    popModal(overlay);
  }, 160);
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

function isImportSystemOpen() {
  return !!importUI?.systemOverlay && !importUI.systemOverlay.hidden;
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

	
  if (importWarnings?.includes('theme')) {
    showToast({
      title: 'Import notice',
      lines: [
        'The import file contained an invalid theme.',
        'Theme was reset to the system default.'
      ],
      type: 'error',
      duration: 5000
    });
  }

  // Re-apply appearance
  setActiveTheme(userPreferences.appearance.theme);
  setActiveBackground(userPreferences.appearance.background);

  // Re-sync appearance-driven UI
  syncThemeCards();
  syncBackgroundCards();
  syncThemeRadios?.();

  // Re-hydrate dropdown components after DOM replacement
  initializeDropdowns();

	importWarnings = [];
}

// ======================================================================
// PUBLIC IMPORT UI API
// ======================================================================

function closeImportPreview() {
  closeImportPreviewModal();
}

function closeImportSystem() {
  closeImportSystemModal();
}


// ======================================================================
// IMPORT EXECUTION (MERGE / OVERWRITE)
// ======================================================================

// ======================================================================
// RESET & DESTRUCTIVE ACTIONS
// ======================================================================

