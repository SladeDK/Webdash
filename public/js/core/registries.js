// =====================================================
// Theme definitions (global)
// =====================================================

window.THEMES = [
  {
    id: 'system',
    label: 'System',
    description: 'Follows the theme of your operating system'
  },
  {
    id: 'theme-dark',
    label: 'Dark',
    description: 'Standard dark dashboard theme'
  },
  {
    id: 'theme-light',
    label: 'Light',
    description: 'Clean, bright layout for daytime use'
  },
  {
    id: 'theme-midnight',
    label: 'Midnight',
    description: 'Deep blue tones for low-light environments'
  },
  {
    id: 'theme-slate',
    label: 'Slate',
    description: 'Neutral, professional gray-blue palette'
  },
  {
    id: 'theme-nord',
    label: 'Nord',
    description: 'Soft, cool contrast inspired by Nord colors'
  },
  {
    id: 'theme-carbon',
    label: 'Carbon',
    description: 'Ultra-dark theme with high contrast'
  },
  {
    id: 'theme-glass',
    label: 'Glass',
    description: 'Frosted glass effect with depth'
  }
];


// =====================================================
// Background definitions (global)
// =====================================================

window.BACKGROUNDS = [
  { id: 'bg-plain', label: 'Plain', previewClass: 'bg-preview-plain' },
  { id: 'bg-gradient', label: 'Soft Gradient', previewClass: 'bg-preview-gradient' },
  { id: 'bg-focus', label: 'Focus Glow', previewClass: 'bg-preview-focus' },
  { id: 'bg-glass', label: 'Glass Atmosphere', previewClass: 'bg-preview-glass' },
  { id: 'bg-dotted', label: 'Dotted Pattern', previewClass: 'bg-preview-dotted' },
  { id: 'bg-webbed', label: 'Webbed Pattern', previewClass: 'bg-preview-webbed' },
  { id: 'bg-line-curve', label: 'Line Curve', previewClass: 'bg-preview-line-curve' },
  { id: 'bg-hex', label: 'Hex Pattern', previewClass: 'bg-preview-hex' },
  { id: 'bg-streak', label: 'Streak', previewClass: 'bg-preview-streak' },
  { id: 'bg-circuit', label: 'Circuit Board', previewClass: 'bg-preview-circuit' },
  { id: 'bg-stars', label: 'Stars', previewClass: 'bg-preview-stars' },
];

// =====================================================
// Toggle definitions (CP - data driven)
// =====================================================

window.getToggleByKey = function (key) {
  const toggle = (window.TOGGLE_DEFINITIONS || []).find(t => t.key === key);

  if (!toggle) {
    console.warn(`[Preferences] Toggle not found: ${key}`);
  }

  return toggle;
};

window.TOGGLE_DEFINITIONS = [
  {
    key: 'openLinksInNewTab',
    label: 'Open button links in new tab',
    panel: 'behavior',

    group: 'Buttons',
    order: 3,

    get: () =>
      userPreferences?.behavior?.openLinksInNewTab !== false,

    set: (value) => {
      userPreferences.behavior.openLinksInNewTab = value;
      PreferencesService.save(userPreferences);

      renderCategories(pageCategories);
    }
  },

  {
    key: 'autoCloseDropdowns',
    label: 'Automatically close dropdowns when clicking outside',
    panel: 'behavior',

    group: 'Dropdowns',
    order: 1,

    get: () =>
      userPreferences?.behavior?.autoCloseDropdowns !== false,

    set: (value) => {
      userPreferences.behavior.autoCloseDropdowns = value;
      autoCloseDropdowns = value;

      PreferencesService.save(userPreferences);
    }
  },

  {
    key: 'confirmDeleteButtons',
    label: 'Confirm before deleting buttons',
    panel: 'behavior',

    group: 'Buttons',
    order: 4,

    get: () =>
      userPreferences?.behavior?.confirmDeleteButtons !== false,

    set: (value) => {
      userPreferences.behavior.confirmDeleteButtons = value;

      PreferencesService.save(userPreferences);
    }
  },

  {
    key: 'trackRecents',
    label: 'Track and show recently used buttons',
    panel: 'behavior',

    group: 'Buttons',
    order: 1,

    get: () =>
      userPreferences?.behavior?.trackRecents !== false,

    set: (value) => {
      userPreferences.behavior.trackRecents = value;

      PreferencesService.save(userPreferences);
      renderCategories(pageCategories);
    }
  },

  {
    key: 'storeRecentsAcrossReloads',
    label: 'Store recents between sessions',
    panel: 'behavior',

    group: 'Buttons',
    order: 2,

    get: () =>
      userPreferences?.behavior?.storeRecentsAcrossReloads !== false,

    set: (value) => {
      userPreferences.behavior.storeRecentsAcrossReloads = value;

      PreferencesService.save(userPreferences);
    }
  },

  {
    key: 'enableAnimations',
    label: 'Enable UI animations',
    panel: 'behavior',

    group: 'Accessibility',
    order: 1,

    get: () =>
      userPreferences?.behavior?.enableAnimations !== false,

    set: (value) => {
      userPreferences.behavior.enableAnimations = value;

      PreferencesService.save(userPreferences);
      applyAnimationPreference();
    }
  },
  
  {
    key: 'syncDashboardAppearance',
    label: 'Synchronize theme and background across dashboards',
    panel: 'behavior',

    group: 'Appearance',
    order: 1,

    get: () =>
      userPreferences?.behavior?.syncDashboardAppearance !== false,

    set: async (value) => {
      userPreferences.behavior.syncDashboardAppearance = value;

      await PreferencesService.save(userPreferences);

      if (value && dashboardState) {
        const currentTheme =
        dashboardState?.appearance?.theme ??
        userPreferences.appearance.theme;
        
        const currentBackground =
        dashboardState?.appearance?.background ??
        userPreferences.appearance.background;
        
        userPreferences.appearance.theme = currentTheme;
        userPreferences.appearance.background = currentBackground;
        
        await PreferencesService.save(userPreferences);
        await syncAppearanceToAllDashboards();
      }
      
      applyDashboardAppearance();
    }
  },

  {
    key: 'debugMode',
    label: 'Debug mode',
    panel: 'advanced',

    group: 'Advanced',

    get: () =>
      userPreferences?.behavior?.debugMode === true,

    set: (value) => {
      userPreferences.behavior.debugMode = value;

      PreferencesService.save(userPreferences);

      applyDebugMode();
      renderCategories(pageCategories);
      renderThemeGrid();
      renderBackgroundGrid();
      renderDashboardList();
    }
  },

  {
    key: 'betaUI',
    label: 'Use Beta UI',
    panel: 'advanced',

    group: 'Experimental',
    order: 2,

    get: () =>
      userPreferences?.behavior?.betaUI === true,

    set: async (value) => {
      userPreferences.behavior.betaUI = value;

      await PreferencesService.save(userPreferences);

      applyBetaUI();
    }
  }
];