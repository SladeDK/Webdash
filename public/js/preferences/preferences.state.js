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
// PREFERENCES STATE & PERSISTENCE
// ======================================================================

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

function getCurrentTheme() {
  const themes = [
    'system',
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

  // Sync dropdown active state
  document.querySelectorAll('.theme-item').forEach(btn => {
    if (btn.dataset.theme === theme) {
      btn.classList.add('is-active');
    } else {
      btn.classList.remove('is-active');
    }
  });
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

function syncThemeRadios() {
  const activeTheme = getCurrentTheme();
  themeRadios.forEach(radio => {
    radio.checked = radio.value === activeTheme;
  });
}

function syncThemeCards() {
  const savedTheme = userPreferences.appearance.theme;

  themeCards.forEach(card => {
    let isActive = false;

    if (savedTheme === 'system') {
      // Only system card is active
      isActive = card.dataset.theme === 'system';
    } else {
      // Only direct match
      isActive = card.dataset.theme === savedTheme;
    }

    card.classList.toggle('active', isActive);
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

// ======================================================================
// BEHAVIOR PREFERENCES (NON-VISUAL)
// ======================================================================

// Reserved for future expansion

// ======================================================================
// PREFERENCE SYNCHRONIZATION HELPERS
// ======================================================================

// Reserved for future expansion