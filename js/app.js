'use strict';

const $ = id => document.getElementById(id);

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
      chip.innerHTML = `<span>👤 ${auth.username}</span>`;
      chip.classList.remove('hidden');
    } else {
      chip.classList.add('hidden');
    }
  });
  const logoutBtn = $('btn-logout-start');
  if (logoutBtn) logoutBtn.classList.toggle('hidden', !auth.username);
}

function logout() {
  clearAuth();
  updateUserChips();
  showModal();
}

document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = $('btn-logout-start');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
});

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
    let body = { username, password };

    if (currentTab === 'register') {
      // Fetch a server-issued challenge token (proves the form was loaded normally)
      const chResp = await fetch('/api/challenge');
      const chData = await chResp.json();
      body.challenge = chData.challenge;
      // Include honeypot value (should always be empty for real users)
      body.hp = $('auth-hp').value;
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) { errorEl.textContent = data.error || 'Something went wrong.'; return; }
    saveAuth(data.token, data.username);
    updateUserChips();
    hideModal();
    loadSettings().then(() => refreshDrillPreview());
  } catch (e) {
    errorEl.textContent = 'Cannot reach server. Is it running?';
  }
});

// ─── On load: check auth ──────────────────────────────────────────
updateUserChips();
if (!auth.token) {
  showModal();
} else {
  loadSettings().then(() => refreshDrillPreview());
}

// ─── Settings ─────────────────────────────────────────────────────
const SETTING_DEFAULTS = {
  passThreshold:    68,
  timerMinutes:     92,
  questionLimit:    0,
  defaultMode:      'practice',
  defaultSet:       'set2',
  defaultShuffle:   true,
  fontSize:         'normal',
  keyboardShortcuts: true,
  autoAdvance:      false,
  showTopics:       true,
  confirmQuit:      true,
};

let appSettings = { ...SETTING_DEFAULTS };

async function loadSettings() {
  if (!auth.token) return;
  try {
    const resp = await fetch(`/api/settings?token=${auth.token}`);
    if (!resp.ok) return;
    const data = await resp.json();
    appSettings = { ...SETTING_DEFAULTS, ...data.settings };
  } catch (e) {
    // use defaults silently
  }
  applySettings();
}

async function persistSettings(patch) {
  if (!auth.token) return;
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: auth.token, ...patch }),
    });
  } catch (e) {
    console.warn('Could not save settings:', e);
  }
}

function applySettings() {
  // Font size
  const large = appSettings.fontSize === 'large';
  document.documentElement.classList.toggle('font-large', large);
  localStorage.setItem('fontSize', appSettings.fontSize);

  // Default mode on start screen
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === appSettings.defaultMode);
  });

  // Default question set
  const sel = $('select-set');
  if (sel) sel.value = appSettings.defaultSet;

  // Default shuffle
  const chk = $('chk-shuffle');
  if (chk) chk.checked = appSettings.defaultShuffle;

  // Topic label visibility
  const topicEl = $('q-topic');
  if (topicEl) topicEl.style.display = appSettings.showTopics ? '' : 'none';

  // Update exam mode label with current timer
  const examLabel = $('exam-mode-label');
  if (examLabel) {
    const m = appSettings.timerMinutes;
    const h = Math.floor(m / 60);
    const min = m % 60;
    examLabel.textContent = `64 questions · ${h}h ${min > 0 ? min + 'm' : ''}`.trim();
  }
}

function showSettings() {
  // Populate modal with current settings
  $('set-pass-threshold').value     = appSettings.passThreshold;
  $('set-timer-minutes').value      = appSettings.timerMinutes;
  $('set-default-mode').value       = appSettings.defaultMode;
  $('set-default-set').value        = appSettings.defaultSet;
  $('set-default-shuffle').checked  = appSettings.defaultShuffle;
  $('set-font-size').value          = appSettings.fontSize;
  $('set-keyboard-shortcuts').checked = appSettings.keyboardShortcuts;
  $('set-auto-advance').checked     = appSettings.autoAdvance;
  $('set-show-topics').checked      = appSettings.showTopics;
  $('set-confirm-quit').checked     = appSettings.confirmQuit;

  const limit = appSettings.questionLimit;
  const presets = [0, 10, 20, 30, 40];
  if (presets.includes(limit)) {
    $('set-question-limit').value = String(limit);
    $('set-question-limit-custom').style.display = 'none';
  } else {
    $('set-question-limit').value = 'custom';
    $('set-question-limit-custom').value = limit;
    $('set-question-limit-custom').style.display = '';
  }

  $('settings-save-msg').textContent = '';
  $('modal-settings').classList.remove('hidden');
}

function hideSettings() {
  $('modal-settings').classList.add('hidden');
}

$('set-question-limit').addEventListener('change', () => {
  const isCustom = $('set-question-limit').value === 'custom';
  $('set-question-limit-custom').style.display = isCustom ? '' : 'none';
});

$('btn-save-settings').addEventListener('click', async () => {
  const limitSel = $('set-question-limit').value;
  const limit = limitSel === 'custom'
    ? parseInt($('set-question-limit-custom').value) || 0
    : parseInt(limitSel);

  const patch = {
    passThreshold:     parseInt($('set-pass-threshold').value) || 68,
    timerMinutes:      parseInt($('set-timer-minutes').value)  || 92,
    questionLimit:     limit,
    defaultMode:       $('set-default-mode').value,
    defaultSet:        $('set-default-set').value,
    defaultShuffle:    $('set-default-shuffle').checked,
    fontSize:          $('set-font-size').value,
    keyboardShortcuts: $('set-keyboard-shortcuts').checked,
    autoAdvance:       $('set-auto-advance').checked,
    showTopics:        $('set-show-topics').checked,
    confirmQuit:       $('set-confirm-quit').checked,
  };

  appSettings = { ...appSettings, ...patch };
  await persistSettings(patch);
  applySettings();

  $('settings-save-msg').textContent = '✓ Saved';
  setTimeout(() => { $('settings-save-msg').textContent = ''; hideSettings(); refreshDrillPreview(); }, 800);
});

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

// ─── State ────────────────────────────────────────────────────────
const state = {
  questions:    [],       // loaded + shuffled
  current:      0,        // index into questions
  mode:         'practice', // 'practice' | 'exam'
  selected:     [],       // keys chosen on current question
  answers:      [],       // [{ qIdx, selected, correct }] per question
  flagged:      new Set(),
  timer:        null,
  secondsLeft:  0,
  started:      false,
};

// ─── DOM refs ─────────────────────────────────────────────────────
const screens = {
  start:   $('screen-start'),
  exam:    $('screen-exam'),
  results: $('screen-results'),
  review:  $('screen-review'),
  history: $('screen-history'),
};

// ─── Screen helper ────────────────────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ─── Shuffle ──────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Load data ────────────────────────────────────────────────────
async function loadSet(setId) {
  const resp = await fetch(`data/${setId}.json`);
  if (!resp.ok) throw new Error('Cannot load ' + setId);
  const data = await resp.json();
  return data;
}

// ─── START screen logic ───────────────────────────────────────────
const modeBtns = document.querySelectorAll('.mode-btn');
modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Update drill preview whenever set changes
$('select-set').addEventListener('change', () => refreshDrillPreview());

async function refreshDrillPreview() {
  if (!auth.token) return;
  const setId = $('select-set').value;
  const threshold = appSettings.passThreshold;
  try {
    const resp = await fetch(`/api/weak-topics?set=${setId}&threshold=${threshold}&token=${auth.token}`);
    if (!resp.ok) return;
    const data = await resp.json();
    renderDrillPreview(data, threshold);
  } catch (e) { /* silent */ }
}

function renderDrillPreview(data, threshold) {
  const panel = $('drill-preview');
  if (!data || data.sessionCount === 0) {
    panel.innerHTML = `<span class="drill-no-data">No history for this set yet — complete a session first to unlock drilling.</span>`;
    panel.classList.remove('hidden');
    return;
  }
  const weak = Object.entries(data.topics)
    .filter(([, d]) => d.weak)
    .sort((a, b) => a[1].pct - b[1].pct);

  if (weak.length === 0) {
    panel.innerHTML = `<span class="drill-no-data">🎉 All topics above ${threshold}% — nothing to drill!</span>`;
    panel.classList.remove('hidden');
    return;
  }

  const rows = weak.map(([topic, d]) => {
    const color = d.pct >= threshold * 0.75 ? '#dd7a01' : '#ba0517';
    return `<div class="drill-topic-row">
      <span class="drill-topic-name">${topic}</span>
      <span class="drill-topic-pct" style="color:${color}">${d.pct}%</span>
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="drill-title">🎯 ${weak.length} weak topic${weak.length > 1 ? 's' : ''} below ${threshold}%</div>
    <div class="drill-topic-list">${rows}</div>`;
  panel.classList.remove('hidden');
}

$('btn-drill').addEventListener('click', async () => {
  if (!auth.token) { showModal(); return; }
  const setId     = $('select-set').value;
  const doShuffle = $('chk-shuffle').checked;
  const threshold = appSettings.passThreshold;

  $('btn-drill').disabled = true;
  $('btn-drill').textContent = 'Loading…';

  try {
    const [weakResp, data] = await Promise.all([
      fetch(`/api/weak-topics?set=${setId}&threshold=${threshold}&token=${auth.token}`),
      loadSet(setId),
    ]);

    if (!weakResp.ok) throw new Error('Could not load weak topics');
    const weakData = await weakResp.json();

    if (weakData.sessionCount === 0) {
      alert('No history for this set yet. Complete a regular session first!');
      return;
    }

    const weakTopics = new Set(
      Object.entries(weakData.topics).filter(([, d]) => d.weak).map(([t]) => t)
    );

    if (weakTopics.size === 0) {
      alert('All topics are above the passing threshold — nothing to drill! 🎉');
      return;
    }

    let qs = data.questions.filter(q => weakTopics.has(q.topic || 'Other'));
    if (qs.length === 0) {
      alert('No questions found for your weak topics in this set.');
      return;
    }
    if (doShuffle) qs = shuffle(qs);

    const limit = appSettings.questionLimit;
    if (limit > 0 && qs.length > limit) qs = qs.slice(0, limit);

    state.questions  = qs;
    state.current    = 0;
    state.mode       = 'practice'; // drill is always practice mode
    state.selected   = [];
    state.answers    = new Array(qs.length).fill(null);
    state.flagged    = new Set();
    state.started    = true;

    $('header-mode-label').textContent = '🎯 Drill';
    $('header-set-label').textContent  = data.set || setId;
    $('timer-display').classList.add('hidden');
    $('exam-nav').classList.add('hidden');

    showScreen('exam');
    renderQuestion();
  } catch (e) {
    alert('Failed to start drill: ' + e.message);
  } finally {
    $('btn-drill').disabled = false;
    $('btn-drill').textContent = '🎯 Drill Weak Topics';
  }
});

$('btn-start').addEventListener('click', async () => {
  const setId    = $('select-set').value;
  const modeBtn  = document.querySelector('.mode-btn.active');
  const mode     = modeBtn.dataset.mode;
  const doShuffle = $('chk-shuffle').checked;

  $('btn-start').disabled = true;
  $('btn-start').textContent = 'Loading…';

  try {
    const data = await loadSet(setId);
    let qs = data.questions;
    if (doShuffle) qs = shuffle(qs);

    // Apply question limit from settings
    const limit = appSettings.questionLimit;
    if (limit > 0 && qs.length > limit) qs = qs.slice(0, limit);

    state.questions = qs;
    state.current   = 0;
    state.mode      = mode;
    state.selected  = [];
    state.answers   = new Array(qs.length).fill(null);
    state.flagged   = new Set();
    state.started   = true;

    $('header-mode-label').textContent = mode === 'exam' ? '⏱ Timed Exam' : '📚 Practice';
    $('header-set-label').textContent  = data.set || setId;

    if (mode === 'exam') {
      state.secondsLeft = appSettings.timerMinutes * 60;
      startTimer();
      $('timer-display').classList.remove('hidden');
      $('exam-nav').classList.remove('hidden');
      buildNavGrid();
    } else {
      $('timer-display').classList.add('hidden');
      $('exam-nav').classList.add('hidden');
    }

    showScreen('exam');
    renderQuestion();
  } catch (e) {
    alert('Failed to load questions: ' + e.message);
  } finally {
    $('btn-start').disabled = false;
    $('btn-start').textContent = 'Start';
  }
});

// ─── Timer ────────────────────────────────────────────────────────
function startTimer() {
  clearInterval(state.timer);
  updateTimerDisplay();
  state.timer = setInterval(() => {
    state.secondsLeft--;
    updateTimerDisplay();
    if (state.secondsLeft <= 0) {
      clearInterval(state.timer);
      submitExam();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const s = state.secondsLeft;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const el = $('timer-display');
  if (h > 0) {
    el.textContent = `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  } else {
    el.textContent = `${m}:${String(sec).padStart(2,'0')}`;
  }
  el.classList.toggle('warning', s <= 600 && s > 120);
  el.classList.toggle('danger',  s <= 120);
}

// ─── Render question ──────────────────────────────────────────────
function renderQuestion() {
  const idx = state.current;
  const q   = state.questions[idx];
  const total = state.questions.length;

  // Progress
  $('progress-text').textContent = `Q ${idx + 1} / ${total}`;
  $('progress-bar').style.width  = `${((idx + 1) / total) * 100}%`;

  // Meta
  $('q-number').textContent = `Question ${idx + 1}`;
  $('q-topic').textContent  = q.topic || '';
  $('q-topic').style.display = appSettings.showTopics ? '' : 'none';
  const badge = $('q-type-badge');
  badge.textContent = q.type === 'multi' ? '☑ Multi-select' : '◉ Single';
  badge.className   = `q-type-badge ${q.type}`;

  // Question text
  $('q-text').textContent = q.text;

  // Restore any previous selection for this question
  const saved = state.answers[idx];
  state.selected = saved ? [...saved.selected] : [];

  // Choices
  const list = $('choices-list');
  list.innerHTML = '';
  q.choices.forEach(c => {
    const div = document.createElement('div');
    div.className = 'choice-item';
    div.dataset.key = c.key;
    div.innerHTML = `<span class="choice-key">${c.key}</span><span class="choice-text">${c.text}</span>`;
    div.addEventListener('click', () => onChoiceClick(div, q));
    list.appendChild(div);
  });

  // Reset feedback
  const fb = $('feedback-box');
  fb.className = 'feedback-box hidden';
  fb.innerHTML = '';

  // Restore visual selection if already answered in practice mode
  if (saved && state.mode === 'practice') {
    applyFeedback(q, saved.selected);
    lockChoices();
    showPostAnswerButtons(idx);
  } else {
    restoreSelection();
    updateActionButtons();
  }

  // Flag button
  const flagBtn = $('btn-flag');
  if (state.mode === 'exam') {
    flagBtn.classList.remove('hidden');
    flagBtn.textContent = state.flagged.has(idx) ? '🚩 Flagged' : '🚩 Mark for Review';
    flagBtn.classList.toggle('btn-outline', state.flagged.has(idx));
  } else {
    flagBtn.classList.add('hidden');
  }

  updateNavGrid();
}

// ─── Choice selection ─────────────────────────────────────────────
function onChoiceClick(div, q) {
  // Disabled when already answered in practice
  if (div.classList.contains('disabled')) return;

  const key = div.dataset.key;

  if (q.type === 'single') {
    // Deselect all, select clicked
    document.querySelectorAll('.choice-item').forEach(d => d.classList.remove('selected'));
    state.selected = [key];
    div.classList.add('selected');
  } else {
    // Toggle
    if (div.classList.contains('selected')) {
      div.classList.remove('selected');
      state.selected = state.selected.filter(k => k !== key);
    } else {
      div.classList.add('selected');
      state.selected.push(key);
    }
  }

  updateActionButtons();

  // Exam mode: auto-save selection
  if (state.mode === 'exam') {
    autoSaveAnswer();
    updateNavGrid();
  }
}

function restoreSelection() {
  state.selected.forEach(key => {
    const el = document.querySelector(`.choice-item[data-key="${key}"]`);
    if (el) el.classList.add('selected');
  });
}

// ─── Action buttons ───────────────────────────────────────────────
function updateActionButtons() {
  const idx   = state.current;
  const total = state.questions.length;
  const hasSelection = state.selected.length > 0;

  if (state.mode === 'practice') {
    const answered = state.answers[idx] !== null;
    const isLast   = idx === total - 1;
    $('btn-check').classList.toggle('hidden', answered || !hasSelection);
    $('btn-next').classList.toggle('hidden', !answered || isLast);
    $('btn-submit').classList.toggle('hidden', !(answered && isLast));
  } else {
    // Exam mode
    $('btn-check').classList.add('hidden');
    const isLast = idx === total - 1;
    $('btn-next').classList.toggle('hidden', isLast);
    $('btn-submit').classList.toggle('hidden', !isLast);
  }
}

function showPostAnswerButtons(idx) {
  const total  = state.questions.length;
  const isLast = idx === total - 1;
  if (state.mode === 'practice') {
    $('btn-check').classList.add('hidden');
    $('btn-next').classList.toggle('hidden', isLast);
    $('btn-submit').classList.toggle('hidden', !isLast);
  }
}

// ─── Check answer (practice mode) ────────────────────────────────
$('btn-check').addEventListener('click', () => {
  const idx = state.current;
  const q   = state.questions[idx];

  if (state.selected.length === 0) return;

  const selected = [...state.selected];
  const correct  = isCorrect(selected, q.answer);

  state.answers[idx] = { selected, correct };

  applyFeedback(q, selected);
  lockChoices();
  showPostAnswerButtons(idx);

  // Auto-advance in practice mode
  if (appSettings.autoAdvance && idx < state.questions.length - 1) {
    setTimeout(() => {
      state.current++;
      state.selected = [];
      renderQuestion();
    }, 1200);
  }
});

function isCorrect(selected, answer) {
  if (selected.length !== answer.length) return false;
  const s = [...selected].sort().join('');
  const a = [...answer].sort().join('');
  return s === a;
}

function applyFeedback(q, selected) {
  // Colour choices
  document.querySelectorAll('.choice-item').forEach(div => {
    const key = div.dataset.key;
    const isSelected = selected.includes(key);
    const isAnswer   = q.answer.includes(key);

    if (isSelected && isAnswer)   div.classList.add('correct');
    else if (isSelected && !isAnswer) div.classList.add('wrong');
    else if (!isSelected && isAnswer) div.classList.add('missed');
  });

  // Feedback box (practice only)
  if (state.mode === 'practice') {
    const correct = isCorrect(selected, q.answer);
    const fb = $('feedback-box');
    fb.innerHTML = correct
      ? `<strong>✅ Correct!</strong> The answer is <strong>${q.answer.join(', ')}</strong>.`
      : `<strong>❌ Incorrect.</strong> The correct answer is <strong>${q.answer.join(', ')}</strong>.`;
    fb.className = `feedback-box ${correct ? 'correct-fb' : 'wrong-fb'}`;
  }
}

function lockChoices() {
  document.querySelectorAll('.choice-item').forEach(d => d.classList.add('disabled'));
}

// ─── Exam mode: auto-save without revealing answer ────────────────
function autoSaveAnswer() {
  const idx = state.current;
  const q   = state.questions[idx];
  if (state.selected.length > 0) {
    state.answers[idx] = {
      selected: [...state.selected],
      correct: isCorrect(state.selected, q.answer),
    };
  }
}

// ─── Navigation ───────────────────────────────────────────────────
$('btn-next').addEventListener('click', () => {
  if (state.mode === 'exam') autoSaveAnswer();
  state.current++;
  state.selected = [];
  renderQuestion();
});

$('btn-flag').addEventListener('click', () => {
  const idx = state.current;
  if (state.flagged.has(idx)) state.flagged.delete(idx);
  else state.flagged.add(idx);
  $('btn-flag').textContent = state.flagged.has(idx) ? '🚩 Flagged' : '🚩 Mark for Review';
  $('btn-flag').classList.toggle('btn-outline', state.flagged.has(idx));
  updateNavGrid();
});

$('btn-quit').addEventListener('click', () => {
  const doQuit = !appSettings.confirmQuit || confirm('Quit this session? Progress will be lost.');
  if (doQuit) {
    clearInterval(state.timer);
    showScreen('start');
  }
});

// ─── Nav grid ─────────────────────────────────────────────────────
function buildNavGrid() {
  const grid = $('nav-grid');
  grid.innerHTML = '';
  state.questions.forEach((_, i) => {
    const cell = document.createElement('div');
    cell.className = 'nav-cell';
    cell.textContent = i + 1;
    cell.addEventListener('click', () => {
      if (state.mode === 'exam') autoSaveAnswer();
      state.current = i;
      state.selected = [];
      renderQuestion();
    });
    grid.appendChild(cell);
  });
}

function updateNavGrid() {
  if (state.mode !== 'exam') return;
  const cells = $('nav-grid').querySelectorAll('.nav-cell');
  cells.forEach((cell, i) => {
    cell.className = 'nav-cell';
    if (i === state.current)  cell.classList.add('current');
    else if (state.flagged.has(i)) cell.classList.add('flagged');
    else if (state.answers[i])     cell.classList.add('answered');
  });
}

// ─── Submit exam ──────────────────────────────────────────────────
$('btn-submit').addEventListener('click', () => {
  autoSaveAnswer();
  submitExam();
});

$('btn-go-submit').addEventListener('click', () => {
  autoSaveAnswer();
  submitExam();
});

function submitExam() {
  clearInterval(state.timer);
  showResults();
}

// ─── Results ──────────────────────────────────────────────────────
function showResults() {
  const total     = state.questions.length;
  const answered  = state.answers.filter(Boolean).length;
  const correct   = state.answers.filter(a => a && a.correct).length;
  const incorrect = state.answers.filter(a => a && !a.correct).length;
  const skipped   = total - answered;
  const pct       = total ? Math.round((correct / total) * 100) : 0;
  const threshold = appSettings.passThreshold;
  const passed    = pct >= threshold;

  $('result-verdict').textContent  = passed ? '🎉' : '📖';
  $('result-score').textContent    = `${correct} / ${total} (${pct}%)`;
  $('stat-answered').textContent   = answered;
  $('stat-correct').textContent    = correct;
  $('stat-incorrect').textContent  = incorrect;
  $('stat-skipped').textContent    = skipped;
  $('result-sub').textContent      = passed
    ? 'Congratulations! You would pass this exam.'
    : `You need ${threshold}% to pass. Keep practicing!`;

  // Topic breakdown
  const topicMap = {};
  state.questions.forEach((q, i) => {
    const t = q.topic || 'Other';
    if (!topicMap[t]) topicMap[t] = { total: 0, correct: 0 };
    topicMap[t].total++;
    const ans = state.answers[i];
    if (ans && ans.correct) topicMap[t].correct++;
  });

  const breakdown = $('topic-breakdown');
  breakdown.innerHTML = '<strong style="font-size:.85rem;color:#444">By Topic</strong>';
  Object.entries(topicMap).sort((a, b) => a[0].localeCompare(b[0])).forEach(([topic, data]) => {
    const p = Math.round((data.correct / data.total) * 100);
    const thr = appSettings.passThreshold;
    const color = p >= thr ? '#2e844a' : p >= thr * 0.75 ? '#dd7a01' : '#ba0517';
    breakdown.innerHTML += `
      <div class="topic-row">
        <span class="topic-name">${topic}</span>
        <div class="topic-bar-wrap"><div class="topic-bar" style="width:${p}%;background:${color}"></div></div>
        <span class="topic-pct" style="color:${color}">${p}%</span>
      </div>`;
  });

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
}

// ─── Review ───────────────────────────────────────────────────────
$('btn-review').addEventListener('click', () => {
  buildReview();
  showScreen('review');
});

$('btn-back-results').addEventListener('click', () => showScreen('results'));

function buildReview() {
  const list = $('review-list');
  list.innerHTML = '';

  state.questions.forEach((q, i) => {
    const ans = state.answers[i];
    const selected = ans ? ans.selected : [];
    const correct  = ans ? ans.correct  : false;

    const item = document.createElement('div');
    item.className = `review-item ${correct ? 'r-correct' : 'r-wrong'}`;

    const verdict = correct ? 'Correct' : ans ? 'Incorrect' : 'Skipped';
    const vClass  = correct ? 'correct' : 'wrong';

    let choicesHtml = '';
    q.choices.forEach(c => {
      const isSelected = selected.includes(c.key);
      const isAnswer   = q.answer.includes(c.key);
      let cls = '';
      if (isSelected && isAnswer)   cls = 'r-selected-correct';
      else if (isSelected)          cls = 'r-selected-wrong';
      else if (isAnswer)            cls = 'r-missed';

      choicesHtml += `<div class="review-choice ${cls}">
        <strong>${c.key}.</strong> ${c.text}
      </div>`;
    });

    item.innerHTML = `
      <div class="review-item-header">
        <span class="review-q-num">Q${i + 1}</span>
        <span class="review-verdict ${vClass}">${verdict}</span>
        <span class="q-topic" style="margin-left:auto">${q.topic || ''}</span>
      </div>
      <p class="review-q-text">${q.text}</p>
      <div class="review-choices">${choicesHtml}</div>
    `;
    list.appendChild(item);
  });
}

// ─── Restart ──────────────────────────────────────────────────────
$('btn-restart').addEventListener('click', () => {
  clearInterval(state.timer);
  showScreen('start');
});

// ─── History screen ───────────────────────────────────────────────
let historyReturnScreen = 'results';

$('btn-history').addEventListener('click', async () => {
  historyReturnScreen = 'results';
  await buildHistory();
  showScreen('history');
});

$('btn-history-start').addEventListener('click', async () => {
  historyReturnScreen = 'start';
  await buildHistory();
  showScreen('history');
});

$('btn-back-from-history').addEventListener('click', () => showScreen(historyReturnScreen));

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
      const thr2 = appSettings.passThreshold;
      const color = p >= thr2 ? 'var(--sf-green)' : p >= thr2 * 0.75 ? 'var(--sf-orange)' : 'var(--sf-red)';
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

// ─── Keyboard shortcuts ───────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!appSettings.keyboardShortcuts) return;
  if (!screens.exam.classList.contains('active')) return;
  // Ignore when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  const key = e.key.toUpperCase();

  // A–E select choices
  if (['A','B','C','D','E'].includes(key)) {
    const choice = document.querySelector(`.choice-item[data-key="${key}"]:not(.disabled)`);
    if (choice) choice.click();
    return;
  }

  // Enter: check answer or advance
  if (e.key === 'Enter') {
    const check = $('btn-check');
    const next  = $('btn-next');
    const submit = $('btn-submit');
    if (check && !check.classList.contains('hidden')) { check.click(); return; }
    if (next  && !next.classList.contains('hidden'))  { next.click();  return; }
    if (submit && !submit.classList.contains('hidden')) { submit.click(); }
  }

  // F: flag question (exam mode)
  if (key === 'F') {
    const flag = $('btn-flag');
    if (flag && !flag.classList.contains('hidden')) flag.click();
  }
});
