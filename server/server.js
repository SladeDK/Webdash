import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

const app = express();
const PORT = 3001;

// ------------------------------------------------------------------
// Path setup (MUST come before STORAGE_FILE is used)
// ------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Frontend directory (Option 3)
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// Data storage file
const STORAGE_FILE = path.join(__dirname, 'storage.json');

// ------------------------------------------------------------------
// Middleware
// ------------------------------------------------------------------
app.use(express.json());

// CORS is optional now since same-origin, but safe to keep
// app.use(cors());

// Serve frontend
app.use(express.static(FRONTEND_DIR));

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ------------------------------------------------------------------
// Ensure storage file exists
// ------------------------------------------------------------------
if (!fs.existsSync(STORAGE_FILE)) {
  fs.writeFileSync(
    STORAGE_FILE,
    JSON.stringify(
      {
        dashboards: { default: null },
        activeDashboardId: 'default',
        preferences: null
      },
      null,
      2
    )
  );
}

// ------------------------------------------------------------------
// Storage helpers
// ------------------------------------------------------------------
function readStorage() {
  try {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf8').trim();
    if (!raw) {
      return {
        dashboards: { default: null },
        activeDashboardId: 'default',
        preferences: null
      };
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('Storage read failed, resetting:', err);
    return {
      dashboards: { default: null },
      activeDashboardId: 'default',
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
  data.dashboards[data.activeDashboardId] = req.body;
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

// ------------------------------------------------------------------
// Start server
// ------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`WebDash running at http://localhost:${PORT}`);
});