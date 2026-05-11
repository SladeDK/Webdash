
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
const THEME_KEY = 'webdash-theme';
const BACKGROUND_KEY = 'webdash-background';
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

// Enumerations / static lists
const BACKGROUNDS = [
  'bg-plain',
  'bg-gradient',
  'bg-focus',
  'bg-glass',
  'bg-dotted',
  'bg-webbed',
  'bg-triangle-gradient',
  'bg-triangle-subtle',
  'bg-hex',
  'bg-topo',
  'bg-circuit',
];

// =====================================================
// Default state & templates
// =====================================================

const DEFAULT_DASHBOARD_STATE = {
  id: null,
  name: "WebDash",
  categories: [
    {
      id: "cat-getting-started",
      title: "Getting Started",
      order: 0,
      visible: true,
      items: [
        {
          id: "btn-docs",
          label: "WebDash Github",
          url: "https://github.com/SladeDK/Webdash",
          order: 0,
          visible: true
        },
        {
          id: "btn-settings",
          label: "Google",
          url: "https://google.com",
          order: 1,
          visible: true
        },
      ]
    }
  ]
};

function getDefaultDashboardTemplate(overrides = {}) {
  const base = structuredClone(DEFAULT_DASHBOARD_STATE);
  return {
    ...base,
    id: overrides.id ?? "default",
    name: overrides.name ?? "WebDash"
  };
}

function createDefaultPreferences() {
  return {
    appearance: {
      theme: 'system',
      background: 'bg-plain',
      identity: {
        name: INITIAL_IDENTITY.name,
        icon: INITIAL_IDENTITY.icon,
        syncWithDashboard: true
      }
    },
    behavior: {
      autoCloseDropdowns: true,
      openLinksInNewTab: true,
      syncDashboardAppearance: true,
    }
  };
}

// =====================================================
// Initialization helpers
// =====================================================

async function initializeDashboardState() {
  const saved = await DashboardService.load();

  if (saved) {
    dashboardState = saved;
    return;
  }

  dashboardState = structuredClone(DEFAULT_DASHBOARD_STATE);
  await DashboardService.save(dashboardState);
}

async function refreshDashboardMetadata() {
  availableDashboards = await DashboardService.listDashboards();
  activeDashboardId = await DashboardService.getActiveDashboardId();
  defaultDashboardId = await DashboardService.getDefaultDashboardId();
}

// =====================================================
// Application bootstrap
// =====================================================

async function initApp() {
  // ----------------------------------
  // Initial dashboard metadata
  // ----------------------------------
  availableDashboards = await DashboardService.listDashboards();
  activeDashboardId = await DashboardService.getActiveDashboardId();
  defaultDashboardId = await DashboardService.getDefaultDashboardId();

  // Ensure default dashboard is valid
  if (
    !defaultDashboardId ||
    !availableDashboards.some(d => d.id === defaultDashboardId)
  ) {
    defaultDashboardId = availableDashboards[0]?.id ?? null;
    if (defaultDashboardId) {
      await DashboardService.setDefaultDashboardId(defaultDashboardId);
    }
  }

  // Ensure active dashboard always resolves
  if (
    !activeDashboardId ||
    !availableDashboards.some(d => d.id === activeDashboardId)
  ) {
    activeDashboardId = defaultDashboardId;
    if (activeDashboardId) {
      await DashboardService.setActiveDashboardId(activeDashboardId);
    }
  }

  // ----------------------------------
  // Ensure dashboard DATA exists
  // ----------------------------------
  await initializeDashboardState();
  pageCategories = dashboardState.categories;

  // Re-fetch metadata AFTER initialization,
  // because initializeDashboardState() can mutate backend state
  availableDashboards = await DashboardService.listDashboards();
  activeDashboardId = await DashboardService.getActiveDashboardId();
  defaultDashboardId = await DashboardService.getDefaultDashboardId();
  lifecyclePhase = LifecyclePhase.DASHBOARDS_LOADED;

  // ----------------------------------
  // Preferences
  // ----------------------------------
  userPreferences = await PreferencesService.load();
  if (!userPreferences) {
    userPreferences = createDefaultPreferences();
    await PreferencesService.save(userPreferences);
  }

  lifecyclePhase = LifecyclePhase.PREFERENCES_LOADED;

  initSyncAppearanceBehavior();
  ensureIdentityDefaults();
  applyIdentityToUI();
  initSyncDashboardIdentityBehavior();
  syncIdentityInputState();
  document.documentElement.classList.add('identity-ready');

  // Apply visual preferences immediately
  setActiveTheme(userPreferences.appearance.theme);
  setActiveBackground(userPreferences.appearance.background);

  applyDashboardAppearance(); // ensures correct startup state

  if (openLinksCheckbox) {
    openLinksCheckbox.checked =
      userPreferences.behavior.openLinksInNewTab !== false;
  }

  autoCloseDropdowns = userPreferences.behavior.autoCloseDropdowns !== false;
  if (autoCloseCheckbox) {
    autoCloseCheckbox.checked = autoCloseDropdowns;
  }

  // ----------------------------------
  // Render
  // ----------------------------------
  assertSystemInvariants('before appReady');
  appReady = true;

  lifecyclePhase = LifecyclePhase.READY;

  document.body.classList.add('categories-initialized');

  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
  renderDashboardList();

  // Final stabilisation pass
  queueMicrotask(() => {
    renderDashboardList();
  });
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
  const rawName = userPreferences.appearance.identity.name || 'Dashboard';
  const name = rawName && rawName.trim() ? rawName.trim() : 'Dashboard';
  if (name.toLowerCase() === 'webdash') {
      document.title = 'WebDash';
    }
  else {
    document.title = `${name} – WebDash`;
  }
}

function applyDashboardAppearance() {
  const syncOn =
    userPreferences?.behavior?.syncDashboardAppearance !== false;

  if (syncOn) {
    // Global appearance
    setActiveTheme(userPreferences.appearance.theme);
    setActiveBackground(userPreferences.appearance.background);
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
  availableDashboards = dashboards.map(d => ({
    id: d.id,
    name: d.name
  }));

  // ---------------------------
  // Apply preferences (if provided)
  // ---------------------------
  if (preferences) {
    userPreferences.appearance = structuredClone(preferences.appearance);
    userPreferences.behavior = structuredClone(preferences.behavior);
    await PreferencesService.save(userPreferences);
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
}

async function syncAppearanceToAllDashboards() {
  if (!dashboardState || !availableDashboards.length) return;

  const currentTheme = userPreferences.appearance.theme;
  const currentBackground = userPreferences.appearance.background;

  const originalActiveId = activeDashboardId;

  for (const { id } of availableDashboards) {
    if (id === originalActiveId) continue;

    await DashboardService.setActiveDashboardId(id);
    const state = await DashboardService.load();
    if (!state) continue;

    state.appearance = {
      theme: currentTheme,
      background: currentBackground
    };

    await DashboardService.save(state);
  }

  // Restore original dashboard
  await DashboardService.setActiveDashboardId(originalActiveId);
}

async function resetDashboard(dashboardId = activeDashboardId) {
  if (!dashboardId) return;

  const template = getDefaultDashboardTemplate({
    id: dashboardId,
    name: dashboardState?.name ?? 'Dashboard'
  });

  dashboardState = template;
  pageCategories = dashboardState.categories;

  await DashboardService.save(dashboardState);

  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
}

async function resetSystem() {
  // Clear user preferences storage
  localStorage.removeItem(USER_PREFS_KEY);

  // Clear all dashboards on backend
  for (const { id } of availableDashboards) {
    await fetch(`/api/dashboards/${id}`, { method: 'DELETE' });
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

function validateSystemImport(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid import file');
  }

  if (payload.schemaVersion !== 2) {
    throw new Error(
      `Unsupported import schema version: ${payload.schemaVersion}`
    );
  }

  if (payload.type !== 'system') {
    throw new Error('Import file is not a system backup');
  }

  if (!Array.isArray(payload.dashboards)) {
    throw new Error('Invalid dashboards array');
  }

  if (!payload.meta ||
      typeof payload.meta.activeDashboardId !== 'string' ||
      typeof payload.meta.defaultDashboardId !== 'string'
  ) {
    throw new Error('Invalid dashboard metadata');
  }

  if (!payload.preferences ||
      !payload.preferences.appearance ||
      !payload.preferences.behavior
  ) {
    throw new Error('Invalid preferences section');
  }
}

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
  // Preserve current active dashboard
  const originalActiveId = activeDashboardId;

  // Load ALL local dashboards into a snapshot map
  const localDashboardStates = new Map();

  for (const { id } of availableDashboards) {
    await DashboardService.setActiveDashboardId(id);
    const state = await DashboardService.load();
    if (state) {
      localDashboardStates.set(id, structuredClone(state));
    }
  }

  // Restore original active dashboard
  if (originalActiveId) {
    await DashboardService.setActiveDashboardId(originalActiveId);
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

  for (const imported of payload.dashboards) {
    if (localDashboards.has(imported.id)) {
      importSummary.dashboardsMerged++;

      await DashboardService.setActiveDashboardId(imported.id);
      const localState = await DashboardService.load();

      const mergedCategories = mergeCategories(
        localState.categories,
        imported.categories
      );

      const mergedIdentity = mergeIdentity(
        { name: localState.name, icon: userPreferences.appearance.identity?.icon },
        imported.identity
      );

      const mergedState = {
        ...localState,
        name: mergedIdentity.name,
        categories: mergedCategories
      };

      await DashboardService.save(mergedState);

    } else {
      importSummary.dashboardsCreated++;

      const importedName = imported.identity.name;
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
        categories: structuredClone(imported.categories)
      });

      availableDashboards.push({ id: imported.id, name: finalName });
    }
  }
    
  // Build system intent
  const dashboards = availableDashboards.map(d => ({
    id: d.id,
    name: d.name
  }));

  // Apply unified system transition
  await applySystemState({
    type: SystemTransitionType.IMPORT_MERGE,
    dashboards,
    activeDashboardId: payload.meta.activeDashboardId,
    defaultDashboardId: payload.meta.defaultDashboardId,
    preferences: replacePreferences ? payload.preferences : null
  });

  showImportSuccess(importSummary);
}

async function overwriteSystemImport(payload, replacePreferences) {
  // ----------------------------------------
  // Delete ALL existing dashboards
  // ----------------------------------------
  for (const { id } of availableDashboards) {
    await fetch(`/api/dashboards/${id}`, { method: 'DELETE' });
  }

  availableDashboards = [];
  dashboardState = null;
  pageCategories = null;

  // ----------------------------------------
  // Import dashboards fresh from backup
  // ----------------------------------------
  for (const imported of payload.dashboards) {
    await DashboardService.createDashboard({
      id: imported.id,
      name: imported.identity.name
    });

    await DashboardService.save({
      id: imported.id,
      name: imported.identity.name,
      categories: structuredClone(imported.categories)
    });

    availableDashboards.push({
      id: imported.id,
      name: imported.identity.name
    });
  }

  await applySystemState({
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
  });
}

