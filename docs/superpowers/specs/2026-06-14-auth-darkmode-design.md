# Design Spec: User Auth + Dark Mode — cardsApp

**Date:** 2026-06-14  
**Status:** Approved

---

## Overview

Add user registration/login (to persist exam progress) and a dark mode toggle to the cardsApp Salesforce IAM Architect exam prep SPA.

---

## 1. Architecture

A Node/Express server (`server.js`) replaces opening `index.html` directly in the browser. It:
- Serves `index.html` and all static assets
- Exposes a REST API for auth and progress
- Persists data to `data/users.json` and `data/progress.json` (auto-created on first run)

Passwords hashed with `bcryptjs`. Session managed via a random token stored in `localStorage` (`authToken` + `authUser`). Token validated on every API call via a simple middleware check.

**Dependencies:** `express`, `bcryptjs` (no database required)

---

## 2. API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/register` | Create account `{ username, password }` → `{ token, username }` |
| POST | `/api/login` | Authenticate `{ username, password }` → `{ token, username }` |
| POST | `/api/progress` | Save session `{ token, ...sessionData }` → `{ ok }` |
| GET | `/api/progress` | Fetch user history `?token=xxx` → `{ sessions: [...] }` |

---

## 3. Auth UI — Login/Register Modal

- On load: if no valid `authToken` in `localStorage`, a modal overlay appears over the Start screen (Start screen is visible but non-interactive behind the modal)
- Modal has two tabs: **Login** and **Register**
  - Register: username, password, confirm password
  - Login: username, password
- On success: modal dismisses, a `👤 username · Logout` chip appears top-right on every screen
- Logout: clears `authToken`/`authUser` from `localStorage`, re-shows modal
- Error messages shown inline in the modal (wrong password, username taken, etc.)

---

## 4. Progress Saving

After every completed session (both Practice and Exam modes), the app POSTs to `/api/progress`.

**Session record shape:**
```json
{
  "userId": "username",
  "date": "2026-06-14T10:30:00Z",
  "set": "set2",
  "mode": "exam",
  "score": 52,
  "total": 81,
  "passed": true,
  "timeTaken": 3245,
  "topicBreakdown": {
    "Identity Management Concepts": { "correct": 8, "total": 10 }
  },
  "answers": [
    { "qIdx": 0, "text": "Question text...", "selected": ["D"], "correct": true }
  ]
}
```

A **"📋 My History"** button on the Results screen opens a **History screen** (new 5th screen). It shows a table of past sessions: date, set, mode, score, pass/fail. Clicking a row expands the topic breakdown for that session.

---

## 5. Dark Mode

- A `🌙` / `☀️` toggle button in the top-right corner of every screen
- Toggles a `dark` class on `<body>`
- All theme colours use CSS custom properties; `body.dark` block overrides them
- Preference saved to `localStorage` key `theme`, restored on page load
- Dark palette: deep navy background, card surfaces dark grey, text off-white, Salesforce blue retained for accents

---

## 6. Files Changed

| File | Change |
|------|--------|
| `server.js` | New — Express server + API routes |
| `package.json` | New — `express`, `bcryptjs` |
| `data/users.json` | Auto-created on first run |
| `data/progress.json` | Auto-created on first run |
| `index.html` | Add: modal, history screen, dark toggle button, user chip |
| `js/app.js` | Add: auth flow, modal logic, progress save/fetch, history screen render |
| `css/styles.css` | Add: dark mode CSS vars, modal styles, history screen styles |

---

## 7. Out of Scope

- Password reset / forgot password
- Per-question drill-down replay UI (data is stored, UI deferred)
- Multi-device sync (data lives on the server machine only)
