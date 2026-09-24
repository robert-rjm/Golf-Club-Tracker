// ── SAVED COURSES ──
// Courses added in the course editor live in localStorage and are merged into COURSES.
// A courses.js entry with the same name wins.
const BUILTIN_COURSES = Object.keys(COURSES);
const BUILTIN_PRESETS = PRESET_COURSES.filter(n => n !== 'Others');
let userCourses = {};
try { userCourses = JSON.parse(localStorage.getItem('gct_usercourses')) || {}; } catch (e) {}

// Tees used to be { colour }. Renames it in courses saved on the phone, and in a courses.js
// entry pasted from an older course submission.
function renameOldTeeKey(course) {
  let changed = false;
  (course.tees || []).forEach(t => {
    if ('colour' in t) { t.color = t.colour; delete t.colour; changed = true; }
  });
  return changed;
}
Object.values(COURSES).forEach(renameOldTeeKey);
if (Object.values(userCourses).map(renameOldTeeKey).some(Boolean)) {
  localStorage.setItem('gct_usercourses', JSON.stringify(userCourses));
}

function applyUserCourses() {
  Object.keys(COURSES).forEach(k => { if (!BUILTIN_COURSES.includes(k)) delete COURSES[k]; });
  const names = [];
  Object.keys(userCourses).forEach(k => {
    if (BUILTIN_COURSES.includes(k)) return;
    COURSES[k] = userCourses[k];
    const base = k.replace(/\s*-\s*\d+\s*Hole$/i, '');
    if (!BUILTIN_PRESETS.includes(base) && !names.includes(base)) names.push(base);
  });
  PRESET_COURSES.splice(0, PRESET_COURSES.length, ...BUILTIN_PRESETS, ...names, 'Others');
}

function saveUserCourses() {
  localStorage.setItem('gct_usercourses', JSON.stringify(userCourses));
  applyUserCourses();
}

applyUserCourses();

// ── COURSE EDITOR ──
// Draft: { name, note, holes: [{ par, si }], ratingPar, tees: [{ color, players, sss, slope }], defaultTee }.
// Number fields hold the raw input strings until save.
let courseDraft = null;
let courseDraftKey = null; // key being edited, null for a new course

function openCourseEditor(key) {
  courseDraftKey = key;
  const c = key ? userCourses[key] : null;
  if (c) {
    const tees = c.tees
      ? c.tees.map(t => ({ color: t.color, players: t.players || '', sss: String(t.sss), slope: String(t.slope) }))
      : (c.sss != null ? [{ color: 'Default', players: '', sss: String(c.sss), slope: String(c.slope) }] : []);
    courseDraft = {
      name: key, note: c.note || '',
      holes: c.holes.map(h => ({ par: h.par, si: h.si == null ? '' : String(h.si) })),
      ratingPar: String(c.ratingPar ?? c.par),
      tees, defaultTee: c.defaultTee || (tees[0] ? tees[0].color : '')
    };
  } else if (isCustomCourse(selectedCourse) && selectedCourse && selectedCourse !== 'Others') {
    // Start from name typed in course search
    const n = selectedHoles || customHolePars.length || 18;
    courseDraft = {
      name: selectedCourse, note: '',
      holes: Array.from({ length: n }, (_, i) => ({ par: customHolePars[i] || 4, si: '' })),
      ratingPar: '',
      tees: customSSS != null && customSlope != null
        ? [{ color: 'Default', players: '', sss: String(customSSS), slope: String(customSlope) }]
        : [{ color: 'Yellow', players: '', sss: '', slope: '' }],
      defaultTee: customSSS != null && customSlope != null ? 'Default' : 'Yellow'
    };
  } else {
    courseDraft = {
      name: '', note: '',
      holes: Array.from({ length: 18 }, () => ({ par: 4, si: '' })),
      ratingPar: '',
      tees: [{ color: 'Yellow', players: '', sss: '', slope: '' }],
      defaultTee: 'Yellow'
    };
  }
  document.getElementById('courseEditTitle').textContent = key ? 'Edit Course' : 'New Course';
  document.getElementById('courseEditDelete').style.display = key ? '' : 'none';
  document.getElementById('courseEditError').textContent = '';
  buildCourseEditor();
  showOverlay('courseEditOverlay');
  document.getElementById('courseEditBody').scrollTop = 0;
}

function draftPar() {
  return courseDraft.holes.reduce((s, h) => s + h.par, 0);
}

// 18-hole par the ratings are measured against, defaulting to par scaled to 18 holes
function draftRatingPar() {
  const n = courseDraft.holes.length;
  if (n === 18) return draftPar();
  const v = parseFloat(courseDraft.ratingPar);
  return isNaN(v) ? Math.round(draftPar() * 18 / n) : v;
}

// Suggested tee names: the usual colors, then any other name a course already uses
const COMMON_TEE_COLORS = ['Black', 'White', 'Yellow', 'Blue', 'Red', 'Green', 'Orange', 'Purple', 'Gold', 'Silver'];
function teeColorSuggestions() {
  const used = Object.values(COURSES).flatMap(c => (c.tees || []).map(t => t.color));
  return [...new Set([...COMMON_TEE_COLORS, ...used])].filter(c => c && c !== 'Default');
}

function buildCourseEditor() {
  const body = document.getElementById('courseEditBody');
  const d = courseDraft;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const n = d.holes.length;
  const colors = [...new Set(d.tees.map(t => t.color.trim()).filter(Boolean))];

  body.innerHTML = `
    <div class="lobby-section">
      <div class="lobby-label">Course name</div>
      <input type="text" class="lobby-custom-input" data-f="name" value="${esc(d.name)}" placeholder="e.g. Golf de Divonne">
      <input type="text" class="lobby-custom-input ce-small" data-f="note" value="${esc(d.note)}" placeholder="Source of the ratings, e.g. scorecard URL (optional)">
    </div>
    <div class="lobby-section">
      <div class="lobby-label">Holes</div>
      <div class="lobby-opts">
        ${[9, 18].map(v => `<button class="lobby-opt${n === v ? ' sel' : ''}" data-holes="${v}">${v} holes</button>`).join('')}
        <input type="number" class="lobby-custom-input ce-count" data-f="count" min="1" max="18" value="${n}" aria-label="Number of holes">
      </div>
    </div>
    <div class="lobby-section">
      <div class="lobby-label">Par &amp; stroke index · total par <span id="ceParTotal">${draftPar()}</span></div>
      <div class="ce-hint">Stroke index is 1 for the hardest hole. Leave blank if you don't know it.</div>
      <div class="par-grid-vertical">
        ${d.holes.map((h, i) => `
          <div class="par-grid-row">
            <span class="par-grid-num">Hole ${i + 1}</span>
            <div style="display:flex;gap:6px;align-items:center">
              ${[3, 4, 5].map(p => `<button class="par-val-btn${h.par === p ? ' sel' : ''}" data-hole="${i}" data-par="${p}">${p}</button>`).join('')}
              <input type="number" class="lobby-custom-input ce-si" data-hole="${i}" data-f="si" min="1" max="18" value="${esc(h.si)}" placeholder="SI" aria-label="Stroke index hole ${i + 1}">
            </div>
          </div>`).join('')}
      </div>
    </div>
    <div class="lobby-section">
      <div class="lobby-label">Tees &amp; ratings</div>
      <div class="ce-hint">Course rating (SSS) and slope from the scorecard, as 18-hole values even on a 9-hole course.
        Add a row per tee, or per tee and men/ladies.</div>
      ${d.tees.map((t, i) => `
        <div class="ce-tee">
          <input type="text" class="lobby-custom-input" data-tee="${i}" data-f="color" value="${esc(t.color)}" placeholder="Tee (e.g. Yellow)" list="ceTeeColors" autocomplete="off">
          <select class="lobby-custom-input" data-tee="${i}" data-f="players">
            ${[['', 'Everyone'], ['men', 'Men'], ['ladies', 'Ladies']].map(([v, l]) =>
              `<option value="${v}"${t.players === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
          <input type="number" step="0.1" class="lobby-custom-input" data-tee="${i}" data-f="sss" value="${esc(t.sss)}" placeholder="SSS">
          <input type="number" step="1" class="lobby-custom-input" data-tee="${i}" data-f="slope" value="${esc(t.slope)}" placeholder="Slope">
          <button class="ce-remove" data-remove-tee="${i}" aria-label="Remove tee">×</button>
        </div>`).join('')}
      <datalist id="ceTeeColors">
        ${teeColorSuggestions().map(c => `<option value="${esc(c)}">`).join('')}
      </datalist>
      <button class="course-tool-btn" id="ceAddTee">＋ Add tee</button>
      ${colors.length > 1 ? `
        <div class="lobby-label" style="font-size:12px;margin-top:4px">Default tee</div>
        <select class="lobby-custom-input" data-f="defaultTee">
          ${colors.map(c => `<option value="${esc(c)}"${d.defaultTee === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
        </select>` : ''}
    </div>
    ${n === 18 ? '' : `
    <div class="lobby-section">
      <div class="lobby-label">Rating par (18 holes)</div>
      <div class="ce-hint">The par the SSS was measured against. For a 9-hole course that's usually twice the 9-hole par.</div>
      <input type="number" class="lobby-custom-input" data-f="ratingPar" value="${esc(d.ratingPar)}" placeholder="${draftRatingPar()}">
    </div>`}
    <div class="lobby-section">
      ${shareEnabled() ? '<div class="ce-hint">Saved courses are also sent to the app\'s author so they can be added for everyone.</div>' : ''}
      <button class="course-tool-btn" id="ceCopy">⧉ Copy as courses.js entry</button>
    </div>`;

  // Text and number fields update the draft without a rebuild, so focus is kept
  body.querySelectorAll('input[data-f], select[data-f]').forEach(el => {
    el.addEventListener('input', () => {
      const f = el.dataset.f;
      if (el.dataset.hole !== undefined) d.holes[el.dataset.hole].si = el.value;
      else if (el.dataset.tee !== undefined) d.tees[el.dataset.tee][f] = el.value;
      else if (f !== 'count') d[f] = el.value;
    });
  });
  // Tee colors feed the default tee list
  body.querySelectorAll('[data-f="color"]').forEach(el => el.addEventListener('change', buildCourseEditor));
  body.querySelector('[data-f="count"]').addEventListener('change', e => {
    setDraftHoleCount(parseInt(e.target.value, 10));
  });
  body.querySelectorAll('[data-holes]').forEach(btn => btn.addEventListener('click', () => {
    setDraftHoleCount(parseInt(btn.dataset.holes, 10));
  }));
  body.querySelectorAll('.par-val-btn').forEach(btn => btn.addEventListener('click', () => {
    d.holes[btn.dataset.hole].par = parseInt(btn.dataset.par, 10);
    btn.parentElement.querySelectorAll('.par-val-btn').forEach(b => b.classList.toggle('sel', b === btn));
    document.getElementById('ceParTotal').textContent = draftPar();
    const rp = body.querySelector('[data-f="ratingPar"]');
    if (rp) rp.placeholder = draftRatingPar();
  }));
  body.querySelectorAll('[data-remove-tee]').forEach(btn => btn.addEventListener('click', () => {
    d.tees.splice(parseInt(btn.dataset.removeTee, 10), 1);
    buildCourseEditor();
  }));
  document.getElementById('ceAddTee').addEventListener('click', () => {
    d.tees.push({ color: '', players: '', sss: '', slope: '' });
    buildCourseEditor();
  });
  document.getElementById('ceCopy').addEventListener('click', copyCourseSnippet);
}

function setDraftHoleCount(n) {
  if (isNaN(n) || n < 1 || n > 18) { buildCourseEditor(); return; }
  const holes = courseDraft.holes;
  courseDraft.holes = Array.from({ length: n }, (_, i) => holes[i] || { par: 4, si: '' });
  buildCourseEditor();
}

// Checks the draft and returns [key, entry], or throws a message for the user
function draftToEntry() {
  const d = courseDraft;
  const name = d.name.trim();
  if (!name) throw 'Give the course a name.';
  if (name.toLowerCase() === 'others') throw '"Others" is reserved, pick another name.';
  const base = name.replace(/\s*-\s*\d+\s*Hole$/i, '');
  if (BUILTIN_COURSES.includes(name) || BUILTIN_PRESETS.includes(base)) {
    throw `"${base}" is already built into the app.`;
  }
  if (name !== courseDraftKey && Object.keys(userCourses).some(k => sameName(k, name))) {
    throw `You already have a course called "${name}".`;
  }
  const n = d.holes.length;
  const seen = new Set();
  const holes = d.holes.map((h, i) => {
    if (String(h.si).trim() === '') return { par: h.par, si: null };
    const si = Number(h.si);
    if (!Number.isInteger(si) || si < 1 || si > 18) throw `Hole ${i + 1}: stroke index must be a whole number from 1 to 18.`;
    if (seen.has(si)) throw `Stroke index ${si} is used on more than one hole.`;
    seen.add(si);
    return { par: h.par, si };
  });
  const tees = d.tees.map((t, i) => {
    const color = t.color.trim();
    const sss = parseFloat(t.sss), slope = parseFloat(t.slope);
    if (!color) throw `Tee ${i + 1} needs a name, e.g. Yellow.`;
    if (isNaN(sss) || sss < 40 || sss > 85) throw `${color} tee: SSS should be an 18-hole rating, roughly 50 to 80.`;
    if (isNaN(slope) || slope < 55 || slope > 155) throw `${color} tee: slope must be between 55 and 155.`;
    const tee = { color };
    if (t.players) tee.players = t.players;
    return Object.assign(tee, { sss, slope });
  });
  const dupe = tees.find((t, i) => tees.findIndex(u => u.color === t.color && u.players === t.players) !== i);
  if (dupe) throw `The ${dupe.color} tee is listed twice.`;

  const par = holes.reduce((s, h) => s + h.par, 0);
  const ratingPar = draftRatingPar();
  if (n !== 18 && (ratingPar < 50 || ratingPar > 80)) throw 'Rating par should be an 18-hole par, roughly 54 to 74.';
  const entry = { par };
  if (ratingPar !== par) entry.ratingPar = ratingPar;
  if (tees.length === 1 && !tees[0].players) {
    entry.sss = tees[0].sss;
    entry.slope = tees[0].slope;
  } else if (tees.length) {
    const colors = tees.map(t => t.color);
    entry.defaultTee = colors.includes(d.defaultTee.trim()) ? d.defaultTee.trim() : colors[0];
    entry.tees = tees;
  }
  entry.holes = holes;
  if (d.note.trim()) entry.note = d.note.trim();
  return [name, entry];
}

function courseSnippet(name, c) {
  const q = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const lines = [`  ${q(name)}: {`];
  if (c.note) lines.push(`    // ${c.note}`);
  lines.push(`    par: ${c.par}${c.ratingPar != null ? `, ratingPar: ${c.ratingPar}` : ''},`);
  if (c.tees) {
    lines.push(`    defaultTee: ${q(c.defaultTee)},`, '    tees: [');
    c.tees.forEach(t => lines.push(`      { color: ${q(t.color)}, ${t.players ? `players: ${q(t.players)}, ` : ''}sss: ${t.sss}, slope: ${t.slope} },`));
    lines.push('    ],');
  } else {
    lines.push(`    sss: ${c.sss ?? null}, slope: ${c.slope ?? null},`);
  }
  lines.push('    holes: [');
  c.holes.forEach(h => lines.push(`      { par: ${h.par}, si: ${h.si} },`));
  lines.push('    ]', '  },');
  return lines.join('\n');
}

function copyCourseSnippet() {
  const err = document.getElementById('courseEditError');
  let name, entry;
  try { [name, entry] = draftToEntry(); } catch (msg) { err.textContent = msg; return; }
  const text = courseSnippet(name, entry);
  const btn = document.getElementById('ceCopy');
  navigator.clipboard.writeText(text).then(() => {
    err.textContent = '';
    btn.textContent = '✓ Copied. Paste it into COURSES in courses.js.';
  }, () => { err.textContent = 'Could not copy to the clipboard.'; });
}

// ── COURSE SUBMISSION ──
// The latest save's submission, shown under the course buttons: { name, entry, state }.
// submit_course returns false when the hourly limit is reached, so that counts as failed too.
let courseSubmission = null;

function submitCourse(name, entry) {
  const sub = { name, entry, state: 'sending' };
  courseSubmission = sub;
  supabaseRpc('submit_course', { p_name: name, p_snippet: courseSnippet(name, entry), p_data: entry })
    .then(ok => { sub.state = ok ? 'sent' : 'failed'; }, () => { sub.state = 'failed'; })
    .then(() => { if (courseSubmission === sub) buildCourseTools(); });
}

function buildSubmissionStatus(wrap) {
  const sub = courseSubmission;
  if (!sub) return;
  const status = document.createElement('div');
  status.className = 'course-submit-status ' + sub.state;
  status.textContent = {
    sending: `Sending "${sub.name}" for review…`,
    sent:    `✓ "${sub.name}" sent for review`,
    failed:  `Couldn't send "${sub.name}" for review. It's saved on your phone, so you can try again later.`
  }[sub.state];
  if (sub.state === 'failed') {
    const retry = document.createElement('button');
    retry.className = 'course-submit-retry';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => { submitCourse(sub.name, sub.entry); buildCourseTools(); });
    status.appendChild(retry);
  }
  wrap.appendChild(status);
}

document.getElementById('courseEditSave').addEventListener('click', () => {
  const err = document.getElementById('courseEditError');
  let name, entry;
  try { [name, entry] = draftToEntry(); } catch (msg) { err.textContent = msg; return; }
  err.textContent = '';
  const oldBase = courseDraftKey ? courseDraftKey.replace(/\s*-\s*\d+\s*Hole$/i, '') : null;
  if (courseDraftKey && courseDraftKey !== name) delete userCourses[courseDraftKey];
  userCourses[name] = entry;
  saveUserCourses();
  // Also sent to Supabase to be added to courses.js. The local copy works either way.
  if (shareEnabled()) submitCourse(name, entry);
  // Select the saved course, keeping the hole choice where it still fits
  const base = name.replace(/\s*-\s*\d+\s*Hole$/i, '');
  if (!courseDraftKey || selectedCourse === oldBase || isCustomCourse(selectedCourse)) {
    selectedCourse = base;
    customHolePars = [];
    customSSS = null;
    customSlope = null;
  }
  saveState();
  hideOverlay('courseEditOverlay');
  buildCourseOpts();
  buildHoleOpts(selectedCourse);
  updateLobbyStartBtn();
});

document.getElementById('courseEditDelete').addEventListener('click', () => {
  const key = courseDraftKey;
  if (!key || !confirm(`Delete ${key}? A round in progress on this course will lose its pars and ratings.`)) return;
  delete userCourses[key];
  saveUserCourses();
  if (selectedCourse === key.replace(/\s*-\s*\d+\s*Hole$/i, '') && isCustomCourse(selectedCourse)) selectedCourse = '';
  saveState();
  hideOverlay('courseEditOverlay');
  buildCourseOpts();
  buildHoleOpts(selectedCourse);
  updateLobbyStartBtn();
});

document.getElementById('courseEditClose').addEventListener('click', () => hideOverlay('courseEditOverlay'));
