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
