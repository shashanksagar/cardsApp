'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Logger ───────────────────────────────────────────────────────
function ts() { return new Date().toISOString(); }
const log = {
  info:  (...a) => console.log( `[${ts()}] INFO `, ...a),
  warn:  (...a) => console.warn( `[${ts()}] WARN `, ...a),
  error: (...a) => console.error(`[${ts()}] ERROR`, ...a),
};

// Log every request
app.use((req, _res, next) => {
  log.info(`${req.method} ${req.path}`);
  next();
});

// Catch unhandled promise rejections and exceptions
process.on('unhandledRejection', (reason) => log.error('Unhandled rejection:', reason));
process.on('uncaughtException',  (err)    => log.error('Uncaught exception:', err));

// ─── Database ──────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      username   TEXT PRIMARY KEY,
      password   TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS progress (
      id         SERIAL PRIMARY KEY,
      username   TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      session    JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS settings (
      username   TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
      data       JSONB NOT NULL DEFAULT '{}'
    );
  `);
  log.info('Database ready');
}
initDB().catch(e => log.error('DB init error:', e));

// ─── In-memory sessions (token → username) ────────────────────────
const sessions = {};
function makeToken() { return crypto.randomBytes(32).toString('hex'); }

app.use(express.json());

// ─── Static assets ────────────────────────────────────────────────
app.use('/css',   express.static(path.join(__dirname, 'css')));
app.use('/js',    express.static(path.join(__dirname, 'js')));
app.use('/icons', express.static(path.join(__dirname, 'icons')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'manifest.json')));
app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

// Question-set JSON files live in data/ — block private files
const DATA_DIR    = path.join(__dirname, 'data');
const PRIVATE_DATA = new Set(['users.json', 'progress.json', 'settings.json']);
app.get('/data/:file', (req, res) => {
  if (PRIVATE_DATA.has(req.params.file)) return res.status(404).end();
  res.sendFile(path.join(DATA_DIR, req.params.file));
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── Auth middleware ───────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.body?.token || req.query?.token;
  if (!token || !sessions[token]) {
    log.warn(`Unauthorized ${req.method} ${req.path} — invalid/missing token`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.username = sessions[token];
  next();
}

// ─── POST /api/register ───────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const existing = await pool.query('SELECT username FROM users WHERE username = $1', [username]);
    if (existing.rows.length) return res.status(409).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hash]);

    const token = makeToken();
    sessions[token] = username;
    res.json({ token, username });
  } catch (e) {
    log.error(e.message, { code: e.code, stack: e.stack });
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/login ──────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const result = await pool.query('SELECT password FROM users WHERE username = $1', [username]);
    if (!result.rows.length) {
      log.warn(`Login failed — unknown user: ${username}`);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const match = await bcrypt.compare(password, result.rows[0].password);
    if (!match) {
      log.warn(`Login failed — wrong password for user: ${username}`);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = makeToken();
    sessions[token] = username;
    res.json({ token, username });
  } catch (e) {
    log.error(e.message, { code: e.code, stack: e.stack });
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/progress ───────────────────────────────────────────
app.post('/api/progress', requireAuth, async (req, res) => {
  try {
    const { token, ...sessionData } = req.body;
    await pool.query(
      'INSERT INTO progress (username, session) VALUES ($1, $2)',
      [req.username, JSON.stringify({ ...sessionData, date: new Date().toISOString() })]
    );
    res.json({ ok: true });
  } catch (e) {
    log.error(e.message, { code: e.code, stack: e.stack });
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/progress ────────────────────────────────────────────
app.get('/api/progress', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT session FROM progress WHERE username = $1 ORDER BY created_at ASC',
      [req.username]
    );
    res.json({ sessions: result.rows.map(r => r.session) });
  } catch (e) {
    log.error(e.message, { code: e.code, stack: e.stack });
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/weak-topics ─────────────────────────────────────────
app.get('/api/weak-topics', requireAuth, async (req, res) => {
  try {
    const setId     = req.query.set;
    const threshold = parseInt(req.query.threshold) || 68;
    if (!setId) return res.status(400).json({ error: 'set param required' });

    const result = await pool.query(
      "SELECT session FROM progress WHERE username = $1 AND session->>'set' = $2",
      [req.username, setId]
    );
    if (!result.rows.length) return res.json({ topics: {}, sessionCount: 0 });

    const topics = {};
    result.rows.forEach(({ session }) => {
      const tb = session.topicBreakdown || {};
      Object.entries(tb).forEach(([topic, data]) => {
        if (!topics[topic]) topics[topic] = { correct: 0, total: 0 };
        topics[topic].correct += data.correct || 0;
        topics[topic].total   += data.total   || 0;
      });
    });

    const out = {};
    Object.entries(topics).forEach(([topic, data]) => {
      const pct = data.total ? Math.round((data.correct / data.total) * 100) : 0;
      out[topic] = { ...data, pct, weak: pct < threshold };
    });

    res.json({ topics: out, sessionCount: result.rows.length });
  } catch (e) {
    log.error(e.message, { code: e.code, stack: e.stack });
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/settings ────────────────────────────────────────────
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM settings WHERE username = $1', [req.username]);
    res.json({ settings: result.rows.length ? result.rows[0].data : {} });
  } catch (e) {
    log.error(e.message, { code: e.code, stack: e.stack });
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/settings ───────────────────────────────────────────
app.post('/api/settings', requireAuth, async (req, res) => {
  try {
    const { token, ...newSettings } = req.body;
    await pool.query(`
      INSERT INTO settings (username, data) VALUES ($1, $2)
      ON CONFLICT (username) DO UPDATE SET data = settings.data || $2::jsonb
    `, [req.username, JSON.stringify(newSettings)]);
    res.json({ ok: true });
  } catch (e) {
    log.error(e.message, { code: e.code, stack: e.stack });
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => log.info(`cardsApp running at http://localhost:${PORT}`));
