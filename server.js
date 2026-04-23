const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app      = express();
const PORT     = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── helpers ────────────────────────────────────────────────────────────────

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Return all team IDs a user may VIEW (calendar visibility).
 * - canViewAll team → all teams
 * - Parent team    → itself + all children (recursive)
 * - Leaf team      → only itself
 */
function viewableTeams(actorTeamId, teams) {
  const actorTeam = teams.find(t => t.id === actorTeamId);
  if (!actorTeam) return [];
  if (actorTeam.canViewAll) return teams.map(t => t.id);
  const children = teams.filter(t => t.parentId === actorTeamId).map(t => t.id);
  return [actorTeamId, ...children];
}

/**
 * Check whether `actor` may add/edit/delete leave for `targetUserId`.
 * Security rules:
 *   1. canViewAll team (management, controller) → can manage anyone
 *   2. role === "leader"                        → can manage own team members
 *   3. role === "member"                        → can only manage themselves
 */
function canEditForUser(actor, targetUserId, users, teams) {
  if (!actor) return false;

  // Always allow editing own records
  if (actor.id === targetUserId) return true;

  const actorTeam = teams.find(t => t.id === actor.teamId);

  // canViewAll (management / controller) can manage everyone
  if (actorTeam && actorTeam.canViewAll) return true;

  // Leaders can manage their own team (and sub-teams)
  if (actor.role === 'leader') {
    const target = users.find(u => u.id === targetUserId);
    if (!target) return false;
    const teamScope = [actor.teamId, ...teams.filter(t => t.parentId === actor.teamId).map(t => t.id)];
    return teamScope.includes(target.teamId);
  }

  // Regular members: cannot edit on behalf of others
  return false;
}

// ─── auth / login ────────────────────────────────────────────────────────────

app.post('/api/login', (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const data = readData();
  const user = data.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'Email not recognised. Please contact your admin.' });

  const team       = data.teams.find(t => t.id === user.teamId) || null;
  const parentTeam = team && team.parentId ? data.teams.find(t => t.id === team.parentId) : null;

  res.json({ user, team, parentTeam });
});

// ─── teams ───────────────────────────────────────────────────────────────────

app.get('/api/teams', (_req, res) => {
  const data = readData();
  res.json(data.teams);
});

// ─── users ───────────────────────────────────────────────────────────────────

app.get('/api/users', (req, res) => {
  const { teamId } = req.query;
  const data = readData();
  const users = teamId && teamId !== 'all'
    ? data.users.filter(u => u.teamId === teamId)
    : data.users;
  res.json(users);
});

/** Update a user's name / email (admin convenience) */
app.put('/api/users/:id', (req, res) => {
  const data = readData();
  const idx  = data.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });
  data.users[idx] = { ...data.users[idx], ...req.body, id: data.users[idx].id };
  writeData(data);
  res.json(data.users[idx]);
});

// ─── calendar ────────────────────────────────────────────────────────────────

/**
 * GET /api/calendar?month=2026-04&teamId=accounting&actorId=u-a1
 * Returns users + leaves + wfh for the requested team/month.
 * actorId is used to restrict which teams the caller may fetch.
 */
app.get('/api/calendar', (req, res) => {
  const { month, teamId, actorId } = req.query;
  if (!month || !actorId) return res.status(400).json({ error: 'month and actorId are required.' });

  const data  = readData();
  const actor = data.users.find(u => u.id === actorId);
  if (!actor) return res.status(403).json({ error: 'Unknown actor.' });

  const allowed = viewableTeams(actor.teamId, data.teams);

  // Determine which users to return
  let users;
  if (!teamId || teamId === 'all') {
    // Only show teams the actor is allowed to view
    users = data.users.filter(u => allowed.includes(u.teamId));
  } else {
    if (!allowed.includes(teamId)) return res.status(403).json({ error: 'Access denied.' });
    users = data.users.filter(u => u.teamId === teamId);
  }

  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const startDate   = `${month}-01`;
  const endDate     = `${month}-${String(daysInMonth).padStart(2, '0')}`;
  const userIds     = users.map(u => u.id);

  const leaves = data.leaves.filter(l =>
    userIds.includes(l.userId) &&
    l.startDate <= endDate &&
    l.endDate   >= startDate
  );

  const wfh = data.wfh.filter(w =>
    userIds.includes(w.userId) && w.date.startsWith(month)
  );

  res.json({ users, leaves, wfh, teams: data.teams });
});

// ─── leave CRUD ──────────────────────────────────────────────────────────────

app.post('/api/leave', (req, res) => {
  const { userId, type, startDate, endDate, notes, halfDay, actorId } = req.body || {};
  if (!userId || !type || !startDate || !endDate || !actorId)
    return res.status(400).json({ error: 'Missing required fields.' });

  const data   = readData();
  const target = data.users.find(u => u.id === userId);
  const actor  = data.users.find(u => u.id === actorId);
  if (!target || !actor) return res.status(400).json({ error: 'User not found.' });

  if (!canEditForUser(actor, userId, data.users, data.teams))
    return res.status(403).json({ error: 'You can only manage your own leave, or your team\'s leave if you are a team leader.' });

  if (startDate > endDate)
    return res.status(400).json({ error: 'Start date must be on or before end date.' });

  const leave = { id: genId(), userId, type, startDate, endDate, notes: notes || '', halfDay: halfDay || null, actorId, createdAt: new Date().toISOString() };
  data.leaves.push(leave);
  writeData(data);
  res.json(leave);
});

app.put('/api/leave/:id', (req, res) => {
  const { type, startDate, endDate, notes, halfDay, actorId } = req.body || {};
  const data   = readData();
  const idx    = data.leaves.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Leave record not found.' });

  const leave  = data.leaves[idx];
  const target = data.users.find(u => u.id === leave.userId);
  const actor  = data.users.find(u => u.id === actorId);
  if (!target || !actor) return res.status(400).json({ error: 'User not found.' });

  if (!canEditForUser(actor, leave.userId, data.users, data.teams))
    return res.status(403).json({ error: 'Access denied.' });

  if (startDate > endDate)
    return res.status(400).json({ error: 'Start date must be on or before end date.' });

  data.leaves[idx] = { ...leave, type, startDate, endDate, notes: notes || '', halfDay: halfDay || null, updatedAt: new Date().toISOString() };
  writeData(data);
  res.json(data.leaves[idx]);
});

app.delete('/api/leave/:id', (req, res) => {
  const actorId = req.query.actorId;
  const data    = readData();
  const idx     = data.leaves.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Leave record not found.' });

  const leave  = data.leaves[idx];
  const actor  = data.users.find(u => u.id === actorId);

  if (actor && !canEditForUser(actor, leave.userId, data.users, data.teams))
    return res.status(403).json({ error: 'Access denied.' });

  data.leaves.splice(idx, 1);
  writeData(data);
  res.json({ success: true });
});

// ─── WFH CRUD ────────────────────────────────────────────────────────────────

app.post('/api/wfh', (req, res) => {
  const { userId, date, actorId } = req.body || {};
  if (!userId || !date || !actorId)
    return res.status(400).json({ error: 'Missing required fields.' });

  const data   = readData();
  const target = data.users.find(u => u.id === userId);
  const actor  = data.users.find(u => u.id === actorId);
  if (!target || !actor) return res.status(400).json({ error: 'User not found.' });

  if (!canEditForUser(actor, userId, data.users, data.teams))
    return res.status(403).json({ error: 'You can only manage your own leave, or your team\'s leave if you are a team leader.' });

  // Enforce 2-per-month cap
  const month      = date.substring(0, 7);
  const monthCount = data.wfh.filter(w => w.userId === userId && w.date.startsWith(month)).length;
  if (monthCount >= 2)
    return res.status(400).json({ error: `WFH limit reached (2 per month). ${target.name} has already used both WFH days this month.` });

  if (data.wfh.find(w => w.userId === userId && w.date === date))
    return res.status(400).json({ error: 'WFH already recorded for this date.' });

  const wfh = { id: genId(), userId, date, actorId, createdAt: new Date().toISOString() };
  data.wfh.push(wfh);
  writeData(data);
  res.json(wfh);
});

app.delete('/api/wfh/:id', (req, res) => {
  const actorId = req.query.actorId;
  const data    = readData();
  const idx     = data.wfh.findIndex(w => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'WFH record not found.' });

  const wfh   = data.wfh[idx];
  const actor = data.users.find(u => u.id === actorId);

  if (actor && !canEditForUser(actor, wfh.userId, data.users, data.teams))
    return res.status(403).json({ error: 'Access denied.' });

  data.wfh.splice(idx, 1);
  writeData(data);
  res.json({ success: true });
});

// ─── start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  Team Leave Calendar is running!`);
  console.log(`  Open: http://localhost:${PORT}\n`);
});
