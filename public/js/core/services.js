// ============================
// Backend / persistence services
// ============================

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
    localStorage.setItem(
      'webdash-ui-cache',
      JSON.stringify({
        theme: prefs.appearance.theme,
        background: prefs.appearance.background
      })
    );

    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs)
    });
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
// =====================================
// Unified user preferences
// =====================================

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

  // Override shared preferences from cookie
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