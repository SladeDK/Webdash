// =========================================
// Appearance validators
// =========================================

function isValidTheme(theme) {
  return typeof theme === 'string' &&
    (window.THEMES || []).some(t => t.id === theme);
}

function isValidBackground(bg) {
  return typeof bg === 'string' &&
    (window.BACKGROUNDS || []).some(b => b.id === bg);
}

function validateAppearance(prefs) {
  const defaults = createDefaultPreferences();
  const warnings = [];

  // Ensure structure exists
  if (!prefs || typeof prefs !== 'object') {
    prefs = {};
  }

  if (!prefs.appearance) {
    prefs.appearance = structuredClone(defaults.appearance);
  }

  // Validate theme
  // (warnings are plain strings — consumers check warnings.includes('theme'))
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

// Accepts anything people realistically point a homelab dashboard at:
// - dotted domains (example.com)
// - IPv4 addresses (192.168.1.10)
// - IPv6 addresses ([::1] — URL.hostname keeps the brackets)
// - single-label intranet hosts (localhost, nas, proxmox)
function isValidHostname(hostname) {
  if (!hostname || hostname.length > 253) return false;

  // IPv6 (already bracketed and parsed by URL, so trust it)
  if (hostname.startsWith('[') && hostname.endsWith(']')) return true;

  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return hostname.split('.').every(octet => Number(octet) <= 255);
  }

  // Domain or single-label host (each label: letters/digits/hyphens,
  // no leading/trailing hyphen)
  return hostname
    .split('.')
    .every(label =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)
    );
}

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

      if (!isValidHostname(parsed.hostname)) {
        errors.url = 'Please enter a valid URL (e.g. example.com or 192.168.1.10:8080)';
      }
    } catch {
      errors.url = 'Please enter a valid URL (e.g. example.com or 192.168.1.10:8080)';
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