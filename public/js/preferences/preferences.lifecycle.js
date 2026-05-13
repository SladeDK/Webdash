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

window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    const savedTheme = localStorage.getItem(THEME_KEY);

    if (savedTheme === 'system') {
      setActiveTheme('system');
    }
});

// ======================================================================
// PREFERENCES INITIALIZATION
// ======================================================================