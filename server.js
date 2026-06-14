'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR      = path.join(__dirname, 'data');
const USERS_FILE    = path.join(DATA_DIR, 'users.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');

// Auto-create data directory and files
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE))    fs.writeFileSync(USERS_FILE,    JSON.stringify({ users: [] }));
if (!fs.existsSync(PROGRESS_FILE)) fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ sessions: [] }));

app.use(express.json());

// Serve only public static assets — do NOT expose data/ (contains password hashes)
app.use('/css',  express.static(path.join(__dirname, 'css')));
app.use('/js',   express.static(path.join(__dirname, 'js')));
app.use('/data/set2.json', express.static(path.join(__dirname, 'data', 'set2.json')));
app.use('/data/set4.json', express.static(path.join(__dirname, 'data', 'set4.json')));
// Serve index.html for root
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

// In-memory token store: { token: username }
const sessions = {};

// ─── POST /api/register ───────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

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
});

// ─── POST /api/login ──────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const db = readJSON(USERS_FILE);
  const user = db.users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid username or password' });

  const token = makeToken();
  sessions[token] = username;
  res.json({ token, username });
});

app.listen(PORT, () => console.log(`cardsApp running at http://localhost:${PORT}`));
