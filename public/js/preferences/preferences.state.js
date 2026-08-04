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
  classicUI: false,
  showFavicons: true,
  showButtonDescriptions: true,
  compactMode: false,
  showClock: true,
  allowCollapseCategories: true,
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

  // Header icon (uploaded icons are data: URLs; static assets are
  // cacheable — no cache-buster needed, it only forced re-downloads)
  const headerIcon = document.querySelector('.header-center img');
  if (headerIcon && icon && headerIcon.getAttribute('src') !== icon) {
    headerIcon.src = icon;
  }

  // Identity preview name
  const previewName = document.querySelector('.identity-name-preview');
  if (previewName) previewName.textContent = name;

  // Identity preview icon
  const previewIcon = document.querySelector('.identity-icon-preview');
  if (previewIcon && icon && previewIcon.getAttribute('src') !== icon) {
    previewIcon.src = icon;
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

// The theme/background that is actually in effect: global preferences
// when appearance sync is on, otherwise the active dashboard's own
// appearance (falling back to global). Selection UIs must use this —
// not raw userPreferences — or they highlight the wrong entry in
// per-dashboard mode.
function getEffectiveAppearance() {
  const syncOn =
    userPreferences?.behavior?.syncDashboardAppearance !== false;

  if (syncOn) {
    return {
      theme: userPreferences?.appearance?.theme,
      background: userPreferences?.appearance?.background
    };
  }

  return {
    theme:
      dashboardState?.appearance?.theme ??
      userPreferences?.appearance?.theme,
    background:
      dashboardState?.appearance?.background ??
      userPreferences?.appearance?.background
  };
}

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

// Cache the APPLIED theme/background classes for the pre-paint script
// in index.html. Storing the resolved values (never 'system') means the
// first paint always uses a real theme class, and per-dashboard
// appearance paints correctly too.
function updateUiPaintCache(patch) {
  try {
    const raw = localStorage.getItem('webdash-ui-cache');
    const data = raw ? JSON.parse(raw) : {};
    Object.assign(data, patch);
    localStorage.setItem('webdash-ui-cache', JSON.stringify(data));
  } catch {
    // Best-effort (private browsing, full storage, …)
  }
}

function setActiveTheme(theme) {
  const root = document.documentElement;

  const resolvedTheme =
    theme === 'system'
      ? resolveSystemTheme()
      : theme;

  updateUiPaintCache({ theme: resolvedTheme });

  // Skip if already applied
  if (root.classList.contains(resolvedTheme)) return;

  const themes = window.THEMES || [];

  const currentTheme = themes.find(t =>
    root.classList.contains(t.id)
  )?.id;

  // Disable transitions instantly
  root.classList.add('no-transitions');

  // Swap classes immediately
  if (currentTheme) {
    root.classList.remove(currentTheme);
  }

  root.classList.add(resolvedTheme);

  // Force browser to apply immediately (important)
  root.offsetHeight;

  // Re-enable transitions
  root.classList.remove('no-transitions');
}

function setActiveBackground(bg) {
  const root = document.documentElement;

  const backgrounds = window.BACKGROUNDS || [];

  const currentBg = backgrounds.find(b =>
    root.classList.contains(b.id)
  )?.id;

  updateUiPaintCache({ background: bg });

  if (currentBg === bg) return;

  // Disable transitions
  root.classList.add('no-transitions');

  if (currentBg) {
    root.classList.remove(currentBg);
  }

  root.classList.add(bg);

  // Force repaint
  root.offsetHeight;

  // Re-enable transitions
  root.classList.remove('no-transitions');
}

// ======================================================================
// CUSTOM BACKGROUND IMAGES
// ======================================================================
//
// User-uploaded wallpapers (data URLs) shown via the `bg-custom`
// background. The image LIBRARY is stored once in userPreferences —
// never copied into dashboards, which only reference an image by id.
// The selected id follows the usual appearance sync rules: from
// userPreferences when synced, otherwise from the active dashboard.

const MAX_CUSTOM_BACKGROUNDS = 6;

function getCustomBackgroundLibrary() {
  if (!userPreferences?.appearance) return [];

  const appearance = userPreferences.appearance;

  // Migrate the legacy single-image format into the library
  if (typeof appearance.customBackground === 'string') {
    const entry = {
      id: generateId('bg'),
      image: appearance.customBackground
    };
    appearance.customBackgrounds = [entry];
    appearance.customBackgroundId = entry.id;
    delete appearance.customBackground;
  }

  if (!Array.isArray(appearance.customBackgrounds)) {
    appearance.customBackgrounds = [];
  }

  return appearance.customBackgrounds;
}

function getActiveCustomBackgroundId() {
  const syncOn =
    userPreferences?.behavior?.syncDashboardAppearance !== false;

  if (syncOn) {
    return userPreferences?.appearance?.customBackgroundId ?? null;
  }

  return (
    dashboardState?.appearance?.customBackgroundId ??
    userPreferences?.appearance?.customBackgroundId ??
    null
  );
}

function getActiveCustomBackground() {
  const library = getCustomBackgroundLibrary();
  if (!library.length) return null;

  const id = getActiveCustomBackgroundId();

  // Fall back to the first image when the referenced one is gone
  const entry = library.find(b => b.id === id) ?? library[0];

  return entry?.image ?? null;
}

// Sets the CSS variable the `bg-custom` layer reads. Harmless when the
// bg-custom class isn't active, so it's safe to call on every apply.
function applyCustomBackgroundImage() {
  const root = document.documentElement;
  const img = getActiveCustomBackground();

  if (img && typeof img === 'string' && img.startsWith('data:')) {
    root.style.setProperty('--custom-bg-image', `url("${img}")`);
  } else {
    root.style.removeProperty('--custom-bg-image');
  }
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

  // Keep the runtime dropdown flag in sync with the stored preference
  // (previously only updated when the toggle was flipped, so a disabled
  // setting silently reverted to auto-close after a reload)
  autoCloseDropdowns = behavior.autoCloseDropdowns !== false;
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

// Returns true when the recents list actually changed, so callers can
// skip a full dashboard re-render when nothing would look different.
async function addToRecents(itemId) {
  ensureBehaviorDefaults();

  if (userPreferences?.behavior?.trackRecents === false) return false;

  const previous = userPreferences.behavior.recents;
  const limit = userPreferences.behavior.recentsLimit;

  // Remove existing (dedup)
  let recents = previous.filter(id => id !== itemId);

  // Add to front
  recents.unshift(itemId);

  // Enforce limit
  if (recents.length > limit) {
    recents = recents.slice(0, limit);
  }

  const unchanged =
    previous.length === recents.length &&
    previous.every((id, i) => id === recents[i]);

  userPreferences.behavior.recents = recents;

  if (unchanged) return false;

  await PreferencesService.save(userPreferences);
  return true;
}

// ======================================================================
// PREFERENCE SYNCHRONIZATION HELPERS
// ======================================================================

// Reserved for future expansion