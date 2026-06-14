'use strict';

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
const $ = id => document.getElementById(id);

const screens = {
  start:   $('screen-start'),
  exam:    $('screen-exam'),
  results: $('screen-results'),
  review:  $('screen-review'),
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
      state.secondsLeft = 92 * 60; // 1h 32m
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
    $('btn-check').classList.toggle('hidden', answered || !hasSelection);
    $('btn-next').classList.toggle('hidden', !answered || idx === total - 1);
    $('btn-submit').classList.add('hidden');
  } else {
    // Exam mode
    $('btn-check').classList.add('hidden');
    const isLast = idx === total - 1;
    $('btn-next').classList.toggle('hidden', isLast);
    $('btn-submit').classList.toggle('hidden', !isLast);
  }
}

function showPostAnswerButtons(idx) {
  const total = state.questions.length;
  if (state.mode === 'practice') {
    $('btn-check').classList.add('hidden');
    $('btn-next').classList.toggle('hidden', idx === total - 1);
    $('btn-submit').classList.add('hidden');
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
  if (confirm('Quit this session? Progress will be lost.')) {
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
  const total    = state.questions.length;
  const answered = state.answers.filter(Boolean).length;
  const correct  = state.answers.filter(a => a && a.correct).length;
  const pct      = Math.round((correct / total) * 100);
  const passed   = pct >= 68; // Salesforce passing ~68%

  $('result-verdict').textContent = passed ? '🎉' : '📖';
  $('result-score').textContent   = `${correct} / ${total} (${pct}%)`;
  $('result-sub').textContent     = passed
    ? 'Congratulations! You would pass this exam.'
    : `You need ~68% to pass. Keep practicing!`;

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
    const color = p >= 68 ? '#2e844a' : p >= 50 ? '#dd7a01' : '#ba0517';
    breakdown.innerHTML += `
      <div class="topic-row">
        <span class="topic-name">${topic}</span>
        <div class="topic-bar-wrap"><div class="topic-bar" style="width:${p}%;background:${color}"></div></div>
        <span class="topic-pct" style="color:${color}">${p}%</span>
      </div>`;
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
