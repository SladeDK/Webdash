// Keys
const THEME_KEY = 'webdash-theme';
const BACKGROUND_KEY = 'webdash-background';
const USER_PREFS_KEY = 'webdash-user-preferences';
const HAS_SEEDED_DASHBOARD_KEY = "webdash.hasSeededDashboard";
const DASHBOARD_STATE_KEY = 'webdash-dashboard-state';
const AUTO_CLOSE_KEY = 'webdash-dropdown-autoclose';
const autoCloseCheckbox = document.getElementById('pref-dropdown-autoclose');

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
  }
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

// Miscellaneous
let renamingCategoryId = null;
let renamingItemId = null;
let editingButtonContext = null;
let draggedCategoryId = null;
let dashboardState = null;
let pageCategories = null;
let autoCloseDropdowns;

document.addEventListener('submit', e => {
  e.preventDefault();
});

// =====================================================================================
// Default dashboard state (used for resets and as a reference for expected data shape)
// =====================================================================================
const DEFAULT_DASHBOARD_STATE = {
  id: "default-dashboard",
  name: "My Dashboard",
  categories: [
    {
      id: "cat-getting-started",
      title: "Getting Started",
      order: 0,
      visible: true,
      items: [
        {
          id: "btn-settings",
          label: "Google",
          url: "https://google.com",
          order: 1,
          visible: true
        },
        {
          id: "btn-docs",
          label: "WebDash Github",
          url: "https://github.com/SladeDK/Webdash",
          order: 0,
          visible: true
        }
      ]
    }
  ]
};

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
  // 1️⃣ Dashboard data
  await initializeDashboardState();
  pageCategories = dashboardState.categories;

  // 2️⃣ Preferences
  userPreferences = await PreferencesService.load();

  if (!userPreferences) {
    userPreferences = createDefaultPreferences();
    await PreferencesService.save(userPreferences);
  }
  ensureIdentityDefaults();
  applyIdentityToUI();
  document.documentElement.classList.add('identity-ready');

  // Apply visual preferences immediately to prevent flashing of defaults
  setActiveTheme(userPreferences.appearance.theme);
  setActiveBackground(userPreferences.appearance.background);
  
  // Sync behavior-related UI elements with loaded preferences
  if (openLinksCheckbox) {
    // Initialize checkbox state from unified preferences
    openLinksCheckbox.checked =
    userPreferences.behavior.openLinksInNewTab !== false;
  }

  autoCloseDropdowns = userPreferences.behavior.autoCloseDropdowns !== false;

  if (autoCloseCheckbox) {
    autoCloseCheckbox.checked = autoCloseDropdowns;
  }

  // 3️⃣ Initial render
  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
}

// ======================================================================
// Dashboard state persistence helpers (currently only used for export/import, but will be expanded for auto-saving in the future)
// ======================================================================
function saveDashboardState() {
  localStorage.setItem(
    DASHBOARD_STATE_KEY,
    JSON.stringify(dashboardState)
  );
}

function loadDashboardState() {
  const raw = localStorage.getItem(DASHBOARD_STATE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
  const trimmed = identityNameInput.value.trim();

  // Only update state + UI if there is actual text
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
      alert('Please select an image file.');
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
// Data Management — Export dashboard settings
// =====================================================
const exportDashboardBtn = document.getElementById('export-dashboard-btn');

if (exportDashboardBtn) {
  exportDashboardBtn.addEventListener('click', () => {
    try {
      const exportPayload = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        pageId: getPageId(),
        data: {
          preferences: userPreferences,
          categories: pageCategories
        }
      };

      const json = JSON.stringify(exportPayload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;

      // ✅ Polished filename
      a.download = buildExportFilename();

      document.body.appendChild(a);
      a.click();

      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[WebDash] Export failed:', err);
      alert('Failed to export dashboard settings.');
    }
  });
}

// =====================================================
// Data Management — Import dashboard settings
// =====================================================
const importDashboardBtn = document.getElementById('import-dashboard-btn');
const importDashboardFile = document.getElementById('import-dashboard-file');

if (importDashboardBtn && importDashboardFile) {
  importDashboardBtn.addEventListener('click', () => {
    importDashboardFile.value = ''; // reset so the same file can be selected again
    importDashboardFile.click();
  });

  importDashboardFile.addEventListener('change', () => {
    const file = importDashboardFile.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);

        validateImportPayload(parsed);

      openConfirm({
        title: 'Import dashboard settings',
        message:
          'This will replace your current dashboard layout and preferences.\n\nThis action cannot be undone.',
        confirmLabel: 'Import',
        onConfirm: () => {
          applyImportedData(parsed);

          // ✅ Close the Preferences modal after successful import
          closePreferences();
        }
      });
      } catch (err) {
        console.error('[WebDash] Import failed:', err);
        alert('Invalid or unsupported import file.');
      }
    };

    reader.readAsText(file);
  });
}

// =====================================================
// Data Management — Import validation helper
// =====================================================
function validateImportPayload(payload) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    payload.schemaVersion !== 1 ||
    !payload.data ||
    !payload.data.preferences ||
    !payload.data.categories
  ) {
    throw new Error('Invalid import schema');
  }

  if (!Array.isArray(payload.data.categories)) {
    throw new Error('Categories must be an array');
  }
}


// =====================================================
// Data Management — Apply imported data
// =====================================================

function applyImportedData(payload) {
  // Replace preferences
  localStorage.setItem(
    USER_PREFS_KEY,
    JSON.stringify(payload.data.preferences)
  );
  Object.assign(userPreferences, payload.data.preferences);

  // Replace dashboard content
  dashboardState = {
    ...dashboardState,
    categories: structuredClone(payload.data.categories)
  };

  DashboardService.save(dashboardState);

  pageCategories = dashboardState.categories;

  ensureIdentityDefaults();
  applyIdentityToUI();
  document.documentElement.classList.add('identity-ready');

  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
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
        'This will permanently remove all dashboard customizations, including layout, appearance, and settings.\n\nThis action cannot be undone.',
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
        icon: INITIAL_IDENTITY.icon
      }
    },
    behavior: {
      autoCloseDropdowns: true,
      openLinksInNewTab: true
    }
  };
}

function resetDashboard() {
  // 1️⃣ Reset preferences
  const defaults = createDefaultPreferences();
  localStorage.setItem(USER_PREFS_KEY, JSON.stringify(defaults));
  Object.assign(userPreferences, defaults);

  // 2️⃣ Reset dashboard state
  dashboardState = structuredClone(DEFAULT_DASHBOARD_STATE);
  pageCategories = dashboardState.categories;

  // Save the reset dashboard state
  DashboardService.save(dashboardState);          // ✅ critical

  // 3️⃣ Re-apply visual state
  setActiveTheme(defaults.appearance.theme);
  setActiveBackground(defaults.appearance.background);
  syncBehaviorUI();
  ensureIdentityDefaults();
  applyIdentityToUI();
  document.documentElement.classList.add('identity-ready');

  // 4️⃣ Re-render
  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
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
  document.documentElement.classList.remove(...BACKGROUNDS);
  document.documentElement.classList.add(bg);
}

document.documentElement.classList.add('bg-visible');

// =====================================
// Render categories
// =====================================

function renderCategories(categories) {
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

// =====================================
// Dashboard Layout editor rendering
// =====================================

function renderLayoutEditor(categories) {
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

          ${renamingCategoryId === category.id
            ? `<input
                  class="rename-input"
                  type="text"
                  data-category-id="${category.id}"
                  value="${category.title}"
              />`
            : `<span class="category-title">${category.title}</span>`
          }

          <div class="category-actions">
            <!-- Visibility toggle (Phase C.2) -->
            <button
              type="button"
              class="icon-button visibility-btn ${category.visible === false ? 'is-hidden' : ''}"
              aria-label="Toggle visibility"
              title="Toggle visibility"
              data-category-id="${category.id}"
            >
              ${category.visible === false ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>'}
            </button>

            <button
              type="button"
              class="icon-button rename-category-btn"
              aria-label="Rename category"
              title="Rename category"
              data-category-id="${category.id}"
            >
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            
            <button
              type="button"
              class="icon-button delete-category-btn"
              aria-label="Delete category"
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

                <button
                  type ="button"
                  class="icon-button rename-item-btn"
                  aria-label="Rename button"
                  title="Rename button"
                  data-item-id="${item.id}"
                >
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>

                <button
                  type="button"
                  class="icon-button delete-item-btn"
                  aria-label="Delete button"
                  title="Delete button"
                  data-item-id="${item.id}"
                >
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>
          `).join('')}

          <!-- Add button action -->
          <button
            type="button"
            class="layout-action-btn add-item-btn"
            data-category-id="${category.id}"
            aria-label="Add button"
            title="Add button"
          >
            <span class="action-icon"><i class="fa-solid fa-plus"></i></span>
            <span>Add button</span>
          </button>
        </div>
      `;

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
  // Wire rename inputs (Phase C.3)
  container.querySelectorAll('.rename-input').forEach(input => {
    const categoryId = input.dataset.categoryId;

  requestAnimationFrame(() => {  
    input.focus();
    input.select();
  });

    input.onkeydown = e => {
      if (e.key === 'Enter') {
        renameCategory(categoryId, input.value);
        renamingCategoryId = null;
      }
      if (e.key === 'Escape') {
        renamingCategoryId = null;
        renderLayoutEditor(pageCategories);
      }
    };

    input.onblur = () => {
      renameCategory(categoryId, input.value);
      renamingCategoryId = null;
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
const closeButton = preferencesOverlay?.querySelector('.modal-close');

const navItems = preferencesOverlay?.querySelectorAll('.nav-item');
const panels = preferencesOverlay?.querySelectorAll('.panel');

// ---------- Open modal ----------
function openPreferences() {
  preferencesOverlay.hidden = false;
  preferencesOverlay.setAttribute('aria-hidden', 'false');

  const firstNav = preferencesOverlay.querySelector('.nav-item');
  firstNav?.focus();
}

// ---------- Close modal ----------
function closePreferences() {
  preferencesOverlay.hidden = true;
  preferencesOverlay.setAttribute('aria-hidden', 'true');
  preferencesButton?.focus();
}

// Open button
preferencesButton?.addEventListener('click', openPreferences);

// Close via X
closeButton?.addEventListener('click', closePreferences);

// Click outside modal to close
preferencesOverlay?.addEventListener('mousedown', (e) => {
  const modal = preferencesOverlay.querySelector('.modal-container');
  if (modal && !modal.contains(e.target)) {
    closePreferences();
  }
});

document.addEventListener('keydown', (e) => {
  const confirmOverlay = document.getElementById('confirm-overlay');
  const buttonEditorOverlay = document.getElementById('button-editor-overlay');

  const confirmOpen = confirmOverlay && !confirmOverlay.hidden;
  const buttonEditorOpen =
    buttonEditorOverlay && !buttonEditorOverlay.hidden;
  const preferencesOpen = preferencesOverlay && !preferencesOverlay.hidden;

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
     ESCAPE = close topmost modal
     =============================== */
  if (e.key !== 'Escape') return;

  // 1️⃣ Confirm modal
  if (confirmOpen) {
    e.preventDefault();
    e.stopPropagation();
    closeConfirm();
    return;
  }

  // 2️⃣ Button editor
  if (buttonEditorOpen) {
    e.preventDefault();
    e.stopPropagation();
    closeButtonEditor();
    return;
  }

  // 3️⃣ Preferences
  if (preferencesOpen) {
    e.preventDefault();
    e.stopPropagation();
    closePreferences();
  }
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
  const modalContainer = overlay.querySelector('.modal-container');
  const errorEl = document.getElementById('button-editor-error');

  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = 'Please enter both a name and a valid URL.';
  }
  
  // Clicking on the button editor overlay (but not the modal itself)
  // should close ONLY the button editor
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) {
      e.preventDefault();
      e.stopPropagation();
      closeButtonEditor();
    }
  });
  
  // Prevent clicks inside button editor from closing parent modals
  modalContainer.addEventListener('mousedown', e => {
    e.stopPropagation();
  });
  modalContainer.addEventListener('click', e => {
    e.stopPropagation();
  });
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

  requestAnimationFrame(() => {
    labelInput.focus();
  });
}

function closeButtonEditor() {
  const overlay = document.getElementById('button-editor-overlay');
  if (!overlay) return;

  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  editingButtonContext = null;
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

  titleEl.textContent = title;
  messageEl.textContent = message;
  confirmBtn.textContent = confirmLabel;

  confirmCallback = onConfirm;

  const modalContainer = overlay.querySelector('.modal-container');

  // Prevent clicks inside confirm modal from closing Preferences
  modalContainer?.addEventListener('mousedown', e => {
    e.stopPropagation();
  });
  modalContainer?.addEventListener('click', e => {
    e.stopPropagation();
  });

  // Clicking on backdrop closes ONLY confirm modal
  overlay.addEventListener('mousedown', e => {
    if (e.target === overlay) {
      e.stopPropagation();
      closeConfirm();
    }
  });

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
}

function closeConfirm() {
  const overlay = document.getElementById('confirm-overlay');
  if (!overlay) return;

  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  confirmCallback = null;
}

// =====================================================
// Confirm modal button wiring (must come AFTER helpers)
// =====================================================
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmAccept = document.getElementById('confirm-accept');

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

function changeTheme(theme) {
  setActiveTheme(theme);

  userPreferences.appearance.theme = theme;
  PreferencesService.save(userPreferences);

  syncThemeCards();
  syncBackgroundCards();
  syncThemeRadios();
}

function changeBackground(bg) {
  setActiveBackground(bg);

  userPreferences.appearance.background = bg;
  PreferencesService.save(userPreferences);

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
  });

// ✅ Signal that categories are ready
document.body.classList.add('categories-initialized');

// ============================
// Initialize app state and render UI
// ============================
initApp();