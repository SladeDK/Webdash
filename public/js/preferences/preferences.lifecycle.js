// ======================================================================
// PREFERENCES LIFECYCLE
// ======================================================================
//
// Owns automatic reactions to application and environment lifecycle
// events related to preferences.
//
// Responsibilities:
// - React to system-level changes (e.g. system theme changes)
// - Apply preferences automatically when external conditions change
//
// Does NOT:
// - Wire UI interactions
// - Own preference state mutation logic
// - Handle import, export, or reset workflows
//
// This file contains non-user-initiated preference behavior.
//


// ======================================================================
// APPEARANCE LIFECYCLE
// ======================================================================

if (!window.__preferencesLifecycleWired__) {
  window.__preferencesLifecycleWired__ = true;

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  mediaQuery.addEventListener('change', () => {
    const savedTheme = userPreferences?.appearance?.theme;

    if (savedTheme === 'system') {
      setActiveTheme('system');
    }
  });
}

// ======================================================================
// PREFERENCES INITIALIZATION
// ======================================================================