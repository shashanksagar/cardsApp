# Auth + Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user registration/login with exam progress persistence (Node/Express + JSON files) and a dark mode toggle to the cardsApp SPA.

**Architecture:** A Node/Express server (`server.js`) serves the static app and exposes 4 REST API routes for auth and progress. User accounts and session history are stored in `data/users.json` and `data/progress.json`. The frontend adds a login/register modal overlay, a user chip, a history screen, and a dark mode toggle — all wired through `js/app.js` and `css/styles.css`.

**Tech Stack:** Node.js, Express 4, bcryptjs, vanilla JS, CSS custom properties

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `package.json` | Create | npm project + express + bcryptjs deps |
| `server.js` | Create | Static file serving + 4 API routes + JSON persistence |
| `data/users.json` | Auto-created | `{ users: [] }` — accounts store |
| `data/progress.json` | Auto-created | `{ sessions: [] }` — exam history store |
| `index.html` | Modify | Add modal HTML, history screen, dark toggle button, user chip |
| `js/app.js` | Modify | Auth flow, modal logic, progress save/fetch, history screen render |
| `css/styles.css` | Modify | Dark mode CSS vars + modal + history screen styles |

---

## Task 1: Node project + server scaffold

**Files:**
- Create: `package.json`
- Create: `server.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "cards-app",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "express": "^4.18.2"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run in the project root:
```bash
npm install
```
Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Create server.js — static serving only (no API yet)**

```js
'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR      = path.join(__dirname, 'data');
const USERS_FILE    = path.join(DATA_DIR, 'users.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');

// Auto-create data files
if (!fs.existsSync(USERS_FILE))    fs.writeFileSync(USERS_FILE,    JSON.stringify({ users: [] }));
if (!fs.existsSync(PROGRESS_FILE)) fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ sessions: [] }));

app.use(express.json());
app.use(express.static(__dirname));

app.listen(PORT, () => console.log(`cardsApp running at http://localhost:${PORT}`));
```

- [ ] **Step 4: Verify server starts**

Run:
```bash
node server.js
```
Expected output: `cardsApp running at http://localhost:3000`
Open http://localhost:3000 — the existing app should load exactly as before.
Stop server with Ctrl+C.

---

## Task 2: Auth API routes (register + login)

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add helper functions and register/login routes to server.js**

Add this block to `server.js` after the `app.use(express.static(__dirname))` line and before `app.listen`:

```js
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
```

- [ ] **Step 2: Test register endpoint**

Restart server, then run:
```bash
curl -s -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"pass123"}' | cat
```
Expected: `{"token":"<64-char-hex>","username":"testuser"}`
Verify `data/users.json` now contains one user with a hashed password.

- [ ] **Step 3: Test login endpoint**

```bash
curl -s -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"pass123"}' | cat
```
Expected: `{"token":"<different-64-char-hex>","username":"testuser"}`

- [ ] **Step 4: Test duplicate register returns 409**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"pass123"}'
```
Expected: `409`

---

## Task 3: Progress API routes (save + fetch)

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add auth middleware and progress routes to server.js**

Add after the login route, before `app.listen`:

```js
// ─── Auth middleware ───────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.body?.token || req.query?.token;
  if (!token || !sessions[token]) return res.status(401).json({ error: 'Unauthorized' });
  req.username = sessions[token];
  next();
}

// ─── POST /api/progress ───────────────────────────────────────────
app.post('/api/progress', requireAuth, (req, res) => {
  const { token, ...sessionData } = req.body;
  const db = readJSON(PROGRESS_FILE);
  db.sessions.push({ ...sessionData, userId: req.username, date: new Date().toISOString() });
  writeJSON(PROGRESS_FILE, db);
  res.json({ ok: true });
});

// ─── GET /api/progress ────────────────────────────────────────────
app.get('/api/progress', requireAuth, (req, res) => {
  const db = readJSON(PROGRESS_FILE);
  const sessions = db.sessions.filter(s => s.userId === req.username);
  res.json({ sessions });
});
```

- [ ] **Step 2: Test progress save**

Use a token from Task 2 Step 2 (or re-login to get a fresh token). Replace `TOKEN` below:
```bash
curl -s -X POST http://localhost:3000/api/progress \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN","set":"set2","mode":"practice","score":60,"total":81,"passed":false,"timeTaken":0,"topicBreakdown":{},"answers":[]}' | cat
```
Expected: `{"ok":true}`
Verify `data/progress.json` contains one session.

- [ ] **Step 3: Test progress fetch**

```bash
curl -s "http://localhost:3000/api/progress?token=TOKEN" | cat
```
Expected: `{"sessions":[{...}]}`

---

## Task 4: Dark mode CSS

**Files:**
- Modify: `css/styles.css`

- [ ] **Step 1: Add dark mode CSS variables at the end of styles.css**

Append to `css/styles.css`:

```css
/* ─── DARK MODE ─────────────────────────────────────────────────── */
body.dark {
  --sf-bg:    #0f1b2d;
  --sf-white: #1c2d3f;
  --sf-light: #1a3550;
  --sf-dark:  #1e3a5f;
  --sf-gray:  #a8b4c0;
  color: #e8edf2;
}

body.dark .start-card,
body.dark .question-card,
body.dark .results-card,
body.dark .exam-nav {
  background: #1c2d3f;
  color: #e8edf2;
}

body.dark .exam-header,
body.dark .review-header {
  background: #0f1b2d;
}

body.dark .choice-item {
  border-color: #2a4060;
  background: #162233;
  color: #e8edf2;
}
body.dark .choice-item:hover:not(.disabled) {
  border-color: var(--sf-blue);
  background: #1a3550;
}
body.dark .choice-item.selected {
  border-color: var(--sf-blue);
  background: #1a3550;
}

body.dark select {
  background: #1c2d3f;
  color: #e8edf2;
  border-color: #2a4060;
}

body.dark .review-item {
  background: #1c2d3f;
  color: #e8edf2;
}

body.dark .review-choice {
  border-color: #2a4060;
  color: #e8edf2;
}

body.dark .nav-cell {
  background: #162233;
  border-color: #2a4060;
  color: #e8edf2;
}
body.dark .nav-cell.answered { background: #1a3550; }
body.dark .nav-cell.current  { background: var(--sf-blue); color: #fff; }

body.dark .mode-btn {
  background: #162233;
  border-color: #2a4060;
  color: #e8edf2;
}
body.dark .mode-btn.active {
  background: #1a3550;
  border-color: var(--sf-blue);
}
body.dark .mode-btn strong { color: #e8edf2; }

body.dark .feedback-box.correct-fb { background: #0d2b1a; color: #a3e4b3; }
body.dark .feedback-box.wrong-fb   { background: #2b0d0d; color: #f4a3a3; }

/* ─── DARK TOGGLE BUTTON ────────────────────────────────────────── */
.dark-toggle {
  background: transparent;
  border: none;
  font-size: 1.3rem;
  cursor: pointer;
  line-height: 1;
  padding: 0.2rem 0.4rem;
  border-radius: 0.4rem;
  transition: background .15s;
}
.dark-toggle:hover { background: rgba(255,255,255,.15); }

/* ─── USER CHIP ─────────────────────────────────────────────────── */
.user-chip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: #ccc;
  white-space: nowrap;
}
.user-chip button {
  background: transparent;
  border: 1px solid #555;
  color: #ccc;
  border-radius: 0.3rem;
  padding: 0.15rem 0.5rem;
  font-size: 0.75rem;
  cursor: pointer;
}
.user-chip button:hover { background: rgba(255,255,255,.1); }

/* ─── AUTH MODAL ────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.modal-overlay.hidden { display: none !important; }

.modal-card {
  background: #fff;
  border-radius: var(--radius);
  padding: 2rem;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 8px 40px rgba(0,0,0,.3);
}
body.dark .modal-card {
  background: #1c2d3f;
  color: #e8edf2;
}

.modal-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid #eee;
}
body.dark .modal-tabs { border-color: #2a4060; }

.modal-tab {
  flex: 1;
  background: transparent;
  border: none;
  padding: 0.6rem;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--sf-gray);
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  transition: color .15s, border-color .15s;
}
.modal-tab.active {
  color: var(--sf-blue);
  border-bottom-color: var(--sf-blue);
}

.modal-field { margin-bottom: 1rem; }
.modal-field label {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--sf-dark);
  margin-bottom: 0.3rem;
}
body.dark .modal-field label { color: #a8b4c0; }

.modal-field input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: 1.5px solid #c9c7c5;
  border-radius: 0.4rem;
  font-size: 0.95rem;
  background: #fff;
  color: #181818;
}
body.dark .modal-field input {
  background: #0f1b2d;
  color: #e8edf2;
  border-color: #2a4060;
}
.modal-field input:focus { outline: 2px solid var(--sf-blue); border-color: var(--sf-blue); }

.modal-error {
  color: var(--sf-red);
  font-size: 0.82rem;
  margin-bottom: 0.75rem;
  min-height: 1.2em;
}

/* ─── HISTORY SCREEN ────────────────────────────────────────────── */
#screen-history {
  flex-direction: column;
  min-height: 100vh;
  background: var(--sf-bg);
}

.history-header {
  background: var(--sf-dark);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.9rem 1.5rem;
  position: sticky;
  top: 0;
  z-index: 100;
}
.history-header h2 { font-size: 1rem; }

.history-list {
  max-width: 860px;
  margin: 0 auto;
  padding: 1.5rem 1rem;
  width: 100%;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  font-size: 0.88rem;
}
body.dark .history-table { background: #1c2d3f; color: #e8edf2; }

.history-table th {
  background: var(--sf-dark);
  color: #fff;
  padding: 0.7rem 1rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.8rem;
}

.history-table td {
  padding: 0.7rem 1rem;
  border-bottom: 1px solid #eee;
  vertical-align: middle;
}
body.dark .history-table td { border-color: #2a4060; }

.history-table tr:last-child td { border-bottom: none; }
.history-table tbody tr { cursor: pointer; transition: background .1s; }
.history-table tbody tr:hover { background: var(--sf-light); }
body.dark .history-table tbody tr:hover { background: #1a3550; }

.history-expand {
  background: var(--sf-light);
  padding: 1rem 1.5rem;
  font-size: 0.83rem;
  border-bottom: 1px solid #eee;
}
body.dark .history-expand { background: #162233; border-color: #2a4060; }

.history-topic-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.3rem;
}

.badge-pass { color: var(--sf-green); font-weight: 700; }
.badge-fail { color: var(--sf-red);   font-weight: 700; }
```

- [ ] **Step 2: Verify no visual regression**

Start the server (`node server.js`) and open http://localhost:3000. The app should look identical to before (dark mode not active yet — no toggle button in HTML yet). Check all 4 screens.

---

## Task 5: HTML — dark toggle, user chip, auth modal, history screen

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add dark toggle script in `<head>` (before stylesheet) to avoid flash**

Add as the very first `<script>` tag inside `<head>`, before the `<link>` stylesheet:

```html
<script>
  (function() {
    if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark-init');
  })();
</script>
```

Also add to `<head>` after the stylesheet:
```html
<style>
  html.dark-init body { background: #0f1b2d !important; }
</style>
```

- [ ] **Step 2: Add dark toggle button and user chip to the Start screen card**

In `index.html`, replace the opening of `<div id="screen-start" ...>` section. Find:
```html
<div id="screen-start" class="screen active">
  <div class="card start-card">
    <div class="logo">☁️</div>
```
Replace with:
```html
<div id="screen-start" class="screen active">
  <div style="position:fixed;top:0.75rem;right:1rem;display:flex;align-items:center;gap:0.75rem;z-index:50">
    <div id="user-chip-start" class="user-chip hidden"></div>
    <button class="dark-toggle" id="dark-toggle-start" title="Toggle dark mode">🌙</button>
  </div>
  <div class="card start-card">
    <div class="logo">☁️</div>
```

- [ ] **Step 3: Add dark toggle + user chip to exam header**

Find in `index.html`:
```html
    <div class="header-right">
      <span id="timer-display" class="timer hidden">1:32:00</span>
      <button id="btn-quit" class="btn btn-ghost btn-sm">✕ Quit</button>
    </div>
```
Replace with:
```html
    <div class="header-right">
      <div id="user-chip-exam" class="user-chip hidden"></div>
      <span id="timer-display" class="timer hidden">1:32:00</span>
      <button class="dark-toggle" id="dark-toggle-exam" title="Toggle dark mode">🌙</button>
      <button id="btn-quit" class="btn btn-ghost btn-sm">✕ Quit</button>
    </div>
```

- [ ] **Step 4: Add dark toggle + user chip to results screen**

Find:
```html
<div id="screen-results" class="screen">
  <div class="results-card">
```
Replace with:
```html
<div id="screen-results" class="screen">
  <div style="position:fixed;top:0.75rem;right:1rem;display:flex;align-items:center;gap:0.75rem;z-index:50">
    <div id="user-chip-results" class="user-chip hidden"></div>
    <button class="dark-toggle" id="dark-toggle-results" title="Toggle dark mode">🌙</button>
  </div>
  <div class="results-card">
```

- [ ] **Step 5: Add "My History" button to results actions**

Find:
```html
    <div class="results-actions">
      <button id="btn-review" class="btn btn-outline">Review Answers</button>
      <button id="btn-restart" class="btn btn-primary">Start Again</button>
    </div>
```
Replace with:
```html
    <div class="results-actions">
      <button id="btn-history" class="btn btn-outline">📋 My History</button>
      <button id="btn-review" class="btn btn-outline">Review Answers</button>
      <button id="btn-restart" class="btn btn-primary">Start Again</button>
    </div>
```

- [ ] **Step 6: Add dark toggle to review screen header**

Find:
```html
  <header class="review-header">
    <h2>Answer Review</h2>
    <button id="btn-back-results" class="btn btn-ghost btn-sm">← Back to Results</button>
  </header>
```
Replace with:
```html
  <header class="review-header">
    <h2>Answer Review</h2>
    <div style="display:flex;align-items:center;gap:0.75rem">
      <button class="dark-toggle" id="dark-toggle-review" title="Toggle dark mode">🌙</button>
      <button id="btn-back-results" class="btn btn-ghost btn-sm">← Back to Results</button>
    </div>
  </header>
```

- [ ] **Step 7: Add auth modal and history screen before the `<script>` tag**

Find the line `<script src="js/app.js"></script>` and insert the following HTML block immediately before it:

```html
<!-- ══════════════════════════════════════════════ AUTH MODAL ═════ -->
<div id="modal-auth" class="modal-overlay hidden">
  <div class="modal-card">
    <div class="logo" style="font-size:2rem;text-align:center;margin-bottom:0.5rem">☁️</div>
    <h2 style="text-align:center;font-size:1.1rem;color:var(--sf-dark);margin-bottom:1.25rem">Salesforce IAM Architect</h2>
    <div class="modal-tabs">
      <button class="modal-tab active" id="tab-login" onclick="switchTab('login')">Login</button>
      <button class="modal-tab" id="tab-register" onclick="switchTab('register')">Register</button>
    </div>
    <div id="modal-error" class="modal-error"></div>
    <div class="modal-field">
      <label>Username</label>
      <input type="text" id="auth-username" autocomplete="username" placeholder="Enter username" />
    </div>
    <div class="modal-field">
      <label>Password</label>
      <input type="password" id="auth-password" autocomplete="current-password" placeholder="Enter password" />
    </div>
    <div class="modal-field" id="field-confirm" style="display:none">
      <label>Confirm Password</label>
      <input type="password" id="auth-confirm" autocomplete="new-password" placeholder="Confirm password" />
    </div>
    <button id="btn-auth-submit" class="btn btn-primary btn-lg" style="margin-top:0.25rem">Login</button>
  </div>
</div>

<!-- ══════════════════════════════════════════════ SCREEN: HISTORY ══ -->
<div id="screen-history" class="screen">
  <header class="history-header">
    <h2>My History</h2>
    <div style="display:flex;align-items:center;gap:0.75rem">
      <button class="dark-toggle" id="dark-toggle-history" title="Toggle dark mode">🌙</button>
      <button id="btn-back-from-history" class="btn btn-ghost btn-sm">← Back to Results</button>
    </div>
  </header>
  <div class="history-list">
    <div id="history-content"></div>
  </div>
</div>
```

---

## Task 6: JS — dark mode toggle

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add dark mode logic at the top of app.js (after `'use strict';`)**

Insert after `'use strict';`:

```js
// ─── Dark mode ────────────────────────────────────────────────────
(function () {
  if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');
})();

function setDarkMode(on) {
  document.body.classList.toggle('dark', on);
  localStorage.setItem('theme', on ? 'dark' : 'light');
  document.querySelectorAll('.dark-toggle').forEach(btn => {
    btn.textContent = on ? '☀️' : '🌙';
  });
}

document.querySelectorAll('.dark-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    setDarkMode(!document.body.classList.contains('dark'));
  });
});

// Init toggle icons on load
setDarkMode(document.body.classList.contains('dark'));
```

- [ ] **Step 2: Verify dark mode works**

Open http://localhost:3000. Click the 🌙 button on the Start screen — app should switch to dark palette. Refresh — dark mode should persist. Click ☀️ to switch back.

---

## Task 7: JS — auth state + modal logic

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add auth state and helper functions**

Add after the dark mode block:

```js
// ─── Auth state ───────────────────────────────────────────────────
const auth = {
  token:    localStorage.getItem('authToken') || null,
  username: localStorage.getItem('authUser')  || null,
};

function saveAuth(token, username) {
  auth.token    = token;
  auth.username = username;
  localStorage.setItem('authToken', token);
  localStorage.setItem('authUser',  username);
}

function clearAuth() {
  auth.token    = null;
  auth.username = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('authUser');
}

function updateUserChips() {
  document.querySelectorAll('.user-chip').forEach(chip => {
    if (auth.username) {
      chip.innerHTML = `<span>👤 ${auth.username}</span><button onclick="logout()">Logout</button>`;
      chip.classList.remove('hidden');
    } else {
      chip.classList.add('hidden');
    }
  });
}

function logout() {
  clearAuth();
  updateUserChips();
  showModal();
}
```

- [ ] **Step 2: Add modal show/hide and tab switching functions**

```js
// ─── Auth modal ───────────────────────────────────────────────────
let currentTab = 'login';

function showModal() {
  $('modal-auth').classList.remove('hidden');
  $('modal-error').textContent = '';
  $('auth-username').value = '';
  $('auth-password').value = '';
  $('auth-confirm').value  = '';
  switchTab('login');
}

function hideModal() {
  $('modal-auth').classList.add('hidden');
}

function switchTab(tab) {
  currentTab = tab;
  $('tab-login').classList.toggle('active', tab === 'login');
  $('tab-register').classList.toggle('active', tab === 'register');
  $('field-confirm').style.display = tab === 'register' ? '' : 'none';
  $('btn-auth-submit').textContent = tab === 'login' ? 'Login' : 'Register';
  $('modal-error').textContent = '';
}

$('btn-auth-submit').addEventListener('click', async () => {
  const username = $('auth-username').value.trim();
  const password = $('auth-password').value;
  const confirm  = $('auth-confirm').value;
  const errorEl  = $('modal-error');

  if (!username || !password) { errorEl.textContent = 'Username and password required.'; return; }
  if (currentTab === 'register' && password !== confirm) {
    errorEl.textContent = 'Passwords do not match.'; return;
  }

  const endpoint = currentTab === 'login' ? '/api/login' : '/api/register';
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await resp.json();
    if (!resp.ok) { errorEl.textContent = data.error || 'Something went wrong.'; return; }
    saveAuth(data.token, data.username);
    updateUserChips();
    hideModal();
  } catch (e) {
    errorEl.textContent = 'Cannot reach server. Is it running?';
  }
});

// ─── On load: check auth ──────────────────────────────────────────
updateUserChips();
if (!auth.token) {
  showModal();
}
```

- [ ] **Step 3: Verify modal flow**

Open http://localhost:3000. The login modal should appear immediately. Register a new user — modal should dismiss. Refresh — should stay logged in (no modal). Click Logout — modal reappears.

---

## Task 8: JS — progress saving + history screen

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add progress save function**

Add after the auth modal section:

```js
// ─── Progress ─────────────────────────────────────────────────────
async function saveProgress(sessionData) {
  if (!auth.token) return;
  try {
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: auth.token, ...sessionData }),
    });
  } catch (e) {
    console.warn('Could not save progress:', e);
  }
}
```

- [ ] **Step 2: Call saveProgress from showResults()**

In the existing `showResults()` function, find the line `showScreen('results');` at the end and add the save call before it:

```js
  // Build answers array for history
  const answersForHistory = state.questions.map((q, i) => {
    const ans = state.answers[i];
    return {
      qIdx: i,
      text: q.text,
      selected: ans ? ans.selected : [],
      correct:  ans ? ans.correct  : false,
    };
  });

  saveProgress({
    set:            $('header-set-label').textContent,
    mode:           state.mode,
    score:          correct,
    total:          total,
    passed:         passed,
    timeTaken:      state.mode === 'exam' ? (92 * 60 - state.secondsLeft) : 0,
    topicBreakdown: topicMap,
    answers:        answersForHistory,
  });

  showScreen('results');
```

- [ ] **Step 3: Add history screen renderer**

```js
// ─── History screen ───────────────────────────────────────────────
screens.history = $('screen-history');

$('btn-history').addEventListener('click', async () => {
  await buildHistory();
  showScreen('history');
});

$('btn-back-from-history').addEventListener('click', () => showScreen('results'));

async function buildHistory() {
  const container = $('history-content');
  container.innerHTML = '<p style="color:var(--sf-gray)">Loading…</p>';

  try {
    const resp = await fetch(`/api/progress?token=${auth.token}`);
    const data = await resp.json();
    const sessions = (data.sessions || []).slice().reverse(); // newest first

    if (sessions.length === 0) {
      container.innerHTML = '<p style="color:var(--sf-gray);padding:1rem 0">No sessions recorded yet.</p>';
      return;
    }

    let html = `<table class="history-table">
      <thead><tr>
        <th>#</th><th>Date</th><th>Set</th><th>Mode</th><th>Score</th><th>Result</th>
      </tr></thead><tbody>`;

    sessions.forEach((s, i) => {
      const d    = new Date(s.date);
      const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      const pct  = Math.round((s.score / s.total) * 100);
      const pass = s.passed
        ? '<span class="badge-pass">✅ Pass</span>'
        : '<span class="badge-fail">❌ Fail</span>';
      html += `<tr onclick="toggleHistoryRow(this, ${i})" data-idx="${i}">
        <td>${sessions.length - i}</td>
        <td>${dateStr}</td>
        <td>${s.set}</td>
        <td style="text-transform:capitalize">${s.mode}</td>
        <td>${s.score}/${s.total} (${pct}%)</td>
        <td>${pass}</td>
      </tr>
      <tr id="history-expand-${i}" style="display:none">
        <td colspan="6">
          <div class="history-expand">
            <strong style="font-size:0.8rem">Topic Breakdown</strong>
            ${buildTopicBreakdownHtml(s.topicBreakdown)}
          </div>
        </td>
      </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p style="color:var(--sf-red)">Could not load history. Is the server running?</p>';
  }
}

function buildTopicBreakdownHtml(topicBreakdown) {
  if (!topicBreakdown || Object.keys(topicBreakdown).length === 0) return '<p>No topic data.</p>';
  return Object.entries(topicBreakdown)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([topic, data]) => {
      const p = Math.round((data.correct / data.total) * 100);
      const color = p >= 68 ? 'var(--sf-green)' : p >= 50 ? 'var(--sf-orange)' : 'var(--sf-red)';
      return `<div class="history-topic-row">
        <span style="flex:1;font-size:0.82rem">${topic}</span>
        <div style="width:120px;height:7px;background:#ddd;border-radius:999px;overflow:hidden">
          <div style="width:${p}%;height:100%;background:${color};border-radius:999px"></div>
        </div>
        <span style="min-width:3rem;text-align:right;font-weight:700;color:${color};font-size:0.82rem">${p}%</span>
      </div>`;
    }).join('');
}

function toggleHistoryRow(tr, idx) {
  const expand = document.getElementById(`history-expand-${idx}`);
  expand.style.display = expand.style.display === 'none' ? '' : 'none';
}
```

- [ ] **Step 4: Verify end-to-end**

1. Start server, open http://localhost:3000
2. Login (or register if needed)
3. Complete a Practice session through to Results
4. Verify `data/progress.json` has a new session record
5. Click "📋 My History" — table should show the session
6. Click a row — topic breakdown should expand
7. Click "← Back to Results"

---

## Task 9: Final integration check

- [ ] **Step 1: Full flow smoke test**

Run through this checklist:
- [ ] App loads at http://localhost:3000 — modal appears if not logged in
- [ ] Register new user — modal dismisses, chip shows username
- [ ] Logout — modal reappears
- [ ] Login with same user — works
- [ ] Dark mode toggle on Start screen persists after refresh
- [ ] Start a Practice session, answer some questions, reach Results
- [ ] "📋 My History" shows the session; topic breakdown expands on click
- [ ] Start a Timed Exam, navigate with question map, submit
- [ ] History now shows 2 sessions
- [ ] Dark mode looks correct on all 5 screens (Start, Exam, Results, Review, History)
- [ ] Quit during exam → returns to Start → modal NOT re-shown (already logged in)

- [ ] **Step 2: Delete test data and re-run clean**

```bash
rm data/users.json data/progress.json
node server.js
```
Open app — should auto-create fresh data files and show login modal. Register fresh user, complete a session — verify everything works from scratch.
