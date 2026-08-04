
//  * core/init.js
//  *
//  * System bootstrap and lifecycle orchestration:
//  * - App startup
//  * - Dashboard initialization
//  * - System transitions (import / reset)
//  * - Cross-domain coordination
//  *

// =====================================================
// Constants & enums
// =====================================================

// Keys
const USER_PREFS_KEY = 'webdash-user-preferences';
const HAS_SEEDED_DASHBOARD_KEY = "webdash.hasSeededDashboard";
const DASHBOARD_STATE_KEY = 'webdash-dashboard-state';
const AUTO_CLOSE_KEY = 'webdash-dropdown-autoclose';
const IMPORT_MODE = {
  MERGE: 'merge',
  OVERWRITE: 'overwrite'
};
const SystemTransitionType = Object.freeze({
  IMPORT_OVERWRITE: 'IMPORT_OVERWRITE',
  IMPORT_MERGE: 'IMPORT_MERGE',
  RESET_SYSTEM: 'RESET_SYSTEM'
});

window.importWarnings = [];

// =====================================================
// Initialization helpers
// =====================================================

window.guardAsync = function (fn) {
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
};

function setLifecyclePhase(phase) {
  lifecyclePhase = phase;

  console.debug('[WebDash] Lifecycle ->', {
    phase,
    timestamp: Date.now()
  });
}

function normalizeDashboardOrder(dashboards, originalLocal = []) {
  const localMap = new Map(originalLocal.map(d => [d.id, d]));

  const result = [];
  const usedOrders = new Set();

  // STEP 1 — Resolve SAME-ID overrides first
  dashboards.forEach(d => {
    const local = localMap.get(d.id);

    if (local) {
      // Same dashboard → import wins
      result.push({
        ...d,
        order: (typeof d.order === 'number') ? d.order : local.order
      });
    } else {
      result.push(d);
    }
  });

  // STEP 2 — Split into valid + invalid
  const valid = [];
  const invalid = [];

  result.forEach(d => {
    if (
      typeof d.order === 'number' &&
      !usedOrders.has(d.order)
    ) {
      valid.push(d);
      usedOrders.add(d.order);
    } else {
      invalid.push(d); // duplicates or missing
    }
  });

  // STEP 3 — Sort valid
  valid.sort((a, b) => a.order - b.order);

  // STEP 4 — Merge (valid first, invalid last)
  const merged = [...valid, ...invalid];

  return merged;
}

// =====================================================
// Application bootstrap
// =====================================================

(function ensureUserInUrl() {
  const url = new URL(window.location.href);

  if (!url.searchParams.get('user')) {
    const storedUser = localStorage.getItem('webdash-last-user') || 'default';

    url.searchParams.set('user', storedUser);

    window.location.replace(url.toString());
  }
})();

async function initApp() {
  // Early cache read (for instant data availability — NO rendering here)
  let cachedDashboard = null;

  try {
    const cachedRaw = localStorage.getItem('webdash-dashboard-cache-v1');

    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);

      if (parsed?.data) {
        cachedDashboard = parsed.data;

        if (Array.isArray(parsed.data.categories)) {
          console.debug('[WebDash] Preloading categories from cache');
          pageCategories = parsed.data.categories;
        }
      }
    }
  } catch (e) {
    console.warn('[WebDash] Failed to preload cache:', e);
  }

  // ----------------------------------
  // Load the FULL system state + preferences in two parallel requests.
  // (This bootstrap previously took ~9 sequential round-trips.)
  // ----------------------------------
  const [fullState, loadedPreferences] = await Promise.all([
    DashboardService.loadFullState(),
    PreferencesService.load()
  ]);

  userPreferences = loadedPreferences;
  ensureBehaviorDefaults();

  const dashboardsMap = fullState?.dashboards ?? {};

  availableDashboards = normalizeDashboardOrder(
    Object.entries(dashboardsMap).map(([id, d]) => ({
      id,
      name: d?.name || 'WebDash',
      order: d?.order ?? 0
    }))
  );

  // Ensure system always has a valid default + active dashboard
  let nextDefaultDashboardId = fullState?.defaultDashboardId ?? null;
  let nextActiveDashboardId = fullState?.activeDashboardId ?? null;

  // If no dashboards exist → create one (absolute base invariant)
  if (!availableDashboards.length) {
    console.warn('[Init Fix] No dashboards exist — creating default');

    const id = `dashboard-${Date.now()}`;
    const template = getDefaultDashboardTemplate({ id });

    await DashboardService.createDashboard({
      id: template.id,
      name: template.name
    });

    await DashboardService.save(template);

    dashboardsMap[id] = template;

    availableDashboards = [{
      id: template.id,
      name: template.name,
      order: 0
    }];

    nextDefaultDashboardId = id;
    nextActiveDashboardId = id;
  }

  // Fix default if missing/invalid
  if (
    !nextDefaultDashboardId ||
    !availableDashboards.some(d => d.id === nextDefaultDashboardId)
  ) {
    nextDefaultDashboardId = availableDashboards[0].id;

    await DashboardService.setDefaultDashboardId(nextDefaultDashboardId);
  }

  // Fix active if missing/invalid
  if (
    !nextActiveDashboardId ||
    !availableDashboards.some(d => d.id === nextActiveDashboardId)
  ) {
    nextActiveDashboardId = nextDefaultDashboardId;

    await DashboardService.setActiveDashboardId(nextActiveDashboardId);
  }

  // Temporarily disable invariant enforcement during bootstrap
  const prevAppReady = appReady;
  appReady = false;

  // Apply BOTH before invariants are enforced
  activeDashboardId = nextActiveDashboardId;
  defaultDashboardId = nextDefaultDashboardId;

  // Now restore lifecycle
  appReady = prevAppReady;

  // ----------------------------------
  // Hydrate dashboard state from the snapshot (no extra request);
  // the localStorage copy is a fallback when the API is unavailable.
  // ----------------------------------
  dashboardState =
    dashboardsMap[activeDashboardId] ??
    (cachedDashboard?.id === activeDashboardId ? cachedDashboard : null) ??
    getDefaultDashboardTemplate({ id: activeDashboardId });

  if (!Array.isArray(dashboardState.categories)) {
    console.warn('[WebDash] Invalid dashboardState.categories');
    dashboardState.categories = [];
  }

  pageCategories = dashboardState.categories;

  // Refresh the local cache with the authoritative state
  try {
    localStorage.setItem(
      'webdash-dashboard-cache-v1',
      JSON.stringify({
        timestamp: Date.now(),
        data: dashboardState
      })
    );
  } catch (e) {
    console.warn('[WebDash] Failed to write dashboard cache:', e);
  }

  if (userPreferences?.behavior?.storeRecentsAcrossReloads === false) {
    userPreferences.behavior.recents = [];
    await PreferencesService.save(userPreferences);
  }

  setLifecyclePhase(LifecyclePhase.DASHBOARDS_LOADED);

  // ----------------------------------
  // Preferences
  // ----------------------------------
  if (!userPreferences) {
    userPreferences = createDefaultPreferences();

    ensureBehaviorDefaults();

    // Only save if backend returned nothing
    await PreferencesService.save(userPreferences);
  }

  // ----------------------------------
  // Cleanup legacy global identity data
  // ----------------------------------
  if (userPreferences.appearance?.identity) {
    let changed = false;

    if ('name' in userPreferences.appearance.identity) {
      delete userPreferences.appearance.identity.name;
      changed = true;
    }

    if ('icon' in userPreferences.appearance.identity) {
      delete userPreferences.appearance.identity.icon;
      changed = true;
    }

    if (changed) {
      await PreferencesService.save(userPreferences);
    }
  }

  setLifecyclePhase(LifecyclePhase.PREFERENCES_LOADED);

  // Validate and fix appearance preferences
  const result = validateAppearance(userPreferences);
  userPreferences = result.prefs;

  // Track warnings for toast logic
  const themeInvalid = result.warnings.includes('theme');
  const backgroundInvalid = result.warnings.includes('background');

  // Persist ONLY if fixes were applied
  if (themeInvalid || backgroundInvalid) {
    await PreferencesService.save(userPreferences);
  }

  wireSyncAppearanceBehavior();
  wireSyncIdentityBehavior();

  ensureIdentityDefaults();
  syncBehaviorUI();

  applyIdentityToUI();

  syncIdentityInputState();
  document.documentElement.classList.add('identity-ready');

  // Apply visual preferences immediately
  applyDashboardAppearance();
  applyAnimationPreference();
  applyDebugMode();
  applyClassicUI();
  applyCompactMode();
  applyClockWidget();
  applyAccentColor();
  applyCustomBackgroundImage();

  // Toasts (independent)
  if (themeInvalid) {
    showToast({
      title: 'Theme reset',
      lines: [
        'The existing theme value is invalid',
        `The theme defaulted to "System"`
      ],
      type: 'error',
      duration: 5000
    });
  }

  if (backgroundInvalid) {
    showToast({
      title: 'Background reset',
      lines: [
        'The existing background value is invalid',
        `The background defaulted to "Plain"`
      ],
      type: 'error',
      duration: 5000
    });
  }

  // (OS theme changes are handled in preferences.lifecycle.js)

  // ----------------------------------
  // Render
  // ----------------------------------
  assertSystemInvariants('before appReady');
  appReady = true;

  setLifecyclePhase(LifecyclePhase.READY);

  document.body.classList.add('categories-initialized');

  // Build the cross-dashboard item index from the snapshot we already
  // loaded — no extra request needed.
  buildGlobalItemIndexFromDashboards(dashboardsMap);

  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
  renderDashboardList();
  renderThemeDropdown();
  renderThemeGrid();
  renderBackgroundGrid();
  initUserDropdown();
  initCreateUserModal();
  initEditUserModal();
  initUserActions();

  initializeDropdowns();
  initializeDashboardUIBindings();
  initializeButtonEditorBindings();

  revealApp();
}

// The app starts hidden (visibility:hidden + .preload) to avoid a
// flash of unstyled content. Reveal on the next frame so styles settle
// first — but rAF is paused in background tabs, and a startpage is very
// often opened in one. The timeout guarantees the page is revealed even
// if no frame is ever painted.
function revealApp() {
  let revealed = false;

  const reveal = () => {
    if (revealed) return;
    revealed = true;

    const root = document.documentElement;

    root.style.visibility = 'visible';
    root.classList.remove('preload');

    document.body.classList.remove('app-loading');
    document.body.classList.add('app-ready');
  };

  requestAnimationFrame(reveal);
  setTimeout(reveal, 100);
}

// =====================================================
// Identity helpers (core)
// =====================================================

function getDefaultIdentity() {
  return {
    name: INITIAL_IDENTITY.name,
    icon: INITIAL_IDENTITY.icon
  };
}

function ensureIdentityDefaults() {
  // Ensure appearance root exists
  if (!userPreferences.appearance) {
    userPreferences.appearance = {};
  }

  // Ensure identity exists
  if (!userPreferences.appearance.identity) {
    userPreferences.appearance.identity = getDefaultIdentity();
  }
  
  if (typeof userPreferences.appearance.identity.syncWithDashboard !== 'boolean') {
    userPreferences.appearance.identity.syncWithDashboard = true;
  }
}

function applyDocumentTitle() {
  const rawName =
    dashboardState?.identity?.name ||
    userPreferences?.appearance?.identity?.name ||
    'Dashboard';

  const name = rawName && rawName.trim()
    ? rawName.trim()
    : 'Dashboard';

  if (name.toLowerCase() === 'webdash') {
    document.title = 'WebDash';
  } else {
    document.title = `${name} – WebDash`;
  }
}

function applyDashboardAppearance() {
  const syncOn =
    userPreferences?.behavior?.syncDashboardAppearance !== false;

  if (syncOn) {
    // Global appearance
    if (isValidTheme(userPreferences.appearance.theme)) {
      setActiveTheme(userPreferences.appearance.theme);
    }
    if (isValidBackground(userPreferences.appearance.background)) {
      setActiveBackground(userPreferences.appearance.background);
    }
    applyCustomBackgroundImage();
    return;
  }

  // Per-dashboard appearance (fallback to global)
  const appearance = dashboardState?.appearance;

  setActiveTheme(
    appearance?.theme ?? userPreferences.appearance.theme
  );

  setActiveBackground(
    appearance?.background ?? userPreferences.appearance.background
  );

  applyCustomBackgroundImage();
}

// =====================================================
// System transitions
// =====================================================

async function applySystemState({
  type,
  dashboards,
  activeDashboardId: nextActiveDashboardId,
  defaultDashboardId: nextDefaultDashboardId,
  preferences
}) {
  if (!type) {
    console.warn('[WebDash] applySystemState called without transition type');
  }

  // ---------------------------
  // Apply dashboards
  // ---------------------------
  const localBefore = availableDashboards;

  availableDashboards = normalizeDashboardOrder(
    dashboards.map(d => ({
      id: d.id,
      name: d.name,
      order: d.order ?? 0
    })),
    localBefore
  );

  // Persist normalized order to backend
  await fetch(buildUrl('/api/dashboards/reorder'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      availableDashboards.map(d => ({
        id: d.id,
        order: d.order
      }))
    )
  });

  // ---------------------------
  // Apply preferences (if provided)
  // ---------------------------
  let warnings = [];

  if (preferences) {
    const result = normalizeImportedPreferences(
      structuredClone(preferences)
    );

    const prefs = result.prefs;
    warnings = result.warnings ?? [];

    importWarnings = warnings;

    // Replace entire preferences safely
    userPreferences = {
      ...userPreferences,
      appearance: structuredClone(prefs.appearance ?? {}),
      behavior: structuredClone(prefs.behavior ?? {})
    };

    ensureBehaviorDefaults();

    await PreferencesService.save(userPreferences);

  } else {
    importWarnings = [];
  }

  // ---------------------------
  // Apply dashboard metadata
  // ---------------------------
  if (nextDefaultDashboardId) {
    await DashboardService.setDefaultDashboardId(nextDefaultDashboardId);
    defaultDashboardId = nextDefaultDashboardId;
  }

  if (nextActiveDashboardId) {
    await DashboardService.setActiveDashboardId(nextActiveDashboardId);
    activeDashboardId = nextActiveDashboardId;
  }

  // ---------------------------
  // Reinitialize app
  // ---------------------------
  await initApp();

  // ---------------------------
  // Sync Preferences UI if open
  // ---------------------------
  if (isPreferencesOpen()) {
    syncDefaultDashboardSelector();
    syncLayoutDashboardSelector();
    renderDashboardManagementPanel();
  }

  // ---------------------------
  // Transition hook (future)
  // ---------------------------
  // e.g. logSystemTransition(type, ...)

  return warnings;
}

async function syncAppearanceToAllDashboards() {
  if (!dashboardState || !availableDashboards.length) return;

  const appearance = {
    theme: userPreferences.appearance.theme,
    background: userPreferences.appearance.background
  };

  if (userPreferences.appearance.customBackgroundId != null) {
    appearance.customBackgroundId =
      userPreferences.appearance.customBackgroundId;
  }

  // Keep the active dashboard's in-memory state consistent with what
  // the server just wrote to every dashboard.
  dashboardState.appearance = {
    ...dashboardState.appearance,
    ...appearance
  };

  // One request updates every dashboard server-side (single write +
  // single backup) instead of set-active/load/save per dashboard.
  await DashboardService.applyAppearanceToAll(appearance);
}

async function resetDashboard(dashboardId = activeDashboardId) {
  if (!dashboardId) return;

  // Capture display name BEFORE mutation
  const dashboardName =
    dashboardState?.name ??
    availableDashboards.find(d => d.id === dashboardId)?.name ??
    'Dashboard';

  try {
    const template = getDefaultDashboardTemplate({
      id: dashboardId,
      name: dashboardName
    });

    dashboardState = template;
    pageCategories = dashboardState.categories;

    await DashboardService.save(dashboardState);

    renderCategories(pageCategories);
    renderLayoutEditor(pageCategories);

    // SUCCESS TOAST
    showToast({
      title: 'Dashboard reset',
      lines: [
        `The dashboard "${dashboardName}" was reset successfully.`
      ],
      type: 'success',
      duration: 5000
    });

  } catch (err) {
    console.error('[WebDash] Failed to reset dashboard', err);

    // ERROR TOAST
    showToast({
      title: 'Dashboard Reset failed',
      lines: [
        `The dashboard "${dashboardName}" could not be reset.`,
        'Please try again.'
      ],
      type: 'error',
      duration: 5000
    });
  }
}

async function resetSystem() {
try {
    localStorage.removeItem(USER_PREFS_KEY);

    // Clear all dashboards on backend
    for (const { id } of availableDashboards) {
      await fetch(buildUrl(`/api/dashboards/${id}`), { method: 'DELETE' });
    }

    // Reset in-memory dashboard metadata
    availableDashboards = [];

    // Create one fresh default dashboard
    const id = `dashboard-${Date.now()}`;
    const template = getDefaultDashboardTemplate({ id });

    await DashboardService.createDashboard({
      id: template.id,
      name: template.name
    });

    await DashboardService.save(template);

    // System state description
    const dashboards = [
      {
        id: template.id,
        name: template.name
      }
    ];

    // Apply system transition
    await applySystemState({
      type: SystemTransitionType.RESET_SYSTEM,
      dashboards,
      activeDashboardId: template.id,
      defaultDashboardId: template.id,
      preferences: createDefaultPreferences()
    });

    // SUCCESS TOAST (system-level)
    showToast({
      title: 'System reset',
      lines: [
        'The system was reset successfully.'
      ],
      type: 'success',
      duration: 5000
    });

  } catch (err) {
    console.error('[WebDash] System reset failed:', err);

    // ERROR TOAST
    showToast({
      title: 'System reset failed',
      lines: [
        'The system could not be fully reset.',
        'Please try again.'
      ],
      type: 'error',
      duration: 5000
    });
  }
}

// =====================================================
// Import / export engine (core)
// -----------------------------------------------------
// Schema v2
// - Export represents a FULL system snapshot
// - Dashboards are merged by ID on import
// - Categories and buttons are replaced by ID, merged otherwise
// - Missing items are preserved
// - Preferences may be overwritten (user opt-in)
// - Import must NOT bypass invariants
// - initApp() MUST be called after import
// =====================================================

function mergeItems(localItems = [], importedItems = []) {
  const localById = new Map(localItems.map(item => [item.id, item]));
  const usedLocalIds = new Set();

  // Take all imported items (authoritative)
  const merged = importedItems.map(imported => {
    if (localById.has(imported.id)) {
      usedLocalIds.add(imported.id);
    }
    return { ...imported };
  });

  // Append local-only items
  for (const local of localItems) {
    if (!usedLocalIds.has(local.id)) {
      merged.push({ ...local });
    }
  }

  // Ensure correct final order
  merged.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return merged;
}

function mergeCategories(localCategories = [], importedCategories = []) {
  const result = [...localCategories];

  for (const imported of importedCategories) {
    const localIndex = result.findIndex(c => c.id === imported.id);

    if (localIndex !== -1) {
      const local = result[localIndex];

      result[localIndex] = {
        ...imported,
        items: mergeItems(local.items, imported.items)
      };
    } else {
      result.push({ ...imported });
    }
  }

  return result;
}

function mergeIdentity(local, imported) {
  if (!local) return imported;

  return (
    local.name !== imported.name ||
    local.icon !== imported.icon
  )
    ? { ...imported }
    : local;
}

async function importSystem(payload, mode, replacePreferences) {
  if (mode === IMPORT_MODE.OVERWRITE) {
    await overwriteSystemImport(payload, replacePreferences);
  } else {
    await mergeSystemImport(payload, replacePreferences);
  }
}

function resolveValidDashboardId(candidateId, dashboards) {
  if (dashboards.some(d => d.id === candidateId)) {
    return candidateId;
  }
  return dashboards[0]?.id ?? null;
}

function buildImportChangePlan(payload, mode) {
  return mode === IMPORT_MODE.OVERWRITE
    ? buildOverwriteImportChangePlan(payload)
    : buildMergeImportChangePlan(payload);
}

async function buildPreviewContext(payload, mode) {
  // Load ALL local dashboards into a snapshot map (single request)
  const allDashboards = await DashboardService.loadAllDashboards();
  const localDashboardStates = new Map();

  for (const { id } of availableDashboards) {
    const state = allDashboards[id];
    if (state) {
      localDashboardStates.set(id, structuredClone(state));
    }
  }

  // Build a complete change plan using snapshots
  const plan =
    mode === IMPORT_MODE.OVERWRITE
      ? buildOverwriteImportChangePlan(payload)
      : buildMergeImportChangePlan(payload, localDashboardStates);

  // PREVIEW-ONLY metadata (used for overwrite category descriptions)
  plan.meta = {
    ...plan.meta,
    importedDashboards: structuredClone(payload.dashboards)
  };

  return plan;
}

function indexById(items) {
  return new Map(items.map(item => [item.id, item]));
}

function diffCategories(localCategories = [], importedCategories = []) {
  const localMap = indexById(localCategories);
  const importedMap = indexById(importedCategories);

  const added = [];
  const updated = [];
  const removed = []; // reserved for future explicit deletes

  importedCategories.forEach(cat => {
    const local = localMap.get(cat.id);

    if (!local) {
      added.push({
        id: cat.id,
        name: { before: null, after: cat.title },
        status: 'added',
        items: diffItems([], cat.items)
      });
    } else {
      const items = diffItems(local.items, cat.items);

      if (
        local.title !== cat.title ||
        items.added.length ||
        items.updated.length
      ) {
        updated.push({
          id: cat.id,
          name: { before: local.title, after: cat.title },
          status: 'updated',
          items
        });
      }
    }
  });

  // No removal-by-omission in MERGE
  return { added, updated, removed };
}

function diffItems(localItems = [], importedItems = []) {
  const localMap = indexById(localItems);
  const importedMap = indexById(importedItems);

  const added = [];
  const updated = [];
  const removed = []; // kept for future explicit deletes

  // Added or updated
  importedItems.forEach(item => {
    const local = localMap.get(item.id);

    if (!local) {
      added.push({
        id: item.id,
        name: { before: null, after: item.label },
        url: { before: null, after: item.url },
        status: 'added'
      });
    } else if (
      local.label !== item.label ||
      local.url !== item.url
    ) {
      updated.push({
        id: item.id,
        name: { before: local.label, after: item.label },
        url: { before: local.url, after: item.url },
        status: 'updated'
      });
    }
  });

  // No removal-by-omission in MERGE
  return { added, updated, removed };
}

function buildMergeImportChangePlan(payload, localDashboardStates = new Map()) {
  const localMap = new Map(
    availableDashboards.map(d => [d.id, d])
  );

  const dashboards = {
    added: [],
    updated: [],
    removed: [] // Explicitly kept empty
  };

  // Added + updated dashboards
  payload.dashboards.forEach(imported => {
    const local = localMap.get(imported.id);

    if (!local) {
      dashboards.added.push({
        id: imported.id,
        name: { before: null, after: imported.identity.name },
        status: 'added'
      });
      return;
    }

    const localState = localDashboardStates.get(imported.id);

    dashboards.updated.push({
      id: imported.id,
      name: {
        before: local.name,
        after: imported.identity.name
      },
      status: 'updated',
      categories: localState
        ? diffCategories(
            localState.categories,
            imported.categories
          )
        : {
            added: [],
            updated: [],
            removed: []
          }
    });
  });

  return {
    type: SystemTransitionType.IMPORT_MERGE,
    dashboards,
    meta: payload.meta,
    preferences: payload.preferences
  };
}

function buildOverwriteImportChangePlan(payload) {
  const dashboards = {
    added: [],
    updated: [],
    removed: []
  };

  // Everything local is removed
  availableDashboards.forEach(local => {
    dashboards.removed.push({
      id: local.id,
      name: { before: local.name, after: null },
      status: 'removed'
    });
  });

  // Everything imported is added
  payload.dashboards.forEach(imported => {
    dashboards.added.push({
      id: imported.id,
      name: { before: null, after: imported.identity.name },
      status: 'added'
    });
  });

  return {
    type: SystemTransitionType.IMPORT_OVERWRITE,
    dashboards,
    meta: payload.meta,
    preferences: payload.preferences
  };
}

async function mergeSystemImport(payload, replacePreferences) {
  const importSummary = {
    dashboardsCreated: 0,
    dashboardsMerged: 0,
    preferencesReplaced: false
  };

  const localDashboards = new Map(
    availableDashboards.map(d => [d.id, d])
  );

  // Snapshot all local dashboards once instead of per-dashboard loads
  const allLocalStates = await DashboardService.loadAllDashboards();

  for (const importedRaw of payload.dashboards) {
    const imported = normalizeImportedDashboard(importedRaw);
    if (localDashboards.has(imported.id)) {
      importSummary.dashboardsMerged++;

      const localState = allLocalStates[imported.id] ?? {
        id: imported.id,
        name: imported.name,
        categories: []
      };

      const mergedCategories = mergeCategories(
        localState.categories,
        imported.categories
      );

      const mergedIdentity = mergeIdentity(
        {
          name: localState.identity?.name ?? localState.name,
          icon: localState.identity?.icon ?? null
        },
        imported.identity
      );

      const mergedState = {
        ...localState,
        name: mergedIdentity.name,
        identity: mergedIdentity,
        appearance: imported.appearance ?? localState.appearance ?? null,
        categories: mergedCategories,
        order: imported.order ?? localState.order ?? 0
      };

      await DashboardService.save(mergedState);

    } else {
      importSummary.dashboardsCreated++;

      const importedName = imported.name;
      const hasNameCollision = availableDashboards.some(
        d => d.name.toLowerCase() === importedName.toLowerCase()
      );

      const finalName = hasNameCollision
        ? `${importedName} (imported)`
        : importedName;

      await DashboardService.createDashboard({
        id: imported.id,
        name: finalName
      });

      await DashboardService.save({
        id: imported.id,
        name: finalName,
        identity: imported.identity,
        appearance: imported.appearance,
        categories: structuredClone(imported.categories),
        order: imported.order ?? 0
      });

      availableDashboards.push({ id: imported.id, name: finalName });
    }
  }
    
  // Build system intent from IMPORTED data (NOT local)
  const dashboards = payload.dashboards.map(d => ({
    id: d.id,
    name: d.name ?? d.identity?.name ?? 'Unnamed',
    order: d.order ?? 0
  }));

  // Apply unified system transition
  const importWarnings = await applySystemState({
    type: SystemTransitionType.IMPORT_MERGE,
    dashboards,
    activeDashboardId: payload.meta.activeDashboardId,
    defaultDashboardId: payload.meta.defaultDashboardId,
    preferences: replacePreferences ? payload.preferences : null
  });

  showImportSuccess(importSummary, importWarnings);
}

async function overwriteSystemImport(payload, replacePreferences) {
  // ----------------------------------------
  // Delete ALL existing dashboards
  // ----------------------------------------
  for (const { id } of availableDashboards) {
    await fetch(buildUrl(`/api/dashboards/${id}`), { method: 'DELETE' });
  }

  availableDashboards = [];
  dashboardState = null;
  pageCategories = null;

  // ----------------------------------------
  // Import dashboards fresh from backup (NORMALIZED)
  // ----------------------------------------
  for (const imported of payload.dashboards) {
    const normalized = normalizeImportedDashboard(imported);

    await DashboardService.createDashboard({
      id: normalized.id,
      name: normalized.name
    });

    await DashboardService.save({
      id: normalized.id,
      name: normalized.name,
      identity: normalized.identity,
      appearance: normalized.appearance,
      categories: structuredClone(normalized.categories),
      order: normalized.order
    });

    availableDashboards.push({
      id: normalized.id,
      name: normalized.name
    });
  }

  const importWarnings = await applySystemState({
    type: SystemTransitionType.IMPORT_OVERWRITE,
    dashboards: payload.dashboards.map(d => ({
      id: d.id,
      name: d.identity.name
    })),
    activeDashboardId: payload.meta.activeDashboardId,
    defaultDashboardId: payload.meta.defaultDashboardId,
    preferences: replacePreferences ? payload.preferences : null
  });

  showImportSuccess({
    dashboardsCreated: payload.dashboards.length,
    dashboardsMerged: 0,
    preferencesReplaced: replacePreferences
  }, importWarnings);
}

