import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------------
// Path setup
// ------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Frontend directory
const FRONTEND_DIR = path.join(__dirname, "..", "public");


// Data storage directory (per-user files)
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, "..", "data");

function getUserFromRequest(req) {
  const rawUser = req.query.user || "default";

  return rawUser
    .toLowerCase()
    .replace(/[^a-z0-9_-]/gi, "") || "default";
}

function getStorageFile(user) {
  const userDir = path.join(DATA_PATH, "users");

  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  return path.join(userDir, `${user}.json`);
}

function ensureUserStorage(filePath) {
  if (!fs.existsSync(filePath)) {
    const id = `dashboard-${Date.now()}`;

    const initialData = {
      dashboards: {
        [id]: {
          id,
          name: "WebDash",
          identity: {
            name: "WebDash",
            icon: "/assets/webdash-logo.png"
          },
          categories: [],
          order: 0
        }
      },
      activeDashboardId: id,
      defaultDashboardId: id,
      preferences: null
    };

    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
  }
}

// ------------------------------------------------------------------
// Middleware
// ------------------------------------------------------------------

app.use(express.json());
app.use(express.static(FRONTEND_DIR));

// ------------------------------------------------------------------
// Storage helpers
// ------------------------------------------------------------------

function readStorage(req) {
  const user = getUserFromRequest(req);
  const file = getStorageFile(user);

  ensureUserStorage(file);

  try {
    const raw = fs.readFileSync(file, "utf8").trim();
    return raw
      ? JSON.parse(raw)
      : {
          dashboards: {},
          activeDashboardId: null,
          defaultDashboardId: null,
          preferences: null
        };
  } catch (err) {
    console.error(`Storage read failed for user ${user}:`, err);
    return {
      dashboards: {},
      activeDashboardId: null,
      defaultDashboardId: null,
      preferences: null
    };
  }
}

function writeStorage(req, data) {
  const user = getUserFromRequest(req);
  const file = getStorageFile(user);

  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Storage write failed for user ${user}:`, err);
  }
}

// ------------------------------------------------------------------
// API routes
// ------------------------------------------------------------------

app.get('/api/users', (req, res) => {
  const userDir = path.join(DATA_PATH, "users");

  if (!fs.existsSync(userDir)) {
    return res.json([]);
  }

  const users = fs.readdirSync(userDir)
    .map(file => file.replace('.json', ''));

  users.sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  res.json(users);
});

app.post('/api/users', (req, res) => {
  const { user } = req.body;

  if (!user || typeof user !== 'string') {
    return res.status(400).json({ error: 'Invalid user name' });
  }

  const sanitized = user
    .toLowerCase()
    .replace(/[^a-z0-9_-]/gi, "");

  if (!sanitized) {
    return res.status(400).json({ error: 'Invalid user name' });
  }

  const file = getStorageFile(sanitized);

  if (fs.existsSync(file)) {
    return res.status(409).json({ error: 'User already exists' });
  }

  ensureUserStorage(file);

  // Ensure file is fully written before response
  fs.readFileSync(file, "utf8");

  res.sendStatus(201);
});

app.post('/api/users/:user/rename', (req, res) => {
  const oldUser = req.params.user;
  const { newName } = req.body;

  if (!newName || typeof newName !== 'string') {
    return res.status(400).json({ error: 'Invalid name' });
  }

  const sanitized = newName
    .toLowerCase()
    .replace(/[^a-z0-9_-]/gi, "");

  if (!sanitized) {
    return res.status(400).json({ error: 'Invalid name' });
  }

  const oldFile = getStorageFile(oldUser);
  const newFile = getStorageFile(sanitized);

  if (!fs.existsSync(oldFile)) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (fs.existsSync(newFile)) {
    return res.status(409).json({ error: 'User already exists' });
  }

  fs.renameSync(oldFile, newFile);

  try {
    const data = JSON.parse(fs.readFileSync(newFile, "utf8"));

    if (!data.activeDashboardId || !data.defaultDashboardId) {
      return res.status(500).json({ error: 'Corrupt user data after rename' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to validate renamed user' });
  }

  res.sendStatus(204);
});

app.delete('/api/users/:user', (req, res) => {
  const user = req.params.user;
  const file = getStorageFile(user);

  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'User not found' });
  }

  fs.unlinkSync(file);

  res.sendStatus(204);
});

app.get('/api/dashboard', (req, res) => {
  const data = readStorage(req);
  res.json(data.dashboards[data.activeDashboardId] || null);
});

app.post('/api/dashboard', (req, res) => {
  const data = readStorage(req);
  const existing = data.dashboards[data.activeDashboardId] || {};

  data.dashboards[data.activeDashboardId] = {
    ...req.body,
    order: existing.order ?? req.body.order ?? 0
  };
  
  writeStorage(req, data)
  res.sendStatus(204);
});

app.get('/api/preferences', (req, res) => {
  const data = readStorage(req);
  res.json(data.preferences);
});

app.post('/api/preferences', (req, res) => {
  const data = readStorage(req);
  data.preferences = req.body;
  writeStorage(req, data)
  res.sendStatus(204);
});

app.get('/api/dashboards', (req, res) => {
  const data = readStorage(req);

  const dashboards = Object.entries(data.dashboards || {}).map(
    ([id, dashboard]) => ({
      id,
      name: dashboard?.name || "WebDash",
      order: dashboard?.order ?? 0
    })
  );

  dashboards.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  res.json(dashboards);
});

app.get('/api/dashboards/active', (req, res) => {
  const data = readStorage(req);
  res.json({ activeDashboardId: data.activeDashboardId });
});

app.post('/api/dashboards/active', (req, res) => {
  const { dashboardId } = req.body;
  const data = readStorage(req);

  if (!dashboardId || !data.dashboards[dashboardId]) {
    return res.status(400).json({ error: 'Invalid dashboardId' });
  }

  data.activeDashboardId = dashboardId;
  writeStorage(req, data)

  res.sendStatus(204);
});

app.get('/api/dashboards/default', (req, res) => {
  const data = readStorage(req);
  res.json({ defaultDashboardId: data.defaultDashboardId });
});

app.post('/api/dashboards/default', (req, res) => {
  const { dashboardId } = req.body;
  const data = readStorage(req);

  if (!dashboardId || !data.dashboards[dashboardId]) {
    return res.status(400).json({ error: 'Invalid dashboardId' });
  }

  data.defaultDashboardId = dashboardId;
  writeStorage(req, data)
  res.sendStatus(204);
});

app.post('/api/dashboards', (req, res) => {
  const { dashboardId, dashboardData } = req.body;

  const data = readStorage(req);

  if (!dashboardId) {
    return res.status(400).json({ error: 'dashboardId is required' });
  }

  if (data.dashboards[dashboardId]) {
    return res.status(409).json({ error: 'Dashboard already exists' });
  }

  // Get all existing dashboards
  const existingDashboards = Object.values(data.dashboards);

  // Compute next order safely
  const nextOrder = existingDashboards.length > 0
    ? Math.max(...existingDashboards.map(d => d?.order ?? -1)) + 1
    : 0;

  // Create dashboard WITH order
  data.dashboards[dashboardId] = {
    id: dashboardId,
    name: dashboardData?.name ?? "WebDash",
    identity: {
      name: dashboardData?.name ?? "WebDash",
      icon: "/assets/webdash-logo.png"
    },
    categories: dashboardData?.categories ?? [],
    order: nextOrder
  };

  // Set as active
  data.activeDashboardId = dashboardId;

  writeStorage(req, data)

  res.sendStatus(201);
});

app.delete('/api/dashboards/:id', (req, res) => {
  const dashboardId = req.params.id;
  const data = readStorage(req);

  if (!data.dashboards[dashboardId]) {
    return res.status(404).json({ error: 'Dashboard not found' });
  }

  delete data.dashboards[dashboardId];

  if (data.activeDashboardId === dashboardId) {
    data.activeDashboardId = Object.keys(data.dashboards)[0] || null;
  }

  if (data.defaultDashboardId === dashboardId) {
    data.defaultDashboardId = Object.keys(data.dashboards)[0] || null;
  }

  writeStorage(req, data)
  res.sendStatus(204);
});

app.post('/api/dashboards/:id/rename', (req, res) => {
  const dashboardId = req.params.id;
  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Invalid dashboard name' });
  }

  const data = readStorage(req);
  const dashboard = data.dashboards[dashboardId];

  if (!dashboard) {
    return res.status(404).json({ error: 'Dashboard not found' });
  }

  dashboard.name = name.trim();
  writeStorage(req, data)

  res.sendStatus(204);
});

app.post('/api/dashboards/reorder', (req, res) => {
  const updates = req.body; // [{ id }]
  const data = readStorage(req);

  updates.forEach(({ id }, index) => {
    if (data.dashboards[id]) {
      data.dashboards[id].order = index;
    }
  });

  // Ensure no dashboard is missing order
  Object.keys(data.dashboards).forEach((id, index) => {
    if (typeof data.dashboards[id].order !== 'number') {
      data.dashboards[id].order = index;
    }
  });

  writeStorage(req, data)
  res.sendStatus(204);
});

app.get('/api/dashboards/full', (req, res) => {
  const data = readStorage(req);

  res.json({
    dashboards: data.dashboards,
    activeDashboardId: data.activeDashboardId,
    defaultDashboardId: data.defaultDashboardId
  });
});

app.get('/api/dashboards/:id', (req, res) => {
  const data = readStorage(req);
  const { id } = req.params;

  const dashboard = data.dashboards[id];

  if (!dashboard || dashboard.id !== id) {
    return res.status(404).send('Dashboard not found');
  }

  res.json(dashboard);
});

// ------------------------------------------------------------------
// Start server (ONLY ONCE)
// ------------------------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(`WebDash running on port ${PORT}`);
});