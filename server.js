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

app.listen(PORT, () => console.log(`cardsApp running at http://localhost:${PORT}`));
