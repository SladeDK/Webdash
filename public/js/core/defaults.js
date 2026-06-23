// =====================================================
// Default state & templates
// =====================================================

const DEFAULT_DASHBOARD_STATE = {
  id: null,
  name: "WebDash",
  identity: {
    name: "WebDash",
    icon: null,
  },
  categories: [
    {
      id: "cat-getting-started",
      title: "Getting Started",
      order: 0,
      visible: true,
      items: [
        {
          id: "btn-docs",
          label: "WebDash Github",
          url: "https://github.com/SladeDK/Webdash",
          order: 0,
        },
        {
          id: "btn-settings",
          label: "Google",
          url: "https://google.com",
          order: 1,
        },
      ]
    }
  ]
};

function getDefaultDashboardTemplate(overrides = {}) {
  const base = structuredClone(DEFAULT_DASHBOARD_STATE);

  const dashboardName = overrides.name ?? base.name;

  return {
    ...base,
    id: overrides.id ?? base.id ?? 'default',
    name: dashboardName,
    identity: {
      name: dashboardName,
      icon: '/assets/webdash-logo.png'
    }
  };
}

function createDefaultPreferences() {
  return {
    appearance: {
      theme: 'system',
      background: 'bg-plain',
      identity: {
        name: INITIAL_IDENTITY.name,
        icon: INITIAL_IDENTITY.icon,
        syncWithDashboard: true
      }
    },
    behavior: {}
  };
}