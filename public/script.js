// Keys
const THEME_KEY = 'webdash-theme';
const BACKGROUND_KEY = 'webdash-background';
const USER_PREFS_KEY = 'webdash-user-preferences';
const HAS_SEEDED_DASHBOARD_KEY = "webdash.hasSeededDashboard";
const DASHBOARD_STATE_KEY = 'webdash-dashboard-state';
const AUTO_CLOSE_KEY = 'webdash-dropdown-autoclose';
const autoCloseCheckbox = document.getElementById('pref-dropdown-autoclose');
const syncAppearanceCheckbox = document.getElementById('pref-sync-dashboard-appearance');
const IMPORT_MODE = {
  MERGE: 'merge',
  OVERWRITE: 'overwrite'
};
const SystemTransitionType = Object.freeze({
  IMPORT_OVERWRITE: 'IMPORT_OVERWRITE',
  IMPORT_MERGE: 'IMPORT_MERGE',
  RESET_SYSTEM: 'RESET_SYSTEM'
});
const importSystemOverlay = document.getElementById('import-system-overlay');
const importSystemClose = document.getElementById('import-system-close');
const importSystemCancel = document.getElementById('import-system-cancel');
const importSystemConfirm = document.getElementById('import-system-confirm');
const importPreviewOverlay = document.getElementById('import-preview-overlay');
const importPreviewContent = document.getElementById('import-preview-content');
const importPreviewClose = document.getElementById('import-preview-close');
const importPreviewCancel = document.getElementById('import-preview-cancel');
const importPreviewConfirm = document.getElementById('import-preview-confirm');

// Miscellaneous
let renamingCategoryId = null;
let renamingItemId = null;
let editingButtonContext = null;
let draggedCategoryId = null;
let draggedItemContext = null;
let dashboardState = null;
let pageCategories = null;
let autoCloseDropdowns;
let activeDashboardId = null;
let defaultDashboardId = null;
// [{ id, name}]
let availableDashboards = [];
let pendingDefaultDeletionId = null;
let isCreatingDashboard = false;
let renamingDashboardId = null;
let dashboardValidationError = null;
let appReady = false;
let userPreferences = null;

const DashboardService = {
  async load() {
    const res = await fetch('/api/dashboard');
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  async save(dashboardState) {
    await fetch('/api/dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dashboardState)
    });
  },

  async listDashboards() {
    const res = await fetch('/api/dashboards');
    if (!res.ok) return [];
    return await res.json();
  },

  async getActiveDashboardId() {
    const res = await fetch('/api/dashboards/active');
    if (!res.ok) return null;
    const data = await res.json();
    return data.activeDashboardId;
  },

  async setActiveDashboardId(dashboardId) {
    await fetch('/api/dashboards/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardId })
    });
  },

  async createDashboard({ id, name }) {
    await fetch('/api/dashboards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dashboardId: id,
        dashboardData: {
          name,
          categories: []
        }
      })
    });
  },

  async getDefaultDashboardId() {
    const res = await fetch('/api/dashboards/default');
    if (!res.ok) return null;
    const data = await res.json();
    return data.defaultDashboardId;
  },

  async setDefaultDashboardId(dashboardId) {
    await fetch('/api/dashboards/default', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardId })
    });
  },
};

const PreferencesService = {
  async load() {
    const res = await fetch('/api/preferences');
    return res.ok ? await res.json() : null;
  },

  async save(prefs) {
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs)
    });
  }
};

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


document.addEventListener('submit', e => {
  e.preventDefault();
});

// =====================================================================================
// Default dashboard state (used for resets and as a reference for expected data shape)
// =====================================================================================
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


// ======================================================================
// Dashboard state initialization logic with first-ever load detection
// ======================================================================
async function initializeDashboardState() {
  const saved = await DashboardService.load();

  if (saved) {
    dashboardState = saved;
    return;
  }

  dashboardState = structuredClone(DEFAULT_DASHBOARD_STATE);
  await DashboardService.save(dashboardState);
}

// ====================================================================
// App initialization
// ====================================================================

async function initApp() {
  // ----------------------------------
  // 0️⃣ Initial dashboard metadata
  // ----------------------------------
  availableDashboards = await DashboardService.listDashboards();
  activeDashboardId = await DashboardService.getActiveDashboardId();
  defaultDashboardId = await DashboardService.getDefaultDashboardId();

  // ✅ Ensure default dashboard is valid
  if (
    !defaultDashboardId ||
    !availableDashboards.some(d => d.id === defaultDashboardId)
  ) {
    defaultDashboardId = availableDashboards[0]?.id ?? null;
    if (defaultDashboardId) {
      await DashboardService.setDefaultDashboardId(defaultDashboardId);
    }
  }

  // ✅ Ensure active dashboard always resolves
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
  // 1️⃣ Ensure dashboard DATA exists
  // ----------------------------------
  await initializeDashboardState();
  pageCategories = dashboardState.categories;

  // ✅ CRITICAL FIX:
  // Re-fetch metadata AFTER initialization,
  // because initializeDashboardState() can mutate backend state
  availableDashboards = await DashboardService.listDashboards();
  activeDashboardId = await DashboardService.getActiveDashboardId();
  defaultDashboardId = await DashboardService.getDefaultDashboardId();

  // ----------------------------------
  // 2️⃣ Preferences
  // ----------------------------------
  userPreferences = await PreferencesService.load();
  if (!userPreferences) {
    userPreferences = createDefaultPreferences();
    await PreferencesService.save(userPreferences);
  }

  initSyncAppearanceBehavior();
  ensureIdentityDefaults();
  applyIdentityToUI();
  initSyncDashboardIdentityBehavior();
  syncIdentityInputState();
  document.documentElement.classList.add('identity-ready');

  // Apply visual preferences immediately
  setActiveTheme(userPreferences.appearance.theme);
  setActiveBackground(userPreferences.appearance.background);

  applyDashboardAppearance(); // ✅ ensures correct startup state

  if (openLinksCheckbox) {
    openLinksCheckbox.checked =
      userPreferences.behavior.openLinksInNewTab !== false;
  }

  autoCloseDropdowns = userPreferences.behavior.autoCloseDropdowns !== false;
  if (autoCloseCheckbox) {
    autoCloseCheckbox.checked = autoCloseDropdowns;
  }

  // ----------------------------------
  // 3️⃣ Render
  // ----------------------------------
  appReady = true;

  document.body.classList.add('categories-initialized');

  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
  renderDashboardList();

  // ✅ Final stabilisation pass (harmless but guarantees UI correctness)
  queueMicrotask(() => {
    renderDashboardList();
  });
}

async function refreshDashboardMetadata() {
  availableDashboards = await DashboardService.listDashboards();
  activeDashboardId = await DashboardService.getActiveDashboardId();
  defaultDashboardId = await DashboardService.getDefaultDashboardId();
}

// =====================================================
// System transition helpers (structural foundation)
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
  // 1️⃣ Apply dashboards
  // ---------------------------
  availableDashboards = dashboards.map(d => ({
    id: d.id,
    name: d.name
  }));

  // ---------------------------
  // 2️⃣ Apply preferences (if provided)
  // ---------------------------
  if (preferences) {
    userPreferences.appearance = structuredClone(preferences.appearance);
    userPreferences.behavior = structuredClone(preferences.behavior);
    await PreferencesService.save(userPreferences);
  }

  // ---------------------------
  // 3️⃣ Apply dashboard metadata
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
  // 4️⃣ Reinitialize app
  // ---------------------------
  await initApp();

  // ---------------------------
  // 5️⃣ Sync Preferences UI if open
  // ---------------------------
  if (isPreferencesOpen()) {
    syncDefaultDashboardSelector();
    syncLayoutDashboardSelector();
    renderDashboardManagementPanel();
  }

  // ---------------------------
  // 6️⃣ Transition hook (future)
  // ---------------------------
  // e.g. logSystemTransition(type, ...)
}

// =====================================================
// Modal stack (single source of truth for modal state)
// =====================================================
const modalStack = [];

function pushModal(overlay, onClose) {
  const restoreFocusTo = document.activeElement;

  modalStack.push({
    overlay,
    onClose,
    restoreFocusTo
  });
}

function popModal(overlay) {
  const index = modalStack.findIndex(m => m.overlay === overlay);
  if (index === -1) return;

  const [{ restoreFocusTo }] = modalStack.splice(index, 1);

  // ✅ Restore focus AFTER removal
  requestAnimationFrame(() => {
    if (restoreFocusTo && typeof restoreFocusTo.focus === 'function') {
      restoreFocusTo.focus();
    }
  });
}

function getTopModal() {
  return modalStack[modalStack.length - 1] || null;
}

function focusFirstElement(container) {
  const focusable = container.querySelector(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );

  focusable?.focus();
}

function focusFirstFocusableElement(overlay) {
  const focusableSelectors = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ];

  const focusable = overlay.querySelector(focusableSelectors.join(','));
  if (focusable && typeof focusable.focus === 'function') {
    focusable.focus();
  }
}

// =====================================================
// Toast notification helper
// =====================================================


function ensureToastContainer() {
  let container = document.getElementById('toast-container');

  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');

    // Appends to <body>, making it global and lifecycle-safe
    document.body.appendChild(container);
  }

  return container;
}

function showToast({
  title = '',
  lines = [],
  type = 'success',
  duration = 5000
}) {
  const container = ensureToastContainer();
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'status');

  const content = document.createElement('div');
  content.style.flex = '1';

  if (title) {
    const header = document.createElement('div');
    header.className = 'toast-header';
    header.textContent = title;
    content.appendChild(header);
  }

  if (lines.length) {
    const body = document.createElement('div');
    body.className = 'toast-body';
    body.innerHTML = lines.map(line => `<div>${line}</div>`).join('');
    content.appendChild(body);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.innerHTML = '&times;';
  function dismissToast() {
  toast.classList.add('is-leaving');
  toast.addEventListener(
    'transitionend',
    () => toast.remove(),
    { once: true }
  );
}

closeBtn.onclick = dismissToast;

  toast.append(content, closeBtn);
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(dismissToast, duration);
  }
}

// ======================================================================
// Dashboard switching logic
// ======================================================================

async function switchDashboard(dashboardId) {
  if (dashboardId === activeDashboardId) return;

  await DashboardService.setActiveDashboardId(dashboardId);

  activeDashboardId = dashboardId;

  const newDashboardState = await DashboardService.load();
  if (!newDashboardState) {
    console.warn('[WebDash] Switched dashboard has no data');
    return;
  }

  dashboardState = newDashboardState;
  pageCategories = dashboardState.categories;

  if (userPreferences.appearance.identity.syncWithDashboard) {
    userPreferences.appearance.identity.name = dashboardState.name;
    await PreferencesService.save(userPreferences);
    applyIdentityToUI();
  }
  
  applyDashboardAppearance();

  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
  
  if (isPreferencesOpen()) {
    syncLayoutDashboardSelector();
  }
}

// ======================================================================
// Dashboard creation and switching logic
// ======================================================================

async function createAndSwitchDashboard({ id, name }) {
  const template = getDefaultDashboardTemplate({ id, name });

  await DashboardService.createDashboard({
    id: template.id,
    name: template.name
  });

  // Persist default layout immediately
  dashboardState = template;
  await DashboardService.save(dashboardState);

  availableDashboards.push({ id, name });

  activeDashboardId = id;

  const newDashboardState = await DashboardService.load();
  dashboardState = newDashboardState;
  pageCategories = dashboardState.categories;

  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
  syncDefaultDashboardSelector();
  syncLayoutDashboardSelector();
  renderDashboardList();
  renderDashboardManagementPanel();
}

// ======================================================================
// Dashboard display name helper (uses metadata if available, falls back to ID)
// ======================================================================

function getDashboardDisplayName(dashboardId) {
  if (!dashboardId) return 'WebDash';
  if (dashboardState && dashboardState.id === dashboardId) {
    return dashboardState.name || 'WebDash';
  }
  return dashboardId === 'default' ? 'WebDash' : dashboardId;
}

// ======================================================================
// Dashboard validation helper
// ======================================================================

function setDashboardValidationError(message) {
  dashboardValidationError = message;
  renderDashboardManagementPanel();
}

function clearDashboardValidationError() {
  dashboardValidationError = null;
}

// ======================================================================
// Sync default dashboard selector with available dashboards and current default
// ======================================================================

function syncDefaultDashboardSelector() {
  const select = document.getElementById('default-dashboard-select');
  if (!select) return;

  select.innerHTML = '';

  availableDashboards.forEach(({ id, name }) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    option.selected = id === defaultDashboardId;
    select.appendChild(option);
  });

  select.onchange = async () => {
    const newDefault = select.value;
    if (newDefault === defaultDashboardId) return;

    defaultDashboardId = newDefault;
    await DashboardService.setDefaultDashboardId(newDefault);
  };
}

function syncLayoutDashboardSelector() {
  const select = document.getElementById('layout-dashboard-select');
  if (!select) return;

  select.onchange = null;
  select.innerHTML = '';

  availableDashboards.forEach(({ id, name }) => {
    const option = document.createElement('option');
    option.value = id;

    // ✅ Always trust metadata name first
    option.textContent = name || getDashboardDisplayName(id);
    option.selected = id === activeDashboardId;

    select.appendChild(option);
  });

  select.onchange = async () => {
    const selectedId = select.value;
    if (selectedId === activeDashboardId) return;

    await switchDashboard(selectedId);

    if (isPreferencesOpen()) {
      syncLayoutDashboardSelector();
    }
  };
}

// ============================
// Page‑scoped storage helpers
// ============================

const INITIAL_IDENTITY = (() => {
  const name =
    document.querySelector('.header-center h1')?.textContent?.trim()
    || 'Dashboard';

  const icon =
    document.querySelector('.header-center img')?.getAttribute('src')
    || null;

  return { name, icon };
})();

// ============================
// Dropdown menu logic (with optional auto-close behavior)
// ============================

document.querySelectorAll('.dropdown').forEach(dropdown => {
  const button = dropdown.querySelector('.dropdown-btn');
  const menu = dropdown.querySelector('.dropdown-menu');

function openMenu() {
  closeAll();
  menu.classList.add('open');
  menu.setAttribute('aria-hidden', 'false');
  button.setAttribute('aria-expanded', 'true');
}

function closeMenu() {
  menu.classList.remove('open');
  menu.setAttribute('aria-hidden', 'true');
  button.setAttribute('aria-expanded', 'false');
}

  button.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = menu.classList.contains('open');
    isOpen ? closeMenu() : openMenu();
  });

  // Keyboard activation
  button.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      button.click();
    }
  });
});

// =====================================================
// Preferences → Behavior (Dropdown auto-close)
// =====================================================

autoCloseCheckbox.addEventListener('change', () => {
  autoCloseDropdowns = autoCloseCheckbox.checked;

  userPreferences.behavior.autoCloseDropdowns = autoCloseDropdowns;
  PreferencesService.save(userPreferences);
});

// =====================================================
// Preferences → Behavior (Sync dashboard appearance)
// =====================================================

function initSyncAppearanceBehavior() {
  const checkbox =
    document.getElementById('pref-sync-dashboard-appearance');

  if (!checkbox || !userPreferences) return;

  // ✅ Default ON unless explicitly disabled
  checkbox.checked =
    userPreferences.behavior.syncDashboardAppearance !== false;

  // ✅ Prevent duplicate listeners
  if (checkbox._wired) return;
  checkbox._wired = true;

  checkbox.addEventListener('change', async () => {
    const enabled = checkbox.checked;

    userPreferences.behavior.syncDashboardAppearance = enabled;
    await PreferencesService.save(userPreferences);

    // ✅ Only propagate when turning ON
    if (enabled) {
      await syncAppearanceToAllDashboards();
    }
  });
}

// =====================================================
// Preferences → Behavior (Sync dashboard identity)
// =====================================================

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
      // ✅ Force identity to match current dashboard
      userPreferences.appearance.identity.name =
        dashboardState?.name ?? 'Dashboard';
    }

    await PreferencesService.save(userPreferences);
    applyIdentityToUI();
    syncIdentityInputState();
  });
}

function syncIdentityInputState() {
  const input = document.querySelector('.identity-name-input');
  if (!input) return;

  const synced =
    userPreferences.appearance.identity.syncWithDashboard !== false;

  if (synced) {
    input.readOnly = true;
    input.tabIndex = -1;   // ✅ cannot be focused
    input.blur();          // ✅ drop focus immediately
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

document.addEventListener('click', (e) => {
  if (!autoCloseDropdowns) return;
  closeAll();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeAll();
  }
});

function closeAll() {
  document.querySelectorAll('.dropdown').forEach(dropdown => {
    const menu = dropdown.querySelector('.dropdown-menu');
    const button = dropdown.querySelector('.dropdown-btn');

    menu.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
  });
}

document.querySelectorAll('.dropdown-close').forEach(btn => {
  btn.addEventListener('click', closeAll);
});

const themeButtons = document.querySelectorAll('[data-theme]');

// =====================================
// Phase 1: Preference Snapshot (read-only)
// =====================================

const preferenceSnapshot = {
  appearance: {
    theme: localStorage.getItem('webdash-theme') || 'system',
    background: localStorage.getItem('webdash-background') || 'bg-plain'
  },
  behavior: {
    autoCloseDropdowns:
      localStorage.getItem('webdash-dropdown-autoclose') !== 'false'
  },
  page: {
    categories: (() => {
      try {
        return JSON.parse(
          localStorage.getItem('webdash-category-visibility') || '{}'
        );
      } catch {
        return {};
      }
    })()
  }
};

// =====================================
// Cookie helper utilities
// =====================================

function setCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie =
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ` +
    `expires=${expires}; path=/; domain=.webdash.dk; SameSite=Lax`;
}

function getCookie(name) {
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + encodeURIComponent(name) + '=([^;]*)')
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name) {
  document.cookie =
    `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; ` +
    `path=/; domain=.webdash.dk`;
}

const SHARED_PREFS_COOKIE = 'webdash_shared_prefs';

function extractSharedPreferences(prefs) {
  return {
    appearance: {
      theme: prefs.appearance.theme,
      background: prefs.appearance.background
    },
    behavior: { ...prefs.behavior }
  };
}

function applySharedPreferences(targetPrefs, sharedPrefs) {
  if (!sharedPrefs) return;

  if (sharedPrefs.appearance) {
    targetPrefs.appearance.theme =
      sharedPrefs.appearance.theme ?? targetPrefs.appearance.theme;

    targetPrefs.appearance.background =
      sharedPrefs.appearance.background ?? targetPrefs.appearance.background;
  }

  if (sharedPrefs.behavior) {
    targetPrefs.behavior = { ...sharedPrefs.behavior };
  }
}

// ============================
// User‑centric preferences
// (shared across all WebDash pages)
// ============================

// Phase 2A: Unified user preferences
function loadUnifiedPreferences() {
  const existing = localStorage.getItem(USER_PREFS_KEY);
  let prefs = null;

  if (existing) {
    try {
      const parsed = JSON.parse(existing);

      parsed.appearance ||= {};
      parsed.behavior ||= {};

      if (!('identity' in parsed.appearance)) {
        parsed.appearance.identity = null;
      }

      prefs = parsed;
    } catch {
      prefs = null;
    }
  }

  if (!prefs) {
    prefs = {
      appearance: {
        theme: localStorage.getItem('webdash-theme') || 'system',
        background: localStorage.getItem('webdash-background') || 'bg-plain',
        identity: null
      },
      behavior: {
        autoCloseDropdowns:
          localStorage.getItem('webdash-dropdown-autoclose') !== 'false',
        openLinksInNewTab:
          localStorage.getItem('webdash-open-links-new-tab') !== 'false'
      }
    };

    localStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs));
    console.info('[WebDash] Migrated user preferences:', prefs);
  }

  // ✅ Override shared preferences from cookie
  const sharedRaw = getCookie('webdash_shared_prefs');
  if (sharedRaw) {
    try {
      const sharedPrefs = JSON.parse(sharedRaw);

      if (sharedPrefs.appearance) {
        prefs.appearance.theme =
          sharedPrefs.appearance.theme ?? prefs.appearance.theme;

        prefs.appearance.background =
          sharedPrefs.appearance.background ?? prefs.appearance.background;
      }

      if (sharedPrefs.behavior) {
        prefs.behavior = { ...prefs.behavior, ...sharedPrefs.behavior };
      }
    } catch {
      // Ignore invalid cookie
    }
  }

  return prefs;
}

function saveUnifiedPreferences(prefs) {
  // Save full prefs locally (dashboard‑specific data included)
  localStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs));

  // Extract and save shared prefs to cookie (cross‑subdomain)
  const sharedPrefs = {
    appearance: {
      theme: prefs.appearance.theme,
      background: prefs.appearance.background
    },
    behavior: { ...prefs.behavior }
  };

  setCookie('webdash_shared_prefs', JSON.stringify(sharedPrefs));
}

// ============================
// Identity helpers
// ============================

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

const identityNameInput =
  document.querySelector('.identity-name-input');

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

const identityIconWrapper = document.querySelector('.identity-icon-wrapper');
const identityIconInput = document.getElementById('identity-icon-input');

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

const identityResetBtn =
  document.querySelector('.identity-reset-btn');

if (identityResetBtn) {
  identityResetBtn.addEventListener('click', () => {
    resetIdentity();
  });
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
// =====================================================
// Data Management — Export file name helper
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


// =====================================================
// Data Management — Export system backup (Schema v2)
// =====================================================

/*
=====================================================
SYSTEM IMPORT / EXPORT CONTRACT (Schema v2)
-----------------------------------------------------
- Export represents a FULL system snapshot
- Dashboards are merged by ID on import
- Categories and buttons are replaced by ID, merged otherwise
- Missing items are preserved
- Preferences may be overwritten (user opt-in)
- Import must NOT bypass invariants
- initApp() MUST be called after import
=====================================================
*/

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

const exportDashboardBtn = document.getElementById('export-dashboard-btn');

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

      /* ✅ REPLACED CODE (complete) */
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

function mergeItems(localItems = [], importedItems = []) {
  const localById = new Map(localItems.map(item => [item.id, item]));
  const usedLocalIds = new Set();

  // First, take all imported items (authoritative)
  const merged = importedItems.map(imported => {
    if (localById.has(imported.id)) {
      usedLocalIds.add(imported.id);
    }
    return { ...imported };
  });

  // Then append local-only items
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

// =====================================================
// Data Management — Import system backup (Schema v2)
// =====================================================
const importDashboardBtn = document.getElementById('import-dashboard-btn');
const importDashboardFile = document.getElementById('import-dashboard-file');

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

      /* ✅ REPLACED CODE (complete) */
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

// --------------------------------------------------
// Import System Modal helpers
// --------------------------------------------------
function openImportSystemModal(payload) {
  const overlay = document.getElementById('import-system-overlay');
  if (!overlay) {
    console.error('[WebDash] Import system overlay not found');
    return;
  }

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  
  // ✅ Sync preference checkbox with current mode
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

    // ✅ Build preview context FIRST
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

importPreviewClose?.addEventListener('click', closeImportPreviewModal);
importPreviewCancel?.addEventListener('click', closeImportPreviewModal);

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

// =====================================================
// Preview builder (async, isolated from UI state)
// =====================================================
async function buildPreviewContext(payload, mode) {
  // 1️⃣ Preserve current active dashboard
  const originalActiveId = activeDashboardId;

  // 2️⃣ Load ALL local dashboards into a snapshot map
  const localDashboardStates = new Map();

  for (const { id } of availableDashboards) {
    await DashboardService.setActiveDashboardId(id);
    const state = await DashboardService.load();
    if (state) {
      localDashboardStates.set(id, structuredClone(state));
    }
  }

  // 3️⃣ Restore original active dashboard
  if (originalActiveId) {
    await DashboardService.setActiveDashboardId(originalActiveId);
  }

  // 4️⃣ Build a complete change plan using snapshots
  const plan =
    mode === IMPORT_MODE.OVERWRITE
      ? buildOverwriteImportChangePlan(payload)
      : buildMergeImportChangePlan(payload, localDashboardStates);

  // ✅ PREVIEW-ONLY metadata (used for overwrite category descriptions)
  plan.meta = {
    ...plan.meta,
    importedDashboards: structuredClone(payload.dashboards)
  };

  return plan;
}

// =====================================================
// Change-plan helpers (PURE)
// =====================================================

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

  // ❌ NO removal-by-omission in MERGE
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

  // ❌ NO removal-by-omission in MERGE
  return { added, updated, removed };
}

function buildMergeImportChangePlan(payload, localDashboardStates = new Map()) {
  const localMap = new Map(
    availableDashboards.map(d => [d.id, d])
  );

  const dashboards = {
    added: [],
    updated: [],
    removed: [] // ✅ explicitly kept empty
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

function buildImportChangePlan(payload, mode) {
  return mode === IMPORT_MODE.OVERWRITE
    ? buildOverwriteImportChangePlan(payload)
    : buildMergeImportChangePlan(payload);
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
    
  // ✅ Build system intent
  const dashboards = availableDashboards.map(d => ({
    id: d.id,
    name: d.name
  }));

  // ✅ Apply unified system transition
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
  // 1️⃣ Delete ALL existing dashboards
  // ----------------------------------------
  for (const { id } of availableDashboards) {
    await fetch(`/api/dashboards/${id}`, { method: 'DELETE' });
  }

  availableDashboards = [];
  dashboardState = null;
  pageCategories = null;

  // ----------------------------------------
  // 2️⃣ Import dashboards fresh from backup
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

function syncImportPreferenceState(overlay) {
  const overwriteRadio = overlay.querySelector('input[name="import-mode"][value="overwrite"]');
  const replacePrefsCheckbox = overlay.querySelector('#import-replace-preferences');

  const optionWrapper = replacePrefsCheckbox?.closest('.import-option');

  if (!overwriteRadio || !replacePrefsCheckbox) return;

  if (overwriteRadio.checked) {
    // ✅ Force preferences replacement
    replacePrefsCheckbox.checked = true;
    replacePrefsCheckbox.disabled = true;
    optionWrapper?.classList.add('import-option--disabled');
  } 
  else {
    // ✅ Restore user control
    replacePrefsCheckbox.disabled = false;
    optionWrapper?.classList.remove('import-option--disabled');
  }
}

// ========================================================================
// Wire "Reset dashboard" button (complete reset of preferences + layout)
// ========================================================================

const resetDashboardBtn =
  document.getElementById('reset-dashboard-btn');

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
// Preferences → Behavior (Open links in new tab)
// =====================================================

function syncBehaviorUI() {
  const autoCloseCheckbox =
    document.getElementById('pref-dropdown-autoclose');
  const openLinksCheckbox =
    document.getElementById('pref-open-links-new-tab');

  if (autoCloseCheckbox) {
    autoCloseCheckbox.checked =
      userPreferences.behavior.autoCloseDropdowns !== false;
  }

  if (openLinksCheckbox) {
    openLinksCheckbox.checked =
      userPreferences.behavior.openLinksInNewTab !== false;
  }
}

const openLinksCheckbox = document.getElementById('pref-open-links-new-tab');

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

// ==========================================================
// Preferences → Data Management (Complete dashboard reset)
// ==========================================================

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
  // 1️⃣ Clear user preferences storage
  localStorage.removeItem(USER_PREFS_KEY);

  // 2️⃣ Clear all dashboards on backend
  for (const { id } of availableDashboards) {
    await fetch(`/api/dashboards/${id}`, { method: 'DELETE' });
  }

  // 3️⃣ Reset in-memory dashboard metadata
  availableDashboards = [];

  // 4️⃣ Create one fresh default dashboard
  const id = `dashboard-${Date.now()}`;
  const template = getDefaultDashboardTemplate({ id });

  await DashboardService.createDashboard({
    id: template.id,
    name: template.name
  });

  await DashboardService.save(template);

  // ✅ STEP 4.2 – system state description
  const dashboards = [
    {
      id: template.id,
      name: template.name
    }
  ];

  // ✅ STEP 4.4 – apply system transition
  await applySystemState({
    type: SystemTransitionType.RESET_SYSTEM,
    dashboards,
    activeDashboardId: template.id,
    defaultDashboardId: template.id,
    preferences: createDefaultPreferences()
  });
}

// =====================================================
// Preferences → Appearance (Theme selection)
// =====================================================

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

  themeButtons.forEach(btn => {
    btn.classList.toggle(
      'active-theme',
      btn.dataset.theme === theme
    );
  });

  requestAnimationFrame(() => {
    document.documentElement.classList.remove('theme-switching');
  });
}

themeButtons.forEach(button => {
  button.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    changeTheme(button.dataset.theme);
    closeAll();
  });
});

// =====================================
// Apply unified user preferences on load
// =====================================

window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    const savedTheme = localStorage.getItem(THEME_KEY);

    if (savedTheme === 'system') {
      setActiveTheme('system');
    }
  });

// =====================================
// Background system
// =====================================

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

document.documentElement.classList.add('bg-visible');

// =====================================
// Render categories
// =====================================

function renderCategories(categories) {
  if (!appReady) return;
  const container = document.querySelector('.categories');
  if (!container) return;

  container.innerHTML = '';

  categories
    .filter(category => category.visible !== false)
    .sort((a, b) => a.order - b.order)
    .forEach(category => {
      const categoryEl = document.createElement('section');
      categoryEl.className = 'category';
      categoryEl.dataset.categoryId = category.id;

      categoryEl.innerHTML = `
        <h2 class="category-title">${category.title}</h2>
        <div class="buttons"></div>
      `;

      const buttonsEl = categoryEl.querySelector('.buttons');

      category.items.forEach(item => {
        const link = document.createElement('a');
        link.href = item.url;
        link.textContent = item.label;
        link.dataset.itemId = item.id;
        if (userPreferences.behavior.openLinksInNewTab) {
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        } else {
          link.removeAttribute('target');
          link.removeAttribute('rel');
        }
        buttonsEl.appendChild(link);
      });

      container.appendChild(categoryEl);
    });
}

// ====================================
// Render dashboard list in DashboardSwitcher dropdown
// ===================================

function renderDashboardList() {
  if (!appReady) return;
  const container = document.getElementById('dashboard-list');
  if (!container) return;

  container.innerHTML = '';

  availableDashboards.forEach(({ id, name }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dashboard-item';
    btn.textContent = name;

    if (id === activeDashboardId) {
      btn.classList.add('active-dashboard');
    }

    btn.addEventListener('click', async () => {
      await switchDashboard(id);
      renderDashboardList();
      closeAll();
    });

    container.appendChild(btn);
  });
}

// =====================================
// Render dashboard management panel (rename/delete dashboards)
// ====================================

function renderDashboardManagementPanel() {
  const container = document.getElementById('dashboard-management-list');
  if (!container) return;

  container.innerHTML = '';

  // ✅ Inline validation error (if any)
  if (dashboardValidationError) {
    const error = document.createElement('div');
    error.className = 'form-error is-visible';
    error.textContent = dashboardValidationError;
    error.style.marginBottom = '0.75rem';
    container.appendChild(error);
  }

  availableDashboards.forEach(({ id, name }) =>{
    const row = document.createElement('div');
    row.className = 'layout-category';

    const header = document.createElement('div');
    header.className = 'layout-category-header';

    let title;

    if (renamingDashboardId === id) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'rename-input';
      input.value = name;

      const wrapper = document.createElement('div');
      wrapper.className = 'rename-wrapper';

      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });

      const save = async () => {
        const newName = input.value.trim();
        if (!newName) return;
        renamingDashboardId = null;
        await renameDashboardDisplayName(id, newName);
      };

      const cancel = () => {
        renamingDashboardId = null;
        renderDashboardManagementPanel();
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          save();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        }
      });

      // ✅ NO blur auto-cancel anymore

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'icon-button confirm';
      saveBtn.title = 'Save';
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
      saveBtn.onclick = save;

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'icon-button cancel';
      cancelBtn.title = 'Cancel';
      cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      cancelBtn.onclick = cancel;

      wrapper.append(input, saveBtn, cancelBtn);
      title = wrapper;
    } else {
        const span = document.createElement('span');
        span.className = 'category-title';
        span.textContent = name;
        title = span;
      }

    const actions = document.createElement('div');
    actions.className = 'category-actions';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'icon-button';
    renameBtn.title = 'Rename dashboard';
    renameBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';

    renameBtn.onclick = () => {
      renamingDashboardId = id;
      renderDashboardManagementPanel();
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'icon-button';
    deleteBtn.title = 'Delete dashboard';
    deleteBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';

    deleteBtn.onclick = () => {
      clearDashboardValidationError();

      openConfirm({
        title: 'Delete dashboard',
        message: `Delete dashboard "${name}"?\nThis will remove the dashboard and all its categories and buttons.`,
        onConfirm: async () => {
          await deleteDashboard(id);
          clearDashboardValidationError();
        }
      });
    };

    actions.append(renameBtn, deleteBtn);
    header.append(title, actions);
    row.appendChild(header);
    container.appendChild(row);
  });
  
  // ✅ Inline creation row
  if (isCreatingDashboard) {
    const row = document.createElement('div');
    row.className = 'layout-category';

    const header = document.createElement('div');
    header.className = 'layout-category-header';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.placeholder = 'New dashboard name';

    input.addEventListener('input', () => {
      if (dashboardValidationError) {
        clearDashboardValidationError();
      }
    });

    requestAnimationFrame(() => input.focus());

    input.onkeydown = async (e) => {
      if (e.key === 'Enter') {
        clearDashboardValidationError();

        const displayName = input.value.trim();
        if (!displayName) return;

        // ✅ Category-style opaque ID
        const id = `dashboard-${Date.now()}`;

        isCreatingDashboard = false;
        await createAndSwitchDashboard({ id, name: displayName });

        clearDashboardValidationError();
      }

      if (e.key === 'Escape') {
        isCreatingDashboard = false;
        clearDashboardValidationError();
        renderDashboardManagementPanel();
      }
    };

    input.onblur = () => {
      isCreatingDashboard = false;
      renderDashboardManagementPanel();
    };

    header.appendChild(input);
    row.appendChild(header);
    container.appendChild(row);
  }
}


document
  .getElementById('create-dashboard-btn')
  ?.addEventListener('click', () => {
    isCreatingDashboard = true;
    renderDashboardManagementPanel();
});

async function renameDashboardDisplayName(dashboardId, newName) {
  const trimmed = newName.trim();
  if (!trimmed) {
    renamingDashboardId = null;

    syncDefaultDashboardSelector();
    syncLayoutDashboardSelector();
    clearDashboardValidationError();
    renderDashboardManagementPanel();
    return;
  }

  const res = await fetch(`/api/dashboards/${dashboardId}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: trimmed })
  });

  if (!res.ok) {
    setDashboardValidationError('Failed to rename dashboard', await res.text());
    renamingDashboardId = null;
    renderDashboardManagementPanel();
    return;
  }

  clearDashboardValidationError();

  // ✅ Update in-memory dashboard metadata
  const dashboard = availableDashboards.find(d => d.id === dashboardId);
  if (dashboard) {
    dashboard.name = trimmed;
  }

  // ✅ Keep active dashboard state in sync
  if (dashboardState && dashboardState.id === dashboardId) {
    dashboardState.name = trimmed;
  }

  // ✅ Sync identity name if enabled AND this is the active dashboard
  if (
    dashboardState &&
    dashboardState.id === dashboardId &&
    userPreferences.appearance.identity.syncWithDashboard
  ) {
    userPreferences.appearance.identity.name = trimmed;
    await PreferencesService.save(userPreferences);
    applyIdentityToUI();
  }

  renamingDashboardId = null;

  syncDefaultDashboardSelector();
  syncLayoutDashboardSelector();
  renderDashboardManagementPanel();
  renderDashboardList();
}

async function deleteDashboard(dashboardId, autoSwitch = true) {
  // --------------------------------------------------
  // Rule 1: Must always have at least one dashboard
  // --------------------------------------------------
  if (availableDashboards.length <= 1) {
    setDashboardValidationError('You must have at least one dashboard.');
    return;
  }

  const isDefault = dashboardId === defaultDashboardId;
  const remainingDashboards =
    availableDashboards.filter(d => d.id !== dashboardId);

  if (isDefault && remainingDashboards.length > 1) {
    pendingDefaultDeletionId = dashboardId;
    openDeleteDefaultDashboardModal(dashboardId);
    return;
  }

  // --------------------------------------------------
  // Perform backend delete
  // --------------------------------------------------
  const res = await fetch(`/api/dashboards/${dashboardId}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    console.error('[WebDash] Failed to delete dashboard', dashboardId);
    return;
  }

  // --------------------------------------------------
  // Update local dashboard metadata
  // --------------------------------------------------
  availableDashboards = remainingDashboards;

  // --------------------------------------------------
  // If default was deleted and one dashboard remains
  // --------------------------------------------------
  if (isDefault && remainingDashboards.length === 1) {
    defaultDashboardId = remainingDashboards[0].id;
    await DashboardService.setDefaultDashboardId(defaultDashboardId);
  }

  // --------------------------------------------------
  // If active dashboard was deleted → fallback to default
  // --------------------------------------------------
  if (dashboardId === activeDashboardId) {
    activeDashboardId = defaultDashboardId;
    await DashboardService.setActiveDashboardId(activeDashboardId);

    const newDashboardState = await DashboardService.load();
    dashboardState = newDashboardState;
    pageCategories = dashboardState.categories;

    renderCategories(pageCategories);
    renderLayoutEditor(pageCategories);
  }

  // --------------------------------------------------
  // Final UI sync
  // --------------------------------------------------
  syncDefaultDashboardSelector();
  syncLayoutDashboardSelector();
  renderDashboardManagementPanel();
  renderDashboardList();
}

// =====================================
// Dashboard Layout editor rendering
// =====================================

function renderLayoutEditor(categories) {
  if (!appReady) return;
  const container = document.getElementById('layout-categories');
  if (!container) return;

  container.innerHTML = '';

  categories
    .sort((a, b) => a.order - b.order)
    .forEach(category => {
      const categoryRow = document.createElement('div');
      categoryRow.className = 'layout-category';
      categoryRow.dataset.categoryId = category.id;

      categoryRow.innerHTML = `
        <div class="layout-category-header">
          <span class="drag-handle" title="Reorder">☰</span>

          <div class="category-title-slot"></div>

          <div class="category-actions">
            <button
              type="button"
              class="icon-button visibility-btn ${category.visible === false ? 'is-hidden' : ''}"
              aria-label="Toggle visibility"
              title="Toggle visibility"
              data-category-id="${category.id}"
            >
              ${category.visible === false
                ? '<i class="fa-solid fa-eye-slash"></i>'
                : '<i class="fa-solid fa-eye"></i>'}
            </button>

            <button
              type="button"
              class="icon-button rename-category-btn"
              title="Rename category"
              data-category-id="${category.id}"
            >
              <i class="fa-solid fa-pen-to-square"></i>
            </button>

            <button
              type="button"
              class="icon-button delete-category-btn"
              title="Delete category"
              data-category-id="${category.id}"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <div class="layout-category-items">
          ${category.items.map(item => `
            <div class="layout-item" data-item-id="${item.id}">
              <span class="drag-handle" title="Reorder">☰</span>

              ${renamingItemId === item.id
                ? `
                  <input
                    class="rename-input rename-item-input"
                    type="text"
                    data-item-id="${item.id}"
                    value="${item.label}"
                  />
                `
                : `
                  <span class="item-label">${item.label}</span>
                `
              }

              <div class="item-actions">
                <button type="button" class="icon-button rename-item-btn" data-item-id="${item.id}">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button type="button" class="icon-button delete-item-btn" data-item-id="${item.id}">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>
          `).join('')}

          <button
            type="button"
            class="layout-action-btn add-item-btn"
            data-category-id="${category.id}"
          >
            <span class="action-icon"><i class="fa-solid fa-plus"></i></span>
            <span>Add button</span>
          </button>
        </div>
      `;

      // ✅ CATEGORY RENAME SLOT (SAFE REPLACEMENT)
      const titleSlot = categoryRow.querySelector('.category-title-slot');

      if (renamingCategoryId === category.id) {
        const wrapper = document.createElement('div');
        wrapper.className = 'rename-wrapper';

        const input = document.createElement('input');
        input.className = 'rename-input';
        input.type = 'text';
        input.value = category.title;

        requestAnimationFrame(() => {
          input.focus();
          input.select();
        });

        const save = () => {
          const trimmed = input.value.trim();
          if (!trimmed) return;
          renameCategory(category.id, trimmed);
          renamingCategoryId = null;
          renderLayoutEditor(pageCategories);
        };

        const cancel = () => {
          renamingCategoryId = null;
          renderLayoutEditor(pageCategories);
        };

        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            save();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancel();
          }
        });

        const saveBtn = document.createElement('button');
        saveBtn.className = 'icon-button confirm';
        saveBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
        saveBtn.onclick = save;

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'icon-button cancel';
        cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        cancelBtn.onclick = cancel;

        wrapper.append(input, saveBtn, cancelBtn);
        titleSlot.appendChild(wrapper);
      } else {
        const span = document.createElement('span');
        span.className = 'category-title';
        span.textContent = category.title;
        titleSlot.appendChild(span);
      }

      container.appendChild(categoryRow);
    });
  // ✅ Add Category button wiring
  const addCategoryButton = document.getElementById('add-category-btn');
  if (addCategoryButton) {
    addCategoryButton.onclick = () => {
      addCategory();
    };
  }
  // Wire visibility toggles (Phase C.2)
  container.querySelectorAll('.visibility-btn').forEach(button => {
    button.onclick = () => {
      const categoryId = button.dataset.categoryId;
      toggleCategoryVisibility(categoryId);
    };
  });
  // Wire rename category button
  container.querySelectorAll('.rename-category-btn').forEach(button => {
    button.onclick = () => {
      renamingCategoryId = button.dataset.categoryId;
      renderLayoutEditor(pageCategories);
    };
  });
  // Wire delete category buttons (Phase C.4)
  container.querySelectorAll('.delete-category-btn').forEach(button => {
    button.onclick = () => {
      const categoryId = button.dataset.categoryId;
      deleteCategory(categoryId);
    };
  });
  // Wire rename item inputs (Phase D.2)
  container.querySelectorAll('.rename-item-btn').forEach(button => {
    button.onclick = () => {
      const itemId = button.dataset.itemId;

      for (const category of pageCategories) {
        const item = category.items.find(i => i.id === itemId);
        if (item) {
          openButtonEditor({
            mode: 'edit',
            categoryId: category.id,
            itemId
          });
          break;
        }
      }
    };
  });
  // Wire edit button to open button editor modal
  container.querySelectorAll('.add-item-btn').forEach(button => {
    button.onclick = () => {
      openButtonEditor({
        mode: 'create',
        categoryId: button.dataset.categoryId
      });
    };
  });
  // Wire delete button actions (Phase D.3)
  container.querySelectorAll('.delete-item-btn').forEach(button => {
    button.onclick = () => {
      const itemId = button.dataset.itemId;
      deleteButton(itemId);
    };
  });
  // Wire drag handles (Phase E.1)
  // Scope to category-level handles only (first .drag-handle child of .layout-category-header)
  // to avoid item-level handles incorrectly setting draggedCategoryId.
  container.querySelectorAll('.layout-category-header > .drag-handle').forEach(handle => {
    const categoryEl = handle.closest('.layout-category');
    if (!categoryEl) return;

    handle.draggable = true;

    handle.addEventListener('dragstart', e => {
      e.stopPropagation();

      draggedCategoryId = categoryEl.dataset.categoryId;
      categoryEl.classList.add('is-dragging');

      e.dataTransfer.effectAllowed = 'move';
      // Required for Firefox
      e.dataTransfer.setData('text/plain', draggedCategoryId);
    });

    handle.addEventListener('dragend', () => {
      draggedCategoryId = null;
      categoryEl.classList.remove('is-dragging');

      // Clear all drop-target highlights
      container.querySelectorAll('.layout-category.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
    });
  });

  // Auto-scroll state for drag
  // The HTML5 DnD API doesn't scroll automatically, so we run a rAF loop
  // that nudges the scrollable modal panel when the pointer is near an edge.
  const SCROLL_ZONE  = 60;  // px from edge that triggers scrolling
  const SCROLL_SPEED = 10;  // px per frame at full speed

  // The scrollable container is .modal-content (overflow-y: auto)
  const scrollContainer = container.closest('.modal-content');

  let scrollRAF = null;
  let scrollVelocity = 0; // negative = up, positive = down

  function startScrollLoop() {
    if (scrollRAF) return; // already running
    function tick() {
      if (scrollVelocity === 0 || !scrollContainer) {
        scrollRAF = null;
        return;
      }
      scrollContainer.scrollTop += scrollVelocity;
      scrollRAF = requestAnimationFrame(tick);
    }
    scrollRAF = requestAnimationFrame(tick);
  }

  function stopScrollLoop() {
    if (scrollRAF) {
      cancelAnimationFrame(scrollRAF);
      scrollRAF = null;
    }
    scrollVelocity = 0;
  }

  // Wire drop handling (Phase E.1)
  // Use a named function reference so we can remove and re-add it on each
  // renderLayoutEditor() call — prevents duplicate listener accumulation.
  if (container._dragoverHandler) {
    container.removeEventListener('dragover', container._dragoverHandler);
  }
  if (container._dropHandler) {
    container.removeEventListener('drop', container._dropHandler);
  }
  if (container._dragleaveHandler) {
    container.removeEventListener('dragleave', container._dragleaveHandler);
  }

  container._dragoverHandler = e => {
    if (!draggedCategoryId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const targetCategory = e.target.closest('.layout-category');

    // Update drag-over highlight
    container.querySelectorAll('.layout-category.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });

    if (targetCategory && targetCategory.dataset.categoryId !== draggedCategoryId) {
      targetCategory.classList.add('drag-over');
    }

    // Auto-scroll: measure pointer position relative to the scroll container
    if (scrollContainer) {
      const rect = scrollContainer.getBoundingClientRect();
      const distFromTop    = e.clientY - rect.top;
      const distFromBottom = rect.bottom - e.clientY;

      if (distFromTop < SCROLL_ZONE) {
        // Pointer near top — scroll up; faster the closer to the edge
        scrollVelocity = -SCROLL_SPEED * (1 - distFromTop / SCROLL_ZONE);
        startScrollLoop();
      } else if (distFromBottom < SCROLL_ZONE) {
        // Pointer near bottom — scroll down
        scrollVelocity = SCROLL_SPEED * (1 - distFromBottom / SCROLL_ZONE);
        startScrollLoop();
      } else {
        stopScrollLoop();
      }
    }
  };

  container._dropHandler = e => {
    e.preventDefault();
    stopScrollLoop();
    if (!draggedCategoryId) return;

    // Clear highlights
    container.querySelectorAll('.layout-category.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });

    const targetCategory = e.target.closest('.layout-category');
    if (!targetCategory) return;

    const targetId = targetCategory.dataset.categoryId;
    if (!targetId || targetId === draggedCategoryId) return;

    reorderCategories(draggedCategoryId, targetId);
  };

  container._dragleaveHandler = e => {
    // Only clear highlight when leaving the container entirely
    if (!container.contains(e.relatedTarget)) {
      container.querySelectorAll('.layout-category.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
      stopScrollLoop();
    }
  };

  container.addEventListener('dragover', container._dragoverHandler);
  container.addEventListener('drop', container._dropHandler);
  container.addEventListener('dragleave', container._dragleaveHandler);

  // Also stop scrolling on dragend (fires on the handle, not the container)
  container.querySelectorAll('.layout-category-header > .drag-handle').forEach(handle => {
    handle.addEventListener('dragend', stopScrollLoop, { once: false });
  });
  // =====================================
// Phase E.2 — Button drag handles (same-category only)
// =====================================
container.querySelectorAll('.layout-category').forEach(categoryEl => {
  const categoryId = categoryEl.dataset.categoryId;
  const itemsContainer = categoryEl.querySelector('.layout-category-items');
  if (!itemsContainer) return;

  // Drag handles
  itemsContainer.querySelectorAll('.layout-item > .drag-handle').forEach(handle => {
    const itemEl = handle.closest('.layout-item');
    const itemId = itemEl?.dataset.itemId;
    if (!itemId) return;

    handle.draggable = true;

    handle.addEventListener('dragstart', e => {
      e.stopPropagation();
      draggedItemContext = { categoryId, itemId };
      itemEl.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', itemId);
    });

    handle.addEventListener('dragend', () => {
      draggedItemContext = null;
      itemEl.classList.remove('is-dragging');
    });
  });

  // Visual feedback only
  itemsContainer.addEventListener('dragover', e => {
    if (!draggedItemContext) return;
    if (draggedItemContext.categoryId !== categoryId) return;

    e.preventDefault();

    const targetItem = e.target.closest('.layout-item');

    itemsContainer
      .querySelectorAll('.layout-item.drag-over')
      .forEach(el => el.classList.remove('drag-over'));

    if (
      targetItem &&
      targetItem.dataset.itemId !== draggedItemContext.itemId
    ) {
      targetItem.classList.add('drag-over');
    }
  });

  // Single source of truth — SAME CATEGORY ONLY
  itemsContainer.addEventListener('drop', e => {
    e.preventDefault();
    if (!draggedItemContext) return;
    if (draggedItemContext.categoryId !== categoryId) return;

    const targetItem = e.target.closest('.layout-item');
    if (!targetItem) return;

    const targetItemId = targetItem.dataset.itemId;
    if (!targetItemId || targetItemId === draggedItemContext.itemId) return;

    itemsContainer
      .querySelectorAll('.layout-item.drag-over')
      .forEach(el => el.classList.remove('drag-over'));

    reorderItems(categoryId, draggedItemContext.itemId, targetItemId);
  });
});

  // =====================================
  // Phase E.2 — Reorder buttons within a category
  // =====================================
  function reorderItems(categoryId, sourceItemId, targetItemId) {
    const category = pageCategories.find(c => c.id === categoryId);
    if (!category) return;

    const sourceIndex = category.items.findIndex(i => i.id === sourceItemId);
    const targetIndex = category.items.findIndex(i => i.id === targetItemId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    const [moved] = category.items.splice(sourceIndex, 1);
    category.items.splice(targetIndex, 0, moved);
    DashboardService.save(dashboardState);
    renderCategories(pageCategories);
    renderLayoutEditor(pageCategories);
  }
}



['button-label-input', 'button-url-input'].forEach(id => {
  const input = document.getElementById(id);
  input?.addEventListener('input', () => {
    const nameErrorEl = document.getElementById('button-name-error');
    const urlErrorEl = document.getElementById('button-editor-error');

    if (nameErrorEl) nameErrorEl.classList.remove('is-visible');
    if (urlErrorEl) urlErrorEl.classList.remove('is-visible');
  });
});

const buttonEditorForm = document.getElementById('button-editor-form');
const buttonEditorCancel = document.getElementById('button-editor-cancel');
const buttonEditorOverlay = document.getElementById('button-editor-overlay');

buttonEditorCancel?.addEventListener('click', closeButtonEditor);
buttonEditorOverlay
  ?.querySelector('.modal-close')
  ?.addEventListener('click', closeButtonEditor);

buttonEditorForm?.addEventListener('submit', e => {
  const nameErrorEl = document.getElementById('button-name-error');
  const urlErrorEl = document.getElementById('button-editor-error');
  const label = document.getElementById('button-label-input').value.trim();
  const url = document.getElementById('button-url-input').value.trim();

  // Reset errors
  if (nameErrorEl) nameErrorEl.classList.remove('is-visible');
  if (urlErrorEl) urlErrorEl.classList.remove('is-visible');

  e.preventDefault();
  if (!editingButtonContext) return;

  let hasErrors = false;

  /* ---- NAME: required ---- */
  if (!label) {
    hasErrors = true;
    if (nameErrorEl) {
      nameErrorEl.textContent = 'Button name is required.';
      nameErrorEl.classList.add('is-visible');
    }
  }

  /* ---- NAME: duplicate (only if name exists) ---- */
  if (label) {
    const duplicateName = pageCategories.some(category =>
      category.items.some(item =>
        item.label.toLowerCase() === label.toLowerCase() &&
        item.id !== editingButtonContext?.itemId
      )
    );

    if (duplicateName) {
      hasErrors = true;
      if (nameErrorEl) {
        nameErrorEl.textContent = 'A button with this name already exists.';
        nameErrorEl.classList.add('is-visible');
      }
    }
  }

  /* ---- URL: required ---- */
  if (!url) {
    hasErrors = true;
    if (urlErrorEl) {
      urlErrorEl.textContent = 'URL is required.';
      urlErrorEl.classList.add('is-visible');
    }
  }

  /* ---- Stop if ANY errors were found ---- */
  if (hasErrors) {
    return;
  }

  let normalizedUrl = url;

  // Add https:// if no protocol is present
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }
  
  // Basic URL sanity check: must contain a dot after protocol
  try {
    const parsed = new URL(normalizedUrl);
    const hostname = parsed.hostname;

    // Require at least one dot and a valid TLD (min 2 chars)
    const hostnameIsValid =
      /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i
        .test(hostname);

    if (!hostnameIsValid) {
      throw new Error('Invalid hostname');
    }
  } catch {
    const errorEl = document.getElementById('button-editor-error');
    if (errorEl) {
      errorEl.textContent = 'Please enter a valid URL (e.g. example.com)';
      errorEl.classList.add('is-visible');
    }
    return;
  }

  if (editingButtonContext.mode === 'create') {
    const category = pageCategories.find(
      c => c.id === editingButtonContext.categoryId
    );
    if (!category) return;

    category.items.push({
      id: `item-${Date.now()}`,
      label,
      url: normalizedUrl
    });
  DashboardService.save(dashboardState);  
  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);

  } else {
    const category = pageCategories.find(
      c => c.id === editingButtonContext.categoryId
    );
    const item = category?.items.find(
      i => i.id === editingButtonContext.itemId
    );
    if (!item) return;

    item.label = label;
    item.url = normalizedUrl;
    DashboardService.save(dashboardState);
    renderCategories(pageCategories);
    renderLayoutEditor(pageCategories);
  }

  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
  closeButtonEditor();
});

// =====================================
// Phase C.1 — Create empty category
// =====================================

function createEmptyCategory(categories) {
  return {
    id: `category-${Date.now()}`,
    title: 'New Category',
    order: categories.length,
    items: []
  };
}

function addCategory() {
  const newCategory = createEmptyCategory(pageCategories);
  pageCategories.push(newCategory);

  DashboardService.save(dashboardState);

  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
}

// =====================================
// Phase C.2 — Toggle category visibility
// =====================================

function toggleCategoryVisibility(categoryId) {
  const category = pageCategories.find(c => c.id === categoryId);
  if (!category) return;

  category.visible = category.visible === false ? true : false;
  DashboardService.save(dashboardState);
  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
}

// =====================================
// Phase C.3 — Rename category
// =====================================

function renameCategory(categoryId, newTitle) {
  const category = pageCategories.find(c => c.id === categoryId);
  if (!category) return;

  const trimmed = newTitle.trim();
  if (!trimmed) return;

  category.title = trimmed;
  DashboardService.save(dashboardState);
  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
}

// =====================================
// Phase D.2 — Rename button
// =====================================
function renameItem(itemId, newLabel) {
  const trimmed = newLabel.trim();
  if (!trimmed) return;

  for (const category of pageCategories) {
    const item = category.items.find(i => i.id === itemId);
    if (item) {
      item.label = trimmed;
      DashboardService.save(dashboardState);
      renderCategories(pageCategories);
      renderLayoutEditor(pageCategories);
      break;
    }
  }

  DashboardService.save(dashboardState);
  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
}

// =====================================
// Phase C.4 — Delete category
// =====================================
function deleteCategory(categoryId) {
  const category = pageCategories.find(c => c.id === categoryId);
  if (!category) return;

  openConfirm({
    title: 'Delete category',
    message: `Delete category "${category.title}"?\nThis will remove the category and all its buttons.`,
    onConfirm: () => {
      const index = pageCategories.findIndex(c => c.id === categoryId);
      if (index === -1) return;

      pageCategories.splice(index, 1);
      pageCategories.forEach((c, i) => {
        c.order = i;
      });
      DashboardService.save(dashboardState);
      renderCategories(pageCategories);
      renderLayoutEditor(pageCategories);
    }
  });
}

// =====================================
// Phase E.1 — Reorder categories
// =====================================
function reorderCategories(sourceId, targetId) {
  const sourceIndex = pageCategories.findIndex(c => c.id === sourceId);
  const targetIndex = pageCategories.findIndex(c => c.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1) return;

  const [moved] = pageCategories.splice(sourceIndex, 1);
  pageCategories.splice(targetIndex, 0, moved);
  pageCategories.forEach((c, i) => {
    c.order = i;
  });
  DashboardService.save(dashboardState);
  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
}

// =====================================
// Phase D.1 — Create button
// =====================================
function createEmptyButton() {
  return {
    id: `item-${Date.now()}`,
    label: 'New button',
    url: ''
  };
}

function addButtonToCategory(categoryId) {
  const category = pageCategories.find(c => c.id === categoryId);
  if (!category) return;

  const newButton = createEmptyButton();
  category.items.push(newButton);
  DashboardService.save(dashboardState);
  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
}

// =====================================
// Phase D.3 — Delete button
// =====================================
function deleteButton(itemId) {
  for (const category of pageCategories) {
    const index = category.items.findIndex(item => item.id === itemId);
    if (index !== -1) {
      const item = category.items[index];

      openConfirm({
        title: 'Delete button',
        message: `Delete button "${item.label}"?\nThis action cannot be undone.`,
        onConfirm: () => {
          const latestIndex = category.items.findIndex(
            i => i.id === itemId
          );
          if (latestIndex === -1) return;

          category.items.splice(latestIndex, 1);
          DashboardService.save(dashboardState);
          renderCategories(pageCategories);
          renderLayoutEditor(pageCategories);
        }
      });

      return;
    }
  }
}

// Quick filter / search
// - case-insensitive
// - starts-with by default
// - contains match when query starts with '*'
const searchInput = document.getElementById('service-search');
const categories = document.querySelectorAll('.category');

if (searchInput) {
  searchInput.addEventListener('input', () => {
    let query = searchInput.value.toLowerCase().trim();
    const useWildcard = query.startsWith('*');

    if (useWildcard) {
      query = query.slice(1);
    }

    document.querySelectorAll('.category').forEach(category => {
      const buttons = category.querySelectorAll('.buttons a');

      // If search is cleared, reset everything and show category
      if (query === '') {
        buttons.forEach(button => {
          button.style.display = '';
        });
        category.style.display = '';
        return;
      }

      // Active search behavior
      let hasVisibleButtons = false;

      buttons.forEach(button => {
        const text = button.textContent.toLowerCase().trim();
        const matches = useWildcard
          ? text.includes(query)
          : text.startsWith(query);

        button.style.display = matches ? '' : 'none';
        if (matches) hasVisibleButtons = true;
      });

      // Hide category only when searching and no matches
      category.style.display = hasVisibleButtons ? '' : 'none';
    });
  });
}

// =====================================================
// Preferences Modal - Shell Logic
// =====================================================

const preferencesOverlay = document.getElementById('preferences-overlay');
const preferencesButton = document.getElementById('settings-button');

// Delete Default Dashboard modal references
const deleteDefaultOverlay = document.getElementById('delete-default-dashboard-overlay');
const deleteDefaultSelect = document.getElementById('delete-default-dashboard-select');
const deleteDefaultConfirm = document.getElementById('delete-default-dashboard-confirm');
const deleteDefaultCancel = document.getElementById('delete-default-dashboard-cancel');
const deleteDefaultClose = document.getElementById('delete-default-dashboard-close');

const closeButton = preferencesOverlay?.querySelector('.modal-close');

const navItems = preferencesOverlay?.querySelectorAll('.nav-item');
const panels = preferencesOverlay?.querySelectorAll('.panel');

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

// Click outside Import modal to close ONLY import modal
importSystemOverlay?.addEventListener('mousedown', (e) => {
  if (e.target !== importSystemOverlay) return;

  // ✅ Prevent click from bubbling to Preferences overlay
  e.preventDefault();
  e.stopPropagation();

  closeImportSystemModal();
});

document.addEventListener('keydown', (e) => {
  const confirmOverlay = document.getElementById('confirm-overlay');
  const buttonEditorOverlay = document.getElementById('button-editor-overlay');
  const confirmOpen = confirmOverlay && !confirmOverlay.hidden;
  const buttonEditorOpen = buttonEditorOverlay && !buttonEditorOverlay.hidden;
  const preferencesOpen = preferencesOverlay && !preferencesOverlay.hidden;
  const deleteDefaultOpen = deleteDefaultOverlay && !deleteDefaultOverlay.hidden;

  /* ===============================
     ENTER = confirm delete
     =============================== */
  if (e.key === 'Enter' && confirmOpen) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof confirmCallback === 'function') {
      confirmCallback();
    }
    closeConfirm();
    return;
  }

  /* ===============================
     ESCAPE handling (layered)
     =============================== */
  if (e.key !== 'Escape') return;

  // ✅ 1. Inline rename always wins
  if (renamingDashboardId !== null || renamingCategoryId !== null) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  // ✅ 2. Modal stack behavior
  const top = getTopModal();
  if (!top) return;

  e.preventDefault();
  e.stopPropagation();
  top.onClose();
});

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

function openButtonEditor(context) {
  editingButtonContext = context;

  const overlay = document.getElementById('button-editor-overlay');
  const title = document.getElementById('button-editor-title');
  const labelInput = document.getElementById('button-label-input');
  const urlInput = document.getElementById('button-url-input');
  const errorEl = document.getElementById('button-editor-error');

  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = 'Please enter both a name and a valid URL.';
  }
  
  if (!overlay || !labelInput || !urlInput) return;

  if (context.mode === 'edit') {
    const category = pageCategories.find(c => c.id === context.categoryId);
    const item = category?.items.find(i => i.id === context.itemId);

    if (!item) return;

    title.textContent = 'Edit Button';
    labelInput.value = item.label;
    urlInput.value = item.url;
  } else {
    title.textContent = 'Add Button';
    labelInput.value = '';
    urlInput.value = '';
  }

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  pushModal(overlay, closeButtonEditor);

  requestAnimationFrame(() => {
    focusFirstFocusableElement(overlay);
  });
}

function closeButtonEditor() {
  const overlay = document.getElementById('button-editor-overlay');
  if (!overlay) return;

  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  editingButtonContext = null;

  popModal(overlay);
}

// =====================================================
// Confirmation modal helper function
// =====================================================

let confirmCallback = null;

function openConfirm({ title, message, confirmLabel = 'Delete', onConfirm }) {
  const overlay = document.getElementById('confirm-overlay');
  const titleEl = document.getElementById('confirm-title');
  const messageEl = document.getElementById('confirm-message');
  const confirmBtn = document.getElementById('confirm-accept');

  if (!overlay || !titleEl || !messageEl || !confirmBtn) return;

  // Title
  titleEl.textContent = title;

  // ✅ Message: support string OR DOM node
  messageEl.innerHTML = '';
  if (typeof message === 'string') {
    messageEl.textContent = message;
  } else if (message instanceof Node) {
    messageEl.appendChild(message);
  }

  // Confirm button
  confirmBtn.textContent = confirmLabel;

  // Store callback
  confirmCallback = onConfirm;

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  pushModal(overlay, closeConfirm);

  requestAnimationFrame(() => {
    focusFirstFocusableElement(overlay);
  });
}

function closeConfirm() {
  const overlay = document.getElementById('confirm-overlay');
  if (!overlay) return;

  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  confirmCallback = null;

  popModal(overlay);
}

// --------------------------------------------------
// Delete Default Dashboard Modal helpers
// --------------------------------------------------
function openDeleteDefaultDashboardModal(dashboardId) {
  deleteDefaultSelect.innerHTML = '';

  const remaining = availableDashboards.filter(
    d => d.id !== dashboardId
  );

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select dashboard…';
  placeholder.disabled = true;
  placeholder.selected = true;

  // ✅ Hides it from the opened dropdown list
  placeholder.hidden = true;

  deleteDefaultSelect.appendChild(placeholder);

  remaining.forEach(({ id, name }) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    deleteDefaultSelect.appendChild(option);
  });

  deleteDefaultOverlay.hidden = false;
  deleteDefaultOverlay.setAttribute('aria-hidden', 'false');

  pushModal(deleteDefaultOverlay, closeDeleteDefaultDashboardModal);

  requestAnimationFrame(() => {
    focusFirstFocusableElement(deleteDefaultOverlay);
  });
}

function closeDeleteDefaultDashboardModal() {
  pendingDefaultDeletionId = null;
  deleteDefaultOverlay.hidden = true;
  deleteDefaultOverlay.setAttribute('aria-hidden', 'true');

  popModal(deleteDefaultOverlay);
}

// Enable confirm only when a selection is made
deleteDefaultSelect.addEventListener('change', () => {
  deleteDefaultConfirm.disabled = !deleteDefaultSelect.value;
});

deleteDefaultCancel.addEventListener(
  'click',
  closeDeleteDefaultDashboardModal
);

deleteDefaultClose.addEventListener(
  'click',
  closeDeleteDefaultDashboardModal
);

deleteDefaultConfirm.addEventListener('click', async () => {
  const newDefaultId = deleteDefaultSelect.value;
  if (!newDefaultId || !pendingDefaultDeletionId) return;

  // Assign new default first
  defaultDashboardId = newDefaultId;
  await DashboardService.setDefaultDashboardId(newDefaultId);

  // Now delete the old default
  await deleteDashboard(pendingDefaultDeletionId, false);

  closeDeleteDefaultDashboardModal();
});

function openDeleteDefaultModal(dashboardId) {
  const remainingDashboards =
    availableDashboards.filter(d => d.id !== dashboardId);

  let selectedNewDefault = null;

  // Build custom modal content
  const wrapper = document.createElement('div');

  const text = document.createElement('p');
  text.textContent =
    'You are deleting the default dashboard. Please choose a new default dashboard to continue.';
  wrapper.appendChild(text);

  const select = document.createElement('select');
  select.style.width = '100%';
  select.style.marginTop = '0.75rem';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select new default dashboard…';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);

  remainingDashboards.forEach(({ id, name }) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    select.appendChild(option);
  });

  select.addEventListener('change', () => {
    selectedNewDefault = select.value;
    confirmAccept.disabled = !selectedNewDefault;
  });

  wrapper.appendChild(select);

  openConfirm({
    title: 'Delete default dashboard',
    message: wrapper,
    confirmLabel: 'Delete',
    onConfirm: async () => {
      // Assign new default first
      defaultDashboardId = selectedNewDefault;
      await DashboardService.setDefaultDashboardId(defaultDashboardId);

      // Delete the old default
      await deleteDashboard(dashboardId, false);
    }
  });

  // Disable delete until a new default is chosen
  confirmAccept.disabled = true;
}

// =====================================================
// Confirm modal button wiring (must come AFTER helpers)
// =====================================================
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmAccept = document.getElementById('confirm-accept');

// =====================================================
// Delete Default Dashboard modal wiring
// =====================================================
deleteDefaultSelect.addEventListener('change', () => {
  deleteDefaultConfirm.disabled = !deleteDefaultSelect.value;
});

deleteDefaultCancel.addEventListener(
  'click',
  closeDeleteDefaultDashboardModal
);

deleteDefaultClose.addEventListener(
  'click',
  closeDeleteDefaultDashboardModal
);

deleteDefaultConfirm.addEventListener('click', async () => {
  const newDefaultId = deleteDefaultSelect.value;
  if (!newDefaultId || !pendingDefaultDeletionId) return;

  // 1️⃣ Persist the new default
  defaultDashboardId = newDefaultId;
  await DashboardService.setDefaultDashboardId(newDefaultId);

  // 2️⃣ Delete the old default dashboard
  await deleteDashboard(pendingDefaultDeletionId, false);

  // 3️⃣ Close modal and reset state
  closeDeleteDefaultDashboardModal();
});

confirmCancel?.addEventListener('click', closeConfirm);

confirmOverlay
  ?.querySelector('.modal-close')
  ?.addEventListener('click', closeConfirm);

confirmAccept?.addEventListener('click', () => {
  if (typeof confirmCallback === 'function') {
    confirmCallback();
  }
  closeConfirm();
});

// =====================================================
// Preferences → Appearance (Theme selection)
// =====================================================

const themeRadios = document.querySelectorAll('input[name="pref-theme"]');

/**
 * Returns the currently active theme class on <html>
 */
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

/**
 * Sync modal radio buttons with current theme
 */
function syncThemeRadios() {
  const activeTheme = getCurrentTheme();
  themeRadios.forEach(radio => {
    radio.checked = radio.value === activeTheme;
  });
}

// Apply theme when user selects a radio
themeRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    setActiveTheme(radio.value); // uses existing logic
    syncThemeRadios();
  });
});

// Sync radios when modal opens
document
  .getElementById('settings-button')
  ?.addEventListener('click', syncThemeRadios);

const themeCards = document.querySelectorAll('.theme-card:not(.bg-card)');
const backgroundCards = document.querySelectorAll('.bg-card');

function syncThemeCards() {
  const activeTheme = getCurrentTheme();

  themeCards.forEach(card => {
    card.classList.toggle(
      'active',
      card.dataset.theme === activeTheme
    );
  });
}

// =====================================
// Unified state change functions
// =====================================

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

themeCards.forEach(card => {
  card.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    changeTheme(card.dataset.theme);
  });
});

// =====================================================
// Global click-outside handler (modal-stack driven)
// =====================================================
document.addEventListener('mousedown', (e) => {
  const top = getTopModal();
  if (!top) return;

  const { overlay, onClose } = top;
  const modal = overlay.querySelector('.modal-container');

  // Only close if clicking outside the modal container
  if (modal && !modal.contains(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  }
});

// =====================================
// Background selector UI
// =====================================

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

backgroundCards.forEach(card => {
  card.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    changeBackground(card.dataset.bg);
  });
});

// Sync when modal or preferences open
document
  .getElementById('settings-button')
  ?.addEventListener('click', () => {
    syncThemeCards();
    syncBackgroundCards();
  }
);

// ============================
// Initialize app state and render UI
// ============================
initApp();