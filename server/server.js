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
const USER_DIR = path.join(DATA_PATH, "users");

// Rolling backups: each user gets a folder of timestamped snapshots,
// written automatically before every save. BACKUP_KEEP controls retention.
const BACKUP_DIR = path.join(DATA_PATH, "backups");
const BACKUP_KEEP = Math.max(0, Number(process.env.BACKUP_KEEP ?? 10) || 0);

// ------------------------------------------------------------------
// User name sanitization (single source of truth)
// ------------------------------------------------------------------

const MAX_USER_NAME_LENGTH = 64;

// Windows reserved device names — cannot be used as file names
const RESERVED_NAMES = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"
]);

// Returns a safe user name, or null when nothing valid remains.
// Only [a-z0-9_-] survives, so the result can never traverse paths.
function sanitizeUser(raw) {
  if (typeof raw !== "string") return null;

  const sanitized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, MAX_USER_NAME_LENGTH);

  if (!sanitized || RESERVED_NAMES.has(sanitized)) return null;

  return sanitized;
}

function getUserFromRequest(req) {
  return sanitizeUser(req.query.user) || "default";
}

function getStorageFile(user) {
  if (!fs.existsSync(USER_DIR)) {
    fs.mkdirSync(USER_DIR, { recursive: true });
  }

  const file = path.join(USER_DIR, `${user}.json`);

  // Defense in depth: the sanitizer already prevents traversal,
  // but never allow a resolved path outside the users directory.
  if (!path.resolve(file).startsWith(path.resolve(USER_DIR) + path.sep)) {
    throw new Error(`Refusing unsafe storage path for user "${user}"`);
  }

  return file;
}

function createInitialData() {
  const id = `dashboard-${Date.now()}`;

  return {
    dashboards: {
      [id]: {
        id,
        name: "WebDash",
        identity: {
          name: "WebDash",
          icon: "/assets/webdash-logo.png"
        },
        // Starter content so a fresh user doesn't land on an empty page
        // (mirrors DEFAULT_DASHBOARD_STATE in public/js/core/defaults.js)
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
                order: 0
              },
              {
                id: "btn-settings",
                label: "Google",
                url: "https://google.com",
                order: 1
              }
            ]
          }
        ],
        order: 0
      }
    },
    activeDashboardId: id,
    defaultDashboardId: id,
    preferences: null
  };
}

function ensureUserStorage(filePath) {
  if (!fs.existsSync(filePath)) {
    writeJsonAtomic(filePath, createInitialData());
  }
}

// ------------------------------------------------------------------
// Middleware
// ------------------------------------------------------------------

// Dashboard states may contain base64 identity icons — allow room for them.
app.use(express.json({ limit: "10mb" }));
app.use(express.static(FRONTEND_DIR));

// ------------------------------------------------------------------
// Storage helpers
// ------------------------------------------------------------------

// Atomic write: write to a temp file, then rename over the target.
// A crash mid-write can no longer corrupt existing user data.
function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;

  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));

  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Windows can refuse to rename over a locked file — fall back to copy.
    fs.copyFileSync(tmpPath, filePath);
    fs.unlinkSync(tmpPath);
  }
}

const EMPTY_STORAGE = {
  dashboards: {},
  activeDashboardId: null,
  defaultDashboardId: null,
  preferences: null
};

// ------------------------------------------------------------------
// Rolling backups
// ------------------------------------------------------------------

// Backups live in a per-user subfolder. The name is derived from the
// (already sanitized) user name, so it can never escape BACKUP_DIR.
function getUserBackupDir(user) {
  const dir = path.join(BACKUP_DIR, user);

  if (!path.resolve(dir).startsWith(path.resolve(BACKUP_DIR) + path.sep)) {
    throw new Error(`Refusing unsafe backup path for user "${user}"`);
  }

  return dir;
}

function listBackups(user) {
  const dir = getUserBackupDir(user);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      const stat = fs.statSync(path.join(dir, f));
      return { name: f, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    // Newest first
    .sort((a, b) => b.name.localeCompare(a.name));
}

// Snapshot the current on-disk file before it gets overwritten.
// Failure here must never block a save, so everything is best-effort.
function snapshotBackup(user, sourceFile) {
  if (BACKUP_KEEP <= 0) return;
  if (!fs.existsSync(sourceFile)) return;

  try {
    const dir = getUserBackupDir(user);
    fs.mkdirSync(dir, { recursive: true });

    // Sortable, filesystem-safe timestamp: 2026-07-06T09-10-00-000Z
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(dir, `${stamp}.json`);

    fs.copyFileSync(sourceFile, target);

    // Prune oldest beyond the retention count
    const backups = fs.readdirSync(dir)
      .filter(f => f.endsWith(".json"))
      .sort();

    while (backups.length > BACKUP_KEEP) {
      const oldest = backups.shift();
      try {
        fs.unlinkSync(path.join(dir, oldest));
      } catch (err) {
        console.warn(`Failed to prune backup ${oldest}:`, err.message);
      }
    }
  } catch (err) {
    console.warn(`Backup snapshot failed for user ${user}:`, err.message);
  }
}

function readStorage(req) {
  const user = getUserFromRequest(req);
  const file = getStorageFile(user);

  ensureUserStorage(file);

  try {
    const raw = fs.readFileSync(file, "utf8").trim();
    return raw ? JSON.parse(raw) : structuredClone(EMPTY_STORAGE);
  } catch (err) {
    console.error(`Storage read failed for user ${user}:`, err);
    return structuredClone(EMPTY_STORAGE);
  }
}

// Returns true on success so routes can surface failures to the client.
function writeStorage(req, data) {
  const user = getUserFromRequest(req);
  const file = getStorageFile(user);

  // Snapshot the previous state before overwriting (best-effort)
  snapshotBackup(user, file);

  try {
    writeJsonAtomic(file, data);
    return true;
  } catch (err) {
    console.error(`Storage write failed for user ${user}:`, err);
    return false;
  }
}

function commitStorage(req, res, data, status = 204) {
  if (!writeStorage(req, data)) {
    return res.status(500).json({ error: "Failed to persist data" });
  }
  res.sendStatus(status);
}

// ------------------------------------------------------------------
// API routes — health
// ------------------------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.round(process.uptime())
  });
});

// ------------------------------------------------------------------
// API routes — backups
// ------------------------------------------------------------------

// List available snapshots for the current user (newest first)
app.get('/api/backups', (req, res) => {
  const user = getUserFromRequest(req);

  try {
    res.json(listBackups(user));
  } catch (err) {
    console.error(`Failed to list backups for ${user}:`, err);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// Restore a snapshot. The current state is itself snapshotted first,
// so a restore is always reversible.
app.post('/api/backups/restore', (req, res) => {
  const user = getUserFromRequest(req);
  const name = req.body?.name;

  // Only accept a bare snapshot filename — no path segments
  if (typeof name !== 'string' || !/^[\w.\-]+\.json$/.test(name) || name.includes('..')) {
    return res.status(400).json({ error: 'Invalid backup name' });
  }

  let backupFile;
  try {
    backupFile = path.join(getUserBackupDir(user), name);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid backup name' });
  }

  if (!fs.existsSync(backupFile)) {
    return res.status(404).json({ error: 'Backup not found' });
  }

  let restored;
  try {
    restored = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  } catch (err) {
    return res.status(500).json({ error: 'Backup file is corrupt' });
  }

  const targetFile = getStorageFile(user);

  // Snapshot current state (so the restore can be undone), then write
  snapshotBackup(user, targetFile);

  try {
    writeJsonAtomic(targetFile, restored);
  } catch (err) {
    console.error(`Restore failed for ${user}:`, err);
    return res.status(500).json({ error: 'Failed to restore backup' });
  }

  res.sendStatus(204);
});

// ------------------------------------------------------------------
// API routes — users
// ------------------------------------------------------------------

app.get('/api/users', (req, res) => {
  if (!fs.existsSync(USER_DIR)) {
    return res.json([]);
  }

  const users = fs.readdirSync(USER_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => path.basename(file, '.json'));

  users.sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  res.json(users);
});

app.post('/api/users', (req, res) => {
  const sanitized = sanitizeUser(req.body?.user);

  if (!sanitized) {
    return res.status(400).json({ error: 'Invalid user name' });
  }

  const file = getStorageFile(sanitized);

  if (fs.existsSync(file)) {
    return res.status(409).json({ error: 'User already exists' });
  }

  ensureUserStorage(file);

  res.sendStatus(201);
});

app.post('/api/users/:user/rename', (req, res) => {
  const oldUser = sanitizeUser(req.params.user);
  const newUser = sanitizeUser(req.body?.newName);

  if (!oldUser) {
    return res.status(400).json({ error: 'Invalid user name' });
  }

  if (!newUser) {
    return res.status(400).json({ error: 'Invalid name' });
  }

  const oldFile = getStorageFile(oldUser);
  const newFile = getStorageFile(newUser);

  if (!fs.existsSync(oldFile)) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (fs.existsSync(newFile)) {
    return res.status(409).json({ error: 'User already exists' });
  }

  fs.renameSync(oldFile, newFile);

  // Move the backup folder along with the user (best-effort)
  try {
    const oldBackups = getUserBackupDir(oldUser);
    const newBackups = getUserBackupDir(newUser);
    if (fs.existsSync(oldBackups) && !fs.existsSync(newBackups)) {
      fs.renameSync(oldBackups, newBackups);
    }
  } catch (err) {
    console.warn(`Failed to move backups during rename:`, err.message);
  }

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
  const user = sanitizeUser(req.params.user);

  if (!user) {
    return res.status(400).json({ error: 'Invalid user name' });
  }

  const file = getStorageFile(user);

  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'User not found' });
  }

  fs.unlinkSync(file);

  // Remove the user's backups too (best-effort)
  try {
    const backups = getUserBackupDir(user);
    if (fs.existsSync(backups)) {
      fs.rmSync(backups, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`Failed to remove backups for ${user}:`, err.message);
  }

  res.sendStatus(204);
});

// ------------------------------------------------------------------
// API routes — active dashboard state
// ------------------------------------------------------------------

app.get('/api/dashboard', (req, res) => {
  const data = readStorage(req);
  res.json(data.dashboards[data.activeDashboardId] || null);
});

app.post('/api/dashboard', (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid dashboard payload' });
  }

  const data = readStorage(req);

  if (!data.activeDashboardId) {
    return res.status(409).json({ error: 'No active dashboard' });
  }

  const existing = data.dashboards[data.activeDashboardId] || {};

  data.dashboards[data.activeDashboardId] = {
    ...req.body,
    order: existing.order ?? req.body.order ?? 0
  };

  commitStorage(req, res, data);
});

// ------------------------------------------------------------------
// API routes — preferences
// ------------------------------------------------------------------

app.get('/api/preferences', (req, res) => {
  const data = readStorage(req);
  res.json(data.preferences);
});

app.post('/api/preferences', (req, res) => {
  const data = readStorage(req);
  data.preferences = req.body;
  commitStorage(req, res, data);
});

// ------------------------------------------------------------------
// API routes — dashboard collection
// ------------------------------------------------------------------

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
  commitStorage(req, res, data);
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
  commitStorage(req, res, data);
});

app.post('/api/dashboards', (req, res) => {
  const { dashboardId, dashboardData } = req.body;

  if (!dashboardId || typeof dashboardId !== 'string' || dashboardId.length > 128) {
    return res.status(400).json({ error: 'dashboardId is required' });
  }

  const data = readStorage(req);

  if (data.dashboards[dashboardId]) {
    return res.status(409).json({ error: 'Dashboard already exists' });
  }

  // Compute next order safely
  const existingDashboards = Object.values(data.dashboards);
  const nextOrder = existingDashboards.length > 0
    ? Math.max(...existingDashboards.map(d => d?.order ?? -1)) + 1
    : 0;

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

  commitStorage(req, res, data, 201);
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

  commitStorage(req, res, data);
});

app.post('/api/dashboards/:id/rename', (req, res) => {
  const dashboardId = req.params.id;
  const { name } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Invalid dashboard name' });
  }

  const data = readStorage(req);
  const dashboard = data.dashboards[dashboardId];

  if (!dashboard) {
    return res.status(404).json({ error: 'Dashboard not found' });
  }

  dashboard.name = name.trim();
  commitStorage(req, res, data);
});

app.post('/api/dashboards/reorder', (req, res) => {
  const updates = req.body; // [{ id, order }]

  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'Expected an array of dashboards' });
  }

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

  commitStorage(req, res, data);
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
    return res.status(404).json({ error: 'Dashboard not found' });
  }

  res.json(dashboard);
});

// ------------------------------------------------------------------
// Error handling
// ------------------------------------------------------------------

// Unknown API routes get JSON, not the SPA fallback / HTML 404
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  // Malformed JSON body or payload over the size limit
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' });
  }

  console.error('[WebDash] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ------------------------------------------------------------------
// Start server
// ------------------------------------------------------------------

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`WebDash running on port ${PORT}`);
  console.log(`Data directory: ${path.resolve(DATA_PATH)}`);
});

// Graceful shutdown (Docker sends SIGTERM on stop)
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down…`);
    server.close(() => process.exit(0));

    // Force-exit if connections refuse to drain
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
