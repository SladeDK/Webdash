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
// Import Utilities
// ======================================================================

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

function migrateSystemImportPayload(payload) {
  switch (payload.schemaVersion) {
    case 2:
      return payload;

    case 1:
      return {
        ...payload,
        schemaVersion: 2,
        meta: payload.meta ?? {
          activeDashboardId: null,
          defaultDashboardId: null
        },
        preferences: payload.preferences ?? {
          appearance: {},
          behavior: {}
        }
      };

    default:
      throw new Error('Unsupported import schema version');
  }
}

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
    userPreferences?.appearance?.identity?.name || 'Dashboard';

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

    const originalActiveId = activeDashboardId;

    // Load every dashboard in a single request
    const allDashboards = await DashboardService.loadAllDashboards();

    for (const { id } of availableDashboards) {
      const state = allDashboards[id];

      if (!state) continue;

      const dashboardMeta = availableDashboards.find(d => d.id === state.id);

      const name =
        state.name ||
        dashboardMeta?.name ||
        'Unnamed';

      const categories = (state.categories ?? []).map(cat => ({
        ...cat,
        visible: cat.visible ?? true,
        items: (cat.items ?? []).map(item => ({
          ...item,
          visible: item.visible ?? true
        }))
      }));

      dashboards.push({
        id: state.id,
        name,
        order: state.order ?? 0,

        identity: {
          name: state.identity?.name ?? state.name ?? 'Unnamed',
          icon: state.identity?.icon ?? null
        },

        appearance: {
          theme: state.appearance?.theme ?? 'system',
          background: state.appearance?.background ?? 'bg-plain'
        },

        categories
      });
    }

    const exportPayload = {
      schemaVersion: 2,
      type: 'system',
      exportedAt: new Date().toISOString(),

      dashboards,

      meta: {
        activeDashboardId: originalActiveId ?? null,
        defaultDashboardId: defaultDashboardId ?? null
      },

      preferences: {
        appearance: structuredClone(userPreferences?.appearance ?? {}),
        behavior: structuredClone(userPreferences?.behavior ?? {})
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
      lines: ['Your system configuration has been exported.'],
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
// SINGLE-DASHBOARD EXPORT / IMPORT
// ======================================================================

function downloadJsonFile(payload, filename) {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exportDashboard(dashboardId) {
  try {
    const state = await DashboardService.loadDashboardById(dashboardId);
    if (!state) throw new Error('Dashboard not found');

    const payload = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      type: 'dashboard',
      exportedAt: new Date().toISOString(),
      dashboard: {
        name: state.name,
        identity: {
          name: state.identity?.name ?? state.name ?? 'Dashboard',
          icon: state.identity?.icon ?? null
        },
        appearance: {
          theme: state.appearance?.theme ?? 'system',
          background: state.appearance?.background ?? 'bg-plain'
        },
        categories: (state.categories ?? []).map(cat => ({
          ...cat,
          visible: cat.visible ?? true,
          items: (cat.items ?? []).map(item => ({ ...item }))
        }))
      }
    };

    const safeName = (state.name || 'Dashboard')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-_]/g, '');

    const date = new Date().toISOString().split('T')[0];

    downloadJsonFile(payload, `WebDash-Dashboard-${safeName}-${date}.json`);

    showToast({
      title: 'Dashboard exported',
      lines: [`"${state.name}" was exported.`],
      type: 'success',
      duration: 4000
    });
  } catch (err) {
    console.error('[WebDash] Dashboard export failed:', err);
    showToast({
      title: 'Export failed',
      lines: ['The dashboard could not be exported.'],
      type: 'error',
      duration: 5000
    });
  }
}

// Adds a single exported dashboard as a NEW dashboard (fresh IDs), so it
// never collides with or overwrites anything the user already has.
async function importSingleDashboard(payload) {
  const d = payload?.dashboard;

  if (!d || typeof d !== 'object' || !Array.isArray(d.categories)) {
    throw new Error('Invalid dashboard file');
  }

  const normalized = normalizeImportedDashboard(d);
  const newId = generateId('dashboard');

  // Disambiguate the name if it collides with an existing dashboard
  const importedName = normalized.name;
  const hasCollision = availableDashboards.some(
    x => x.name.toLowerCase() === importedName.toLowerCase()
  );
  const finalName = hasCollision ? `${importedName} (imported)` : importedName;

  // Fresh IDs throughout so nothing clashes across dashboards
  const categories = (normalized.categories ?? []).map(cat => ({
    ...structuredClone(cat),
    id: generateId('category'),
    items: (cat.items ?? []).map(item => ({
      ...structuredClone(item),
      id: generateId('item')
    }))
  }));

  await DashboardService.createDashboard({ id: newId, name: finalName });
  await DashboardService.save({
    id: newId,
    name: finalName,
    identity: {
      name: finalName,
      icon: normalized.identity?.icon ?? '/assets/webdash-logo.png'
    },
    appearance: normalized.appearance,
    categories,
    order: availableDashboards.length
  });

  // Hydrate + switch to the imported dashboard (same flow as duplicate)
  dashboardState = await DashboardService.loadDashboardById(newId);
  pageCategories = dashboardState.categories;

  addAvailableDashboard({ id: newId, name: finalName }, 'importSingleDashboard');
  setActiveDashboardId(newId, 'importSingleDashboard');

  const list = normalizeDashboardOrderList(availableDashboards);
  replaceAvailableDashboards(list, 'importSingleDashboard');
  queueDashboardReorderSave();

  await commitPrehydratedDashboard(newId, 'importSingleDashboard');

  syncDashboardUI();
  renderDashboardManagementPanel();

  showToast({
    title: 'Dashboard imported',
    lines: [`Added "${finalName}".`],
    type: 'success',
    duration: 5000
  });
}

// ======================================================================
// IMPORT VALIDATION & PREVIEW
// ======================================================================

function renderImportPreview(plan) {
  if (!importUI?.previewContent) return;

  let html = '';

  // Merge explanation
  html += `
    <div class="preview-section preview-info">
      <div class="preview-info-text">
        Merge mode: Imported data will overwrite matching items and restore missing ones.
      </div>
    </div>
  `;
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

  (dashboards.removed ?? []).forEach(d => {
    html += `
      <li class="dashboard-item removed">
        <div class="dashboard-name">${escapeHtml(d.name.before)}</div>
        <div class="dashboard-state">Removed</div>
      </li>
    `;
  });

  (dashboards.added ?? []).forEach(d => {
    html += `
      <li class="dashboard-item added">
        <div class="dashboard-name">${escapeHtml(d.name.after)}</div>
        <div class="dashboard-state">Added</div>
      </li>
    `;
  });

  (dashboards.updated ?? []).forEach(d => {
    const renamed = d.name.before !== d.name.after;
    let changeSummary = [];

    if (d.categories) {
      const added = d.categories.added?.length ?? 0;
      const removed = d.categories.removed?.length ?? 0;

      let itemChanges = 0;

      (d.categories.updated ?? []).forEach(c => {
        if (!c.items) return;
        itemChanges +=
          (c.items.added?.length ?? 0) +
          (c.items.updated?.length ?? 0) +
          (c.items.removed?.length ?? 0);
      });

      if (added > 0) changeSummary.push(`+${added} categories`);
      if (removed > 0) changeSummary.push(`-${removed} categories`);
      if (itemChanges > 0) changeSummary.push(`${itemChanges} item changes`);
    }

    html += `
      <li class="dashboard-item">
        <div class="dashboard-name">
          ${renamed
            ? `${escapeHtml(d.name.before)} <span class="rename-arrow">→</span> ${escapeHtml(d.name.after)} (import override)`
            : escapeHtml(d.name.after)}
        </div>
        <div class="dashboard-changes">
          ${renamed ? `<div class="change-label renamed">Renamed (local → imported)</div>` : ``}
          ${changeSummary.length
            ? `<div class="change-label internal">${changeSummary.join(', ')}</div>`
            : ``}
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

  (dashboards.updated ?? []).forEach(d => {
    if (!d.categories) return;

    (d.categories.updated ?? []).forEach(cat => {
      const renamed = cat.name.before !== cat.name.after;

      html += `
        <li class="dashboard-item">
          <div class="dashboard-name">
            <div class="preview-muted">
              Dashboard · ${escapeHtml(d.name.after)}
            </div>
            <div class="item-entity">
              ${renamed ? `${escapeHtml(cat.name.before)} → ${escapeHtml(cat.name.after)} (import override)` : escapeHtml(cat.name.after)}
            </div>
          </div>
          <div class="dashboard-changes">
            ${renamed ? `<div class="change-label updated">Renamed (local → imported)</div>` : ``}
            <div class="change-label internal">Modified</div>
          </div>
        </li>
      `;
    });

    (d.categories.added ?? []).forEach(cat => {
      html += `
        <li class="dashboard-item">
          <div class="dashboard-name">
            <div class="preview-muted">
              Dashboard · ${escapeHtml(d.name.after)}
            </div>
            <div class="item-entity">
              ${escapeHtml(cat.name.after)}
            </div>
          </div>
          <div class="dashboard-changes">
            <div class="change-label added">Added</div>
            <div class="change-label internal">Modified</div>
          </div>
        </li>
      `;
    });

    (d.categories.removed ?? []).forEach(cat => {
      html += `
        <li class="dashboard-item removed">
          <div class="dashboard-name">
            <div class="preview-muted">
              Dashboard · ${escapeHtml(d.name.after)}
            </div>
            <div class="item-entity">
              ${escapeHtml(cat.name.before)}
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

  (dashboards.updated ?? []).forEach(d => {
    if (!d.categories) return;

    (d.categories.updated ?? []).forEach(cat => {
      if (!cat.items) return;

      (cat.items.updated ?? []).forEach(item => {
        const renamed = item.name.before !== item.name.after;
        const urlChanged = item.url.before !== item.url.after;

        html += `
          <li class="dashboard-item">
            <div class="dashboard-name">
              <div class="preview-muted">
                Dashboard · ${escapeHtml(d.name.after)} → Category · ${escapeHtml(cat.name.after)}
              </div>

              <div class="item-entity">
                ${renamed ? `${escapeHtml(item.name.before)} → ${escapeHtml(item.name.after)}` : escapeHtml(item.name.after)}
              </div>

              <div class="preview-muted">
                ${urlChanged
                  ? `${escapeHtml(item.url.before)} → ${escapeHtml(item.url.after)}`
                  : escapeHtml(item.url.after)}
              </div>
            </div>
            <div class="dashboard-changes">
              ${renamed ? `<div class="change-label updated">Renamed</div>` : ``}
              ${urlChanged ? `<div class="change-label updated">Modified URL</div>` : ``}
            </div>
          </li>
        `;
      });

      (cat.items.added ?? []).forEach(item => {
        const restored = item.before !== undefined;
        html += `
          <li class="dashboard-item">
            <div class="dashboard-name">
              <div class="preview-muted">
                Dashboard · ${escapeHtml(d.name.after)} → Category · ${escapeHtml(cat.name.after)}
              </div>
              <div class="item-entity">
                ${escapeHtml(item.name.after)}
              </div>
              <div class="preview-muted">${escapeHtml(item.url.after)}</div>
            </div>
            <div class="dashboard-changes">
              <div class="change-label added">
                ${restored ? 'Restored from import' : 'Added'}
              </div>
            </div>
          </li>
        `;
      });

      (cat.items.removed ?? []).forEach(item => {
        html += `
          <li class="dashboard-item removed">
            <div class="dashboard-name">
              <div class="preview-muted">
                Dashboard · ${escapeHtml(d.name.after)} → Category · ${escapeHtml(cat.name.after)}
              </div>
              <div class="item-entity">
                ${escapeHtml(item.name.before)}
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

  // Show fallback if nothing meaningful was rendered
  const hasChanges =
    (dashboards.added?.length ?? 0) > 0 ||
    (dashboards.removed?.length ?? 0) > 0 ||
    (dashboards.updated?.length ?? 0) > 0;

  if (!hasChanges) {
    html = `
      <div class="preview-section">
        <h3>No changes detected</h3>
        <p class="preview-muted">
          The imported data matches your current setup.
        </p>
      </div>
    `;
  }

  importUI.previewContent.innerHTML = html;
}

// ======================================================================
// IMPORT NORMALIZATION HELPERS (local, runtime-safe)
// ======================================================================

function normalizeImportedDashboard(d) {
  const name =
    d.name ??
    'Unnamed';

  const validationResult = validateAppearance({
    appearance: {
      theme: d.appearance?.theme,
      background: d.appearance?.background
    }
  });

  return {
    id: d.id,

    name,

    identity: {
      name: d.identity?.name ?? d.name ?? 'Unnamed',
      icon: d.identity?.icon ?? null
    },

    appearance: {
      theme: validationResult.prefs.appearance.theme,
      background: validationResult.prefs.appearance.background
    },

    order: d.order ?? 0,

    categories: (d.categories ?? []).map(cat => ({
      ...cat,
      visible: cat.visible ?? true,
      items: (cat.items ?? []).map(item => ({
        ...item,
        visible: item.visible ?? true
      }))
    }))
  };
}

// ======================================================================
// IMPORT NORMALIZATION & COMPATIBILITY
// ======================================================================

function normalizeImportedPreferences(prefs) {
  const result = validateAppearance(prefs);

  // Ensure behavior still exists
  if (!result.prefs.behavior) {
    result.prefs.behavior = structuredClone(createDefaultPreferences().behavior);
  }

  return result;
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

  if (!overlay._importModeWired) {
    overlay._importModeWired = true;

    overlay
      .querySelectorAll('input[name="import-mode"]')
      .forEach(radio => {
        radio.addEventListener('change', () =>
          syncImportPreferenceState(overlay)
        );
      });
  }

	pushModal(overlay, closeImportSystemModal);

  requestAnimationFrame(() => {
    focusFirstFocusableElement(overlay);
  });

  const confirmBtn = overlay.querySelector('#import-system-confirm');
  if (!confirmBtn) {
    console.error('[WebDash] Import confirm button not found');
    return;
  }

  const safeImportConfirm = guardAsync(async () => {
    const mode =
      overlay.querySelector('input[name="import-mode"]:checked')?.value ??
      IMPORT_MODE.MERGE;

    const replacePreferences =
      overlay.querySelector('#import-replace-preferences')?.checked ?? true;

    // Build preview context FIRST
    let safePayload;

    try {
      // Basic sanity check
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid import data');
      }

      // Migrate (handles older schema versions)
      safePayload = migrateSystemImportPayload(payload);

      // Validate (strict schema check)
      validateSystemImportPayload(safePayload);

    } catch (err) {
      showToast({
        title: 'Import failed',
        lines: [err.message],
        type: 'error',
        duration: 5000
      });
      return;
    }

    //  Continue with safe payload
    const plan = await buildPreviewContext(safePayload, mode);

    openImportPreviewModal(plan, async () => {
      closeImportSystemModal();

      if (plan.type === SystemTransitionType.IMPORT_OVERWRITE) {
        await overwriteSystemImport(safePayload, replacePreferences);
      } else {
        await mergeSystemImport(safePayload, replacePreferences);
      }
    });
  });

  confirmBtn.onclick = safeImportConfirm;
}

function closeImportSystemModal() {
  const overlay = importUI?.systemOverlay;
  if (!overlay) return;

  // Start closing animation
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

  const safePreviewConfirm = guardAsync(async () => {
    closeImportPreviewModal();
    await onConfirm?.();
  });

  previewConfirm.onclick = safePreviewConfirm;
}

function closeImportPreviewModal() {
  const overlay = importUI?.previewOverlay;
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

function showImportSuccess(summary, warnings = []) {
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

	
  if (warnings.includes('theme')) {
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

  if (warnings.includes('background')) {
    showToast({
      title: 'Import notice',
      lines: [
        'The import file contained an invalid background.',
        'Background was reset to the default.'
      ],
      type: 'error',
      duration: 5000
    });
  }
  
  // Force immediate UI sync — initApp() already re-hydrated
  // dashboardState, so appearance comes from in-memory state.
  applyDashboardAppearance();

  // Sync UI safely
  if (typeof syncThemeCards === 'function') syncThemeCards();
  if (typeof syncBackgroundCards === 'function') syncBackgroundCards();
  if (typeof syncThemeRadios === 'function') syncThemeRadios();

  // Re-hydrate dropdown components after DOM replacement
  initializeDropdowns();
}

// ======================================================================
// BACKUP RESTORE UI
// ======================================================================

function formatBackupTimestamp(iso) {
  const date = new Date(iso);
  if (isNaN(date)) return iso;

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function renderBackupList() {
  const container = document.getElementById('backup-list');
  if (!container) return;

  container.innerHTML = '<div class="empty-state">Loading backups…</div>';

  let backups = [];
  try {
    backups = await BackupService.list();
  } catch (err) {
    console.error('[WebDash] Failed to load backups:', err);
    container.innerHTML = '<div class="empty-state">Could not load backups</div>';
    return;
  }

  if (!backups.length) {
    container.innerHTML =
      '<div class="empty-state">No backups yet — they appear after your first change</div>';
    return;
  }

  container.innerHTML = '';

  backups.forEach(backup => {
    const row = document.createElement('div');
    row.className = 'backup-row';

    const info = document.createElement('div');
    info.className = 'backup-info';

    const when = document.createElement('span');
    when.className = 'backup-when';
    when.textContent = formatBackupTimestamp(backup.createdAt);

    const size = document.createElement('span');
    size.className = 'backup-size';
    size.textContent = `${(backup.size / 1024).toFixed(1)} KB`;

    info.append(when, size);

    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'secondary-btn';
    restoreBtn.textContent = 'Restore';

    restoreBtn.onclick = () => {
      openConfirm({
        title: 'Restore backup',
        message:
          `Restore the snapshot from ${formatBackupTimestamp(backup.createdAt)}?\n\n` +
          'Your current data will be replaced. A backup of the current state ' +
          'is taken first, so this can be undone.',
        confirmLabel: 'Restore',
        onConfirm: async () => {
          try {
            await BackupService.restore(backup.name);

            showToast({
              title: 'Backup restored',
              lines: ['Reloading with the restored data…'],
              type: 'success',
              duration: 3000
            });

            setTimeout(() => window.location.reload(), 700);
          } catch (err) {
            console.error('[WebDash] Restore failed:', err);
            showToast({
              title: 'Restore failed',
              lines: ['The backup could not be restored.', 'Please try again.'],
              type: 'error',
              duration: 5000
            });
          }
        }
      });
    };

    row.append(info, restoreBtn);
    container.appendChild(row);
  });
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

