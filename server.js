'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR       = path.join(__dirname, 'data');
const USERS_FILE     = path.join(DATA_DIR, 'users.json');
const PROGRESS_FILE  = path.join(DATA_DIR, 'progress.json');
const SETTINGS_FILE  = path.join(DATA_DIR, 'settings.json');

// Auto-create data directory and files
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE))    fs.writeFileSync(USERS_FILE,    JSON.stringify({ users: [] }));
if (!fs.existsSync(PROGRESS_FILE)) fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ sessions: [] }));
if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ settings: [] }));

app.use(express.json());

// Serve only public static assets — do NOT expose data/ (contains password hashes)
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js',  express.static(path.join(__dirname, 'js')));

// Serve question-set JSON files but block auth/progress data files
const PRIVATE_DATA = new Set(['users.json', 'progress.json', 'settings.json']);
app.get('/data/:file', (req, res) => {
  if (PRIVATE_DATA.has(req.params.file)) return res.status(404).end();
  res.sendFile(path.join(DATA_DIR, req.params.file));
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── Helpers ──────────────────────────────────────────────────────
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

// NOTE: sessions are in-memory only — all users are logged out on server restart.
// In-memory token store: { token: username }
const sessions = {};

// ─── POST /api/register ───────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const db = readJSON(USERS_FILE);
    if (db.users.find(u => u.username === username)) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hash = await bcrypt.hash(password, 10);
    db.users.push({ username, password: hash, createdAt: new Date().toISOString() });
    writeJSON(USERS_FILE, db);

    const token = makeToken();
    sessions[token] = username;
    res.json({ token, username });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/login ──────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const db = readJSON(USERS_FILE);
    const user = db.users.find(u => u.username === username);
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid username or password' });

    const token = makeToken();
    sessions[token] = username;
    res.json({ token, username });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Auth middleware ───────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.body?.token || req.query?.token;
  if (!token || !sessions[token]) return res.status(401).json({ error: 'Unauthorized' });
  req.username = sessions[token];
  next();
}

// ─── POST /api/progress ───────────────────────────────────────────
app.post('/api/progress', requireAuth, (req, res) => {
  try {
    const { token, ...sessionData } = req.body;
    const db = readJSON(PROGRESS_FILE);
    db.sessions.push({ ...sessionData, userId: req.username, date: new Date().toISOString() });
    writeJSON(PROGRESS_FILE, db);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/progress ────────────────────────────────────────────
app.get('/api/progress', requireAuth, (req, res) => {
  try {
    const db = readJSON(PROGRESS_FILE);
    const userSessions = db.sessions.filter(s => s.userId === req.username);
    res.json({ sessions: userSessions });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/weak-topics ────────────────────────────────────────
// Returns aggregated topic scores for the user across sessions for a given set.
// Query params: set (question set id), threshold (pass %, default 68)
app.get('/api/weak-topics', requireAuth, (req, res) => {
  try {
    const setId     = req.query.set;
    const threshold = parseInt(req.query.threshold) || 68;
    if (!setId) return res.status(400).json({ error: 'set param required' });

    const db = readJSON(PROGRESS_FILE);
    const sessions = db.sessions.filter(s =>
      s.userId === req.username && String(s.set) === String(setId)
    );
    if (sessions.length === 0) return res.json({ topics: {}, sessionCount: 0 });

    // Aggregate topic correct/total across all sessions
    const topics = {};
    sessions.forEach(session => {
      const tb = session.topicBreakdown || {};
      Object.entries(tb).forEach(([topic, data]) => {
        if (!topics[topic]) topics[topic] = { correct: 0, total: 0 };
        topics[topic].correct += data.correct || 0;
        topics[topic].total   += data.total   || 0;
      });
    });

    // Tag each topic with its aggregate pct and whether it's weak
    const result = {};
    Object.entries(topics).forEach(([topic, data]) => {
      const pct = data.total ? Math.round((data.correct / data.total) * 100) : 0;
      result[topic] = { ...data, pct, weak: pct < threshold };
    });

    res.json({ topics: result, sessionCount: sessions.length });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/settings ───────────────────────────────────────────
app.get('/api/settings', requireAuth, (req, res) => {
  try {
    const db = readJSON(SETTINGS_FILE);
    const entry = db.settings.find(s => s.userId === req.username);
    res.json({ settings: entry ? entry.settings : {} });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/settings ──────────────────────────────────────────
app.post('/api/settings', requireAuth, (req, res) => {
  try {
    const { token, ...newSettings } = req.body;
    const db = readJSON(SETTINGS_FILE);
    const idx = db.settings.findIndex(s => s.userId === req.username);
    if (idx >= 0) {
      db.settings[idx].settings = { ...db.settings[idx].settings, ...newSettings };
    } else {
      db.settings.push({ userId: req.username, settings: newSettings });
    }
    writeJSON(SETTINGS_FILE, db);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => console.log(`cardsApp running at http://localhost:${PORT}`));
