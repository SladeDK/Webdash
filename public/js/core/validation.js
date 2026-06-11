// =========================================
// Appearance validators
// =========================================

const VALID_THEMES = [
  'system',
  'theme-dark',
  'theme-light',
  'theme-midnight',
  'theme-slate',
  'theme-nord',
  'theme-carbon',
  'theme-glass'
];

const VALID_BACKGROUNDS = [
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
	'bg-circuit'
];

function isValidTheme(theme) {
  return typeof theme === 'string' && VALID_THEMES.includes(theme);
}

function isValidBackground(bg) {
  return typeof bg === 'string' && VALID_BACKGROUNDS.includes(bg);
}

function validateAppearance(prefs) {
  const defaults = createDefaultPreferences();
  const warnings = [];

  // Ensure structure exists
  if (!prefs.appearance) {
    prefs.appearance = structuredClone(defaults.appearance);
  }

  // Validate theme
  if (!isValidTheme(prefs.appearance.theme)) {
    prefs.appearance.theme = defaults.appearance.theme;
    warnings.push('theme');
  }

  // Validate background
  if (!isValidBackground(prefs.appearance.background)) {
    prefs.appearance.background = defaults.appearance.background;
    warnings.push('background');
  }

  return { prefs, warnings };
}

// =========================================
// Button / Item validators
// =========================================

function validateButtonInput({ label, url, existingItems, currentItemId }) {
  const errors = {};

  // Validate label
  if (!label) {
    errors.label = 'Button name is required.';
  } else {
		const items = Array.isArray(existingItems) ? existingItems : [];

		const duplicateName = items.some(item =>
			item.label.toLowerCase() === label.toLowerCase() &&
			item.id !== currentItemId
		);

    if (duplicateName) {
      errors.label = 'A button with this name already exists.';
    }
  }

  // Validate URL presence
  if (!url) {
    errors.url = 'URL is required.';
  }

  let normalizedUrl = url;

  // Normalize URL
  if (url && !/^https?:\/\//i.test(url)) {
    normalizedUrl = `https://${url}`;
  }

  // Validate URL structure
  if (url) {
    try {
      const parsed = new URL(normalizedUrl);
      const hostname = parsed.hostname;

      const hostnameIsValid =
        /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i
          .test(hostname);

      if (!hostnameIsValid) {
        errors.url = 'Please enter a valid URL (e.g. example.com)';
      }
    } catch {
      errors.url = 'Please enter a valid URL (e.g. example.com)';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalizedUrl
  };
}

// =====================================================
// Validate system import structure and content
// =====================================================

const CURRENT_SCHEMA_VERSION = 2;

function validateSystemImportPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid import file');
  }

  if (typeof payload.schemaVersion !== 'number') {
    throw new Error('Missing schema version');
  }

  if (payload.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Import file is from a newer version (v${payload.schemaVersion})`
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