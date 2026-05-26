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

// Data storage directory and file
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, "..", "data");
const STORAGE_FILE = path.join(DATA_PATH, "storage.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_PATH)) {
  fs.mkdirSync(DATA_PATH, { recursive: true });
}

// Ensure storage file exists
if (!fs.existsSync(STORAGE_FILE)) {
  fs.writeFileSync(
    STORAGE_FILE,
    JSON.stringify(
      {
        dashboards: { default: null },
        activeDashboardId: "default",
        defaultDashboardId: "default",
        preferences: null
      },
      null,
      2
    )
  );
}

// ------------------------------------------------------------------
// Middleware
// ------------------------------------------------------------------

app.use(express.json());
app.use(express.static(FRONTEND_DIR));

// ------------------------------------------------------------------
// Storage helpers
// ------------------------------------------------------------------

function readStorage() {
  try {
    const raw = fs.readFileSync(STORAGE_FILE, "utf8").trim();
    return raw
      ? JSON.parse(raw)
      : {
          dashboards: { default: null },
          activeDashboardId: "default",
          defaultDashboardId: "default",
          preferences: null
        };
  } catch (err) {
    console.error("Storage read failed, resetting:", err);
    return {
      dashboards: { default: null },
      activeDashboardId: "default",
      defaultDashboardId: "default",
      preferences: null
    };
  }
}

function writeStorage(data) {
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
}

// ------------------------------------------------------------------
// API routes
// ------------------------------------------------------------------
app.get('/api/dashboard', (req, res) => {
  const data = readStorage();
  res.json(data.dashboards[data.activeDashboardId]);
});

app.post('/api/dashboard', (req, res) => {
  const data = readStorage();
  const existing = data.dashboards[data.activeDashboardId] || {};

  data.dashboards[data.activeDashboardId] = {
    ...req.body,
    order: existing.order ?? req.body.order ?? 0
  };
  
  writeStorage(data);
  res.sendStatus(204);
});

app.get('/api/preferences', (req, res) => {
  const data = readStorage();
  res.json(data.preferences);
});

app.post('/api/preferences', (req, res) => {
  const data = readStorage();
  data.preferences = req.body;
  writeStorage(data);
  res.sendStatus(204);
});

app.get('/api/dashboards', (req, res) => {
  const data = readStorage();

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
  const data = readStorage();
  res.json({ activeDashboardId: data.activeDashboardId });
});

app.post('/api/dashboards/active', (req, res) => {
  const { dashboardId } = req.body;
  const data = readStorage();

  if (!dashboardId || !data.dashboards[dashboardId]) {
    return res.status(400).json({ error: 'Invalid dashboardId' });
  }

  data.activeDashboardId = dashboardId;
  writeStorage(data);

  res.sendStatus(204);
});

app.get('/api/dashboards/default', (req, res) => {
  const data = readStorage();
  res.json({ defaultDashboardId: data.defaultDashboardId });
});

app.post('/api/dashboards/default', (req, res) => {
  const { dashboardId } = req.body;
  const data = readStorage();

  if (!dashboardId || !data.dashboards[dashboardId]) {
    return res.status(400).json({ error: 'Invalid dashboardId' });
  }

  data.defaultDashboardId = dashboardId;
  writeStorage(data);
  res.sendStatus(204);
});

app.post('/api/dashboards', (req, res) => {
  const { dashboardId, dashboardData } = req.body;

  const data = readStorage();

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
    ...(dashboardData ?? { categories: [] }),
    order: nextOrder
  };

  // Set as active
  data.activeDashboardId = dashboardId;

  writeStorage(data);

  res.sendStatus(201);
});

app.delete('/api/dashboards/:id', (req, res) => {
  const dashboardId = req.params.id;
  const data = readStorage();

  if (!data.dashboards[dashboardId]) {
    return res.status(404).json({ error: 'Dashboard not found' });
  }

  delete data.dashboards[dashboardId];

  if (data.activeDashboardId === dashboardId) {
    data.activeDashboardId = Object.keys(data.dashboards)[0] || 'default';
  }

  writeStorage(data);
  res.sendStatus(204);
});

app.post('/api/dashboards/:id/rename', (req, res) => {
  const dashboardId = req.params.id;
  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Invalid dashboard name' });
  }

  const data = readStorage();
  const dashboard = data.dashboards[dashboardId];

  if (!dashboard) {
    return res.status(404).json({ error: 'Dashboard not found' });
  }

  dashboard.name = name.trim();
  writeStorage(data);

  res.sendStatus(204);
});

app.post('/api/dashboards/reorder', (req, res) => {
  const updates = req.body; // [{ id }]
  const data = readStorage();

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

  writeStorage(data);
  res.sendStatus(204);
});

// ------------------------------------------------------------------
// Start server (ONLY ONCE)
// ------------------------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(`WebDash running on port ${PORT}`);
});