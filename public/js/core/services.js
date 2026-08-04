// ============================
// Backend / persistence services
// ============================

function getActiveUser() {
  const url = new URL(window.location.href);

  const paramUser = url.searchParams.get('user');
  const storedUser = localStorage.getItem('webdash-last-user');

  // URL always wins
  if (paramUser) {
    localStorage.setItem('webdash-last-user', paramUser);
    return paramUser;
  }

  // fallback to last used user
  if (storedUser) {
    return storedUser;
  }

  return 'default';
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

  // Full system snapshot in one request:
  // { dashboards, activeDashboardId, defaultDashboardId }
  async loadFullState() {
    const res = await fetch(buildUrl('/api/dashboards/full'));
    if (!res.ok) return null;
    return await res.json();
  },

  // Apply theme/background to every dashboard in a single request
  async applyAppearanceToAll(appearance) {
    await fetch(buildUrl('/api/dashboards/appearance'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appearance)
    });
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
    // (The pre-paint cache — 'webdash-ui-cache' — is written by
    // setActiveTheme/setActiveBackground with the RESOLVED values.)
    await fetch(buildUrl('/api/preferences'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs)
    });
  }
};

const BackupService = {
  async list() {
    const res = await fetch(buildUrl('/api/backups'));
    if (!res.ok) return [];
    return await res.json();
  },

  async restore(name) {
    const res = await fetch(buildUrl('/api/backups/restore'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }
  }
};

