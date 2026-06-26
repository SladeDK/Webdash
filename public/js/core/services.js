// ============================
// Backend / persistence services
// ============================

function getActiveUser() {
  const url = new URL(window.location.href);
  return url.searchParams.get('user') || 'default';
}

function buildUrl(path) {
  const user = getActiveUser();
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}user=${user}`;
}

const DashboardService = {
	
  async load() {
    const res = await fetch(buildUrl('/api/dashboard'));
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  async save(dashboardState) {
    await fetch(buildUrl('/api/dashboard'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dashboardState)
    });
  },

  async listDashboards() {
    const res = await fetch(buildUrl('/api/dashboards'));
    if (!res.ok) return [];
    return await res.json();
  },

  async getActiveDashboardId() {
    const res = await fetch(buildUrl('/api/dashboards/active'));
    if (!res.ok) return null;
    const data = await res.json();
    return data.activeDashboardId;
  },

  async setActiveDashboardId(dashboardId) {
    await fetch(buildUrl('/api/dashboards/active'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardId })
    });
  },

  async createDashboard({ id, name }) {
    await fetch(buildUrl('/api/dashboards'), {
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
    const res = await fetch(buildUrl('/api/dashboards/default'));
    if (!res.ok) return null;
    const data = await res.json();
    return data.defaultDashboardId;
  },

  async setDefaultDashboardId(dashboardId) {
    await fetch(buildUrl('/api/dashboards/default'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardId })
    });
  },

  async loadDashboardById(dashboardId) {
    const res = await fetch(buildUrl(`/api/dashboards/${dashboardId}`));
    if (!res.ok) return null;
    return await res.json();
  },

  async loadAllDashboards() {
    const res = await fetch(buildUrl('/api/dashboards/full'));
    if (!res.ok) return {};
    const data = await res.json();
    return data.dashboards || {};
  },
};

const UserService = {
  async listUsers() {
    const res = await fetch('/api/users');
    if (!res.ok) return [];
    return await res.json();
  },

  async createUser(user) {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user })
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }
  },
  
  async renameUser(oldUser, newName) {
    const res = await fetch(`/api/users/${oldUser}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName })
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }
  },

  async deleteUser(user) {
    const res = await fetch(`/api/users/${user}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }
  }
};


const PreferencesService = {
  async load() {
    const res = await fetch(buildUrl('/api/preferences'));

    if (!res.ok) return null;

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  async save(prefs) {
    localStorage.setItem(
      'webdash-ui-cache',
      JSON.stringify({
        theme: prefs.appearance.theme,
        background: prefs.appearance.background
      })
    );

    await fetch(buildUrl('/api/preferences'), {
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
  const appearance = prefs?.appearance || {};
  const behavior = prefs?.behavior || {};

  return {
    appearance: {
      theme: appearance.theme,
      background: appearance.background
    },
    behavior: { ...behavior }
  };
}

function applySharedPreferences(targetPrefs, sharedPrefs) {
  if (!sharedPrefs) return;

  if (!targetPrefs.appearance) targetPrefs.appearance = {};
  if (!targetPrefs.behavior) targetPrefs.behavior = {};

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