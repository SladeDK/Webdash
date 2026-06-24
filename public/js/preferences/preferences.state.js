// ======================================================================
// PREFERENCES STATE
// ======================================================================
//
// Own preferences.// Owns the meaning, mutation, persistence, and application of user
//
// Responsibilities:
// - Read/write userPreferences
// - Persist preferences via PreferencesService
// - Apply preferences to the application (theme, background, identity)
// - Handle preference-side synchronization logic
//
// Does NOT:
// - Wire DOM event listeners
// - Own UI elements or modal logic
// - Handle import/export or reset workflows
//
// This file represents the authoritative preferences domain logic.
//

// ======================================================================
// Defaults & Constants
// ======================================================================

const DEFAULT_BEHAVIOR = {
  favorites: [],
  recents: [],
  recentsLimit: 5,
  trackRecents: true,
  confirmDeleteButtons: true,
  openLinksInNewTab: true,
  autoCloseDropdowns: true,
  syncDashboardAppearance: true,
  enableAnimations: true,
  storeRecentsAcrossReloads: true,
  debugMode: false,
  betaUI: false,
};

// ======================================================================
// PREFERENCES STATE & PERSISTENCE
// ======================================================================

function syncDashboardIdentityUI() {
  if (!syncIdentityCheckbox) return;

  syncIdentityCheckbox.checked =
    userPreferences?.appearance?.identity?.syncWithDashboard !== false;
}

function syncBehaviorUI() {
  syncDashboardIdentityUI();

  if (recentsLimitInput) {
    recentsLimitInput.value =
      userPreferences?.behavior?.recentsLimit ?? 5;
  }
}

// ======================================================================
// IDENTITY PREFERENCES (STATE & APPLICATION)
// ======================================================================

const INITIAL_IDENTITY = (() => {
  const name = document.querySelector('.header-center h1')?.textContent?.trim() || 'Dashboard';

  const icon = document.querySelector('.header-center img')?.getAttribute('src') || null;

  return { name, icon };
})();

async function resetIdentity() {
  try {
    if (!dashboardState || !dashboardState.identity) return;

    const defaults = getDefaultIdentity();

    const syncEnabled =
      userPreferences.appearance.identity.syncWithDashboard !== false;

    // Name depends on sync mode
    dashboardState.identity.name = syncEnabled
      ? dashboardState.name
      : defaults.name;

    // Icon always resets
    dashboardState.identity.icon = defaults.icon;

    await DashboardService.save(dashboardState);

    applyIdentityToUI();

    showToast({
      title: 'Identity reset',
      lines: [
        'Your identity was reset successfully.'
      ],
      type: 'success',
      duration: 5000
    });
  } catch (err) {
    console.error('[WebDash] Failed to reset identity:', err);

    showToast({
      title: 'Identity reset failed',
      lines: [
        'Your identity could not be reset.',
        'Please try again.'
      ],
      type: 'error',
      duration: 5000
    });
  }
}

function applyIdentityToUI() {
  if (!dashboardState || !dashboardState.identity) return;

  const { name, icon } = dashboardState.identity;

  // Header title
  const headerTitle = document.querySelector('.header-center h1');
  if (headerTitle) headerTitle.textContent = name;

  // Header icon
  const headerIcon = document.querySelector('.header-center img');
  if (headerIcon && icon) {
    if (icon.startsWith('data:')) {
      headerIcon.src = icon;
    } else {
      headerIcon.src = icon + '?t=' + Date.now();
    }
  }

  // Identity preview name
  const previewName = document.querySelector('.identity-name-preview');
  if (previewName) previewName.textContent = name;

  // Identity preview icon
  const previewIcon = document.querySelector('.identity-icon-preview');
  if (previewIcon && icon) {
    if (icon.startsWith('data:')) {
      previewIcon.src = icon;
    } else {
      previewIcon.src = icon + '?t=' + Date.now();
    }
  }

  // Input value
  const input = document.querySelector('.identity-name-input');
  if (input && input.value !== name) {
    input.value = name;
  }
  applyDocumentTitle();
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

// ======================================================================
// APPEARANCE PREFERENCES (STATE & APPLICATION)
// ======================================================================

function updateThemeSelectionUI(theme) {
  const themeCards = document.querySelectorAll('.theme-card[data-theme]');
  const dropdownItems = document.querySelectorAll('.theme-item');

  themeCards.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });

  dropdownItems.forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.theme === theme);
  });
}

function updateBackgroundSelectionUI(bg) {
  const bgCards = document.querySelectorAll('.bg-card');

  bgCards.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.bg === bg);
  });
}

function resolveSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'theme-dark'
    : 'theme-light';
}

function setActiveTheme(theme) {
  const root = document.documentElement;

  const resolvedTheme =
    theme === 'system'
      ? resolveSystemTheme()
      : theme;

  const themes = window.THEMES || [];

  const currentTheme = themes.find(t =>
    root.classList.contains(t.id)
  )?.id;

  if (currentTheme === resolvedTheme) return;

  root.classList.add('theme-switching');

  if (currentTheme) {
    root.classList.remove(currentTheme);
  }

  root.classList.add(resolvedTheme);

  requestAnimationFrame(() => {
    root.classList.remove('theme-switching');
  });
}

function changeTheme(theme) {
  // Apply visually
  setActiveTheme(theme);

  // Lightweight UI update (NO re-render)
  updateThemeSelectionUI(theme);

  syncThemeRadios?.();
}

function setActiveBackground(bg) {
  const root = document.documentElement;

  const backgrounds = window.BACKGROUNDS || [];

  const currentBg = backgrounds.find(b =>
    root.classList.contains(b.id)
  )?.id;

  if (currentBg === bg) return;

  if (currentBg) {
    root.classList.replace(currentBg, bg);
  } else {
    root.classList.add(bg);
  }
}

function changeBackground(bg) {
  // Apply visually
  setActiveBackground(bg);

  // Lightweight UI update
  updateBackgroundSelectionUI(bg);
}


function syncThemeRadios() {
  const isSyncOn =
    userPreferences?.behavior?.syncDashboardAppearance !== false;

  const savedTheme = isSyncOn
    ? userPreferences.appearance.theme
    : dashboardState?.appearance?.theme ?? userPreferences.appearance.theme;

  if (!themeRadios) return;

  themeRadios.forEach(radio => {
    radio.checked = radio.value === savedTheme;
  });
}

// ======================================================================
// BEHAVIOR PREFERENCES (NON-VISUAL)
// ======================================================================

// ======================================================================
// FAVORITES & RECENTS (GLOBAL)
// ======================================================================

function shouldShowQuickAccess() {
  const hasFavorites =
    (userPreferences?.behavior?.favorites ?? []).length > 0;

  const hasRecents =
    userPreferences?.behavior?.trackRecents !== false &&
    (userPreferences?.behavior?.recents ?? []).length > 0;

  return hasFavorites || hasRecents;
}

function ensureBehaviorDefaults() {
  if (!userPreferences) return;

  if (!userPreferences.behavior) {
    userPreferences.behavior = {};
  }

  const behavior = userPreferences.behavior;

  // migrate old key to new key
  if (
    behavior.trackRecent !== undefined &&
    behavior.trackRecents === undefined
  ) {
    behavior.trackRecents = behavior.trackRecent;
    delete behavior.trackRecent;
  }

  // apply defaults
  for (const key in DEFAULT_BEHAVIOR) {
    if (behavior[key] === undefined) {
      behavior[key] = structuredClone(DEFAULT_BEHAVIOR[key]);
    }
  }
}

async function toggleFavorite(itemId) {
  ensureBehaviorDefaults();

  const favorites = userPreferences.behavior.favorites;

  const index = favorites.indexOf(itemId);

  if (index === -1) {
    favorites.push(itemId);
  } else {
    favorites.splice(index, 1);
  }

  await PreferencesService.save(userPreferences);
}

async function addToRecents(itemId) {
  ensureBehaviorDefaults();

  if (userPreferences?.behavior?.trackRecents === false) return;

  let recents = userPreferences.behavior.recents;
  const limit = userPreferences.behavior.recentsLimit;

  // Remove existing (dedup)
  recents = recents.filter(id => id !== itemId);

  // Add to front
  recents.unshift(itemId);

  // Enforce limit
  if (recents.length > limit) {
    recents = recents.slice(0, limit);
  }

  userPreferences.behavior.recents = recents;

  await PreferencesService.save(userPreferences);
}

// ======================================================================
// PREFERENCE SYNCHRONIZATION HELPERS
// ======================================================================

// Reserved for future expansion