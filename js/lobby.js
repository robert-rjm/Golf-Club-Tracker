// The lobby: last round, course picker, holes, tees and Tee off.

// ── LAST ROUND ──
// Tee off replaces the round, so the one being left is kept for a restore
const ROUND_KEYS = [
  'gct_round', 'gct_hole', 'gct_holes', 'gct_selectedholes', 'gct_secondround',
  'gct_selectednine', 'gct_secondnine', 'gct_selectedstart', 'gct_selectedtee',
  'gct_course', 'gct_hcp', 'gct_custompars', 'gct_customsss', 'gct_customslope',
  'gct_trackclubs', 'gct_players', 'gct_sharecode', 'gct_sharesecret'
];
let lobbySnapshot = null; // round in progress when the lobby opened

function hasRoundData() {
  return roundStarted() || getSimplePlayers().some(p => p.round && p.round.some(Boolean));
}

function snapshotRound() {
  saveState();
  const data = {};
  ROUND_KEYS.forEach(k => { data[k] = localStorage.getItem(k); });
  return { savedAt: Date.now(), data };
}

function readLastRound() {
  try { return JSON.parse(localStorage.getItem('gct_lastround')); } catch (e) { return null; }
}

function buildRestoreBtn() {
  const btn = document.getElementById('restoreBtn');
  const last = readLastRound();
  if (!last) { btn.style.display = 'none'; return; }
  let shots = [];
  try { shots = JSON.parse(last.data.gct_round) || []; } catch (e) {}
  const logged = shots.filter(h => h.length).length;
  const date = new Date(last.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const info = [last.data.gct_course, `${logged}/${shots.length} holes`, date].filter(Boolean).join(' · ');
  btn.innerHTML = `↩ Restore last round<small>${escHtml(info)}</small>`;
  btn.style.display = '';
}

document.getElementById('restoreBtn').addEventListener('click', () => {
  const last = readLastRound();
  if (!last) return;
  // Swap, so the round being replaced can be restored in turn
  if (lobbySnapshot) localStorage.setItem('gct_lastround', JSON.stringify(lobbySnapshot));
  else localStorage.removeItem('gct_lastround');
  ROUND_KEYS.forEach(k => {
    if (last.data[k] === null) localStorage.removeItem(k);
    else localStorage.setItem(k, last.data[k]);
  });
  location.reload();
});

// ── LOBBY ──
function holeOptionsFor(course) {
  const counts = Object.keys(COURSES)
    .filter(k => k.replace(/\s*-\s*\d+\s*Hole$/i, '') === course)
    .map(k => COURSES[k].holes.length);
  const set = new Set(counts);
  // Any course with an 18-hole entry also offers 9 (front or back)
  if (set.has(18)) set.add(9);
  // A course with only a 9-hole entry offers 18 by playing that nine twice
  if (set.has(9) && !set.has(18)) set.add(18);
  // Unknown/custom courses default to 9 and 18
  if (set.size === 0) { set.add(9); set.add(18); }
  return [...set].sort((a, b) => a - b);
}

// True if 9 holes are sliced from an 18-hole entry
function nineIsDerived(course) {
  const entries = Object.keys(COURSES).filter(k =>
    k.replace(/\s*-\s*\d+\s*Hole$/i, '') === course
  );
  if (entries.length === 0) return false;
  const hasExplicit9 = entries.some(k => COURSES[k].holes.length === 9);
  return !hasExplicit9;
}

// True if 18 holes means playing a 9-hole course twice
function eighteenIsDoubledNine(course) {
  const entries = Object.keys(COURSES).filter(k =>
    k.replace(/\s*-\s*\d+\s*Hole$/i, '') === course
  );
  return entries.some(k => COURSES[k].holes.length === 9)
      && !entries.some(k => COURSES[k].holes.length === 18);
}

// Hole count shown in the lobby (a doubled nine shows as 18)
function lobbyHoleChoice() {
  return selectedHoles * (lobbySecondRound ? 2 : 1);
}

// True if the course has an 18-hole entry
function hasFullRound(course) {
  return Object.keys(COURSES).some(k =>
    k.replace(/\s*-\s*\d+\s*Hole$/i, '') === course && COURSES[k].holes.length === 18
  );
}

// COURSES entry the ratings come from. Not via buildCourseData, which needs selectedNine.
function courseEntry() {
  const explicit = Object.values(COURSES).find(c =>
    courseBaseName(c) === selectedCourse && c.holes.length === selectedHoles
  );
  if (explicit) return explicit;
  // A sliced nine is rated off the 18-hole entry
  if (selectedHoles === 9) {
    return Object.values(COURSES).find(c =>
      courseBaseName(c) === selectedCourse && c.holes.length === 18
    ) || null;
  }
  return null;
}

// Tees and categories for the chosen hole count, empty if the course has no tees
function teeColoursFor() {
  const c = courseEntry();
  return c && c.tees ? [...new Set(c.tees.map(t => t.colour))] : [];
}

function categoriesFor() {
  const c = courseEntry();
  return c && c.tees ? [...new Set(c.tees.filter(t => t.players).map(t => t.players))] : [];
}

// The detailed player ('You'). Everyone else is a partner.
function mainPlayer() {
  return players.find(p => p.mode === 'detailed') || players[0];
}

// Only shown when there's more than one tee
function buildTeeOpts() {
  const wrap    = document.getElementById('teeOpts');
  const section = document.getElementById('teeSection');
  const colours = teeColoursFor();
  wrap.innerHTML = '';
  if (colours.length < 2) {
    // Drop a tee from another course or hole count
    if (!colours.includes(selectedTee)) selectedTee = null;
    section.style.display = 'none';
    return;
  }
  const course = courseEntry();
  if (!colours.includes(selectedTee)) selectedTee = (course && course.defaultTee) || colours[0];
  // Too many tees for pills, use a dropdown
  const sel = document.createElement('select');
  sel.className = 'lobby-custom-input';
  sel.id = 'teeSelect';
  sel.innerHTML = colours.map(colour =>
    `<option value="${colour}"${selectedTee === colour ? ' selected' : ''}>${colour}${
      course && course.defaultTee === colour ? ' (default)' : ''}</option>`
  ).join('');
  sel.addEventListener('change', () => {
    selectedTee = sel.value;
    saveState();
    buildPlayerLobby();
    updateLobbyStartBtn();
  });
  wrap.appendChild(sel);
  section.style.display = '';
}

// Category for the detailed player, always exactly one selected
function buildCategoryOpts() {
  const wrap = document.getElementById('categoryOpts');
  const row  = document.getElementById('categoryRow');
  const cats = categoriesFor();
  wrap.innerHTML = '';
  const me = mainPlayer();
  if (cats.length < 2 || !me) { row.style.display = 'none'; return; }
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'lobby-opt' + (me.category === cat ? ' sel' : '');
    btn.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    btn.addEventListener('click', () => {
      me.category = cat;
      saveState();
      buildCategoryOpts();
      updateLobbyStartBtn();
    });
    wrap.appendChild(btn);
  });
  row.style.display = '';
}

// ── HOLES AND CUSTOM PARS ──
function buildStartOpts() {
  const startOpts = document.getElementById('startOpts');
  startOpts.innerHTML = '';
  [{ label: 'Start hole 1 (front)', val: 'front' }, { label: 'Start hole 10 (back)', val: 'back' }].forEach(({ label, val }) => {
    const btn = document.createElement('button');
    btn.className = 'lobby-opt' + (selectedStart === val ? ' sel' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      selectedStart = val;
      startOpts.querySelectorAll('.lobby-opt').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      updateLobbyStartBtn();
    });
    startOpts.appendChild(btn);
  });
  startOpts.style.display = '';
}

function buildNineOpts() {
  const nineOpts = document.getElementById('nineOpts');
  nineOpts.innerHTML = '';
  ['front', 'back'].forEach(side => {
    const btn = document.createElement('button');
    btn.className = 'lobby-opt' + (selectedNine === side ? ' sel' : '');
    btn.textContent = side.charAt(0).toUpperCase() + side.slice(1) + ' 9';
    btn.addEventListener('click', () => {
      selectedNine = side;
      nineOpts.querySelectorAll('.lobby-opt').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      updateLobbyStartBtn();
    });
    nineOpts.appendChild(btn);
  });
  nineOpts.style.display = '';
}

const GITHUB_REPO = 'robert-rjm/Golf-Club-Tracker';

function buildSubmitBtn() {
  const wrap = document.getElementById('submitCourse');
  wrap.innerHTML = '';
  // Only show if custom course with a name and at least some pars set
  const hasName = selectedCourse && selectedCourse !== 'Others';
  const hasPars = customHolePars.some(p => p !== null);
  if (!hasName || !hasPars) { wrap.style.display = 'none'; return; }

  const n = customHolePars.length;
  const allPars = customHolePars.every(p => p !== null);
  const totalPar = customHolePars.reduce((s, p) => s + (p || 0), 0);
  // Only a full set of pars makes a valid courses.js entry. The ratings are 18-hole
  // values, so a shorter course needs an 18-hole ratingPar, as in buildCourseData.
  let snippet = '';
  if (allPars) {
    const entry = { par: totalPar, sss: customSSS, slope: customSlope,
      holes: customHolePars.map(par => ({ par, si: null })) };
    if (n !== 18) entry.ratingPar = totalPar * 18 / n;
    snippet = `\n\n\`\`\`js\n${courseSnippet(selectedCourse, entry)}\n\`\`\``;
  }
  const body =
`### New course suggestion

**Course name:** ${selectedCourse}
**Holes:** ${n}
**Pars:** ${customHolePars.map(p => p ?? '?').join(', ')}${allPars ? ` (total ${totalPar})` : ''}
**Stroke index:** unknown
**SSS:** ${customSSS ?? 'unknown'}
**Slope:** ${customSlope ?? 'unknown'}${snippet}`;

  const url = `https://github.com/${GITHUB_REPO}/issues/new?`
    + `title=${encodeURIComponent(`Course suggestion: ${selectedCourse}`)}`
    + `&body=${encodeURIComponent(body)}`;

  const btn = document.createElement('button');
  btn.className = 'lobby-opt';
  btn.style.cssText = 'font-size:13px;opacity:0.7';
  btn.textContent = '⬆ Suggest this course for the app';
  btn.addEventListener('click', () => window.open(url, '_blank', 'noopener,noreferrer'));
  wrap.appendChild(btn);
  wrap.style.display = '';
}

function buildParPrompt(n) {
  const prompt = document.getElementById('parPrompt');
  const grid   = document.getElementById('parGrid');
  grid.style.display = 'none';
  grid.innerHTML = '';
  prompt.innerHTML = '';
  const label = document.createElement('div');
  label.className = 'lobby-label';
  label.style.marginBottom = '8px';
  label.textContent = 'Par per hole (optional)';
  prompt.appendChild(label);
  const btn = document.createElement('button');
  btn.className = 'lobby-opt';
  btn.textContent = 'Set par per hole';
  btn.addEventListener('click', () => {
    prompt.style.display = 'none';
    buildParGrid(n);
  });
  prompt.appendChild(btn);
  prompt.style.display = '';
}

function buildParGrid(n) {
  const grid = document.getElementById('parGrid');
  // Default unset holes to par 4
  customHolePars = Array.from({ length: n }, (_, i) => customHolePars[i] || 4);
  grid.innerHTML = '<div class="lobby-label" style="margin-bottom:8px">Par per hole</div><div class="par-grid-vertical" id="parGridInner"></div>';
  const inner = grid.querySelector('#parGridInner');
  customHolePars.forEach((val, i) => {
    const row = document.createElement('div');
    row.className = 'par-grid-row';
    const num = document.createElement('span');
    num.className = 'par-grid-num';
    num.textContent = `Hole ${i + 1}`;
    row.appendChild(num);
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:6px';
    [3, 4, 5].forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'par-val-btn' + (val === p ? ' sel' : '');
      btn.textContent = p;
      btn.addEventListener('click', () => {
        customHolePars[i] = p;
        btns.querySelectorAll('.par-val-btn').forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
        saveState();
        buildSubmitBtn();
      });
      btns.appendChild(btn);
    });
    row.appendChild(btns);
    inner.appendChild(row);
  });
  // SSS + Slope inputs
  const ratingWrap = document.createElement('div');
  ratingWrap.style.cssText = 'display:flex;gap:10px;margin-top:14px';
  [
    { label: 'SSS',   key: 'customSSS',   val: customSSS,   step: '0.1', placeholder: 'e.g. 70.2' },
    { label: 'Slope', key: 'customSlope', val: customSlope, step: '1',   placeholder: 'e.g. 113'  }
  ].forEach(({ label, key, val, step, placeholder }) => {
    const field = document.createElement('div');
    field.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:5px';
    const lbl = document.createElement('div');
    lbl.className = 'lobby-label';
    lbl.style.fontSize = '12px';
    lbl.textContent = label + ' (optional)';
    const inp = document.createElement('input');
    inp.type = 'number'; inp.step = step; inp.placeholder = placeholder;
    inp.className = 'lobby-custom-input';
    inp.style.padding = '10px 12px';
    if (val !== null) inp.value = val;
    inp.addEventListener('input', () => {
      const v = inp.value ? parseFloat(inp.value) : null;
      if (key === 'customSSS')   customSSS   = v;
      if (key === 'customSlope') customSlope = v;
      saveState();
      buildSubmitBtn();
    });
    field.appendChild(lbl);
    field.appendChild(inp);
    ratingWrap.appendChild(field);
  });
  inner.parentElement.appendChild(ratingWrap);

  grid.style.display = '';
  buildSubmitBtn();
}

function isCustomCourse(course) {
  return Object.keys(COURSES).filter(k =>
    k.replace(/\s*-\s*\d+\s*Hole$/i, '') === course
  ).length === 0;
}

function buildHoleOpts(course) {
  const holesOpts  = document.getElementById('holesOpts');
  const nineOpts   = document.getElementById('nineOpts');
  const startOpts  = document.getElementById('startOpts');
  const parPrompt  = document.getElementById('parPrompt');
  const parGrid    = document.getElementById('parGrid');
  const options = holeOptionsFor(course);
  // Re-express 18 for this course (doubled nine or real 18) before validating
  if (selectedHoles > 0) {
    const choice = lobbyHoleChoice();
    lobbySecondRound = choice === 18 && eighteenIsDoubledNine(course);
    selectedHoles = lobbySecondRound ? 9 : choice;
  }
  // If the current choice isn't valid for this course, reset it
  if (!options.includes(lobbyHoleChoice())) {
    selectedHoles = 0; selectedNine = null; secondNine = null; selectedStart = null;
    lobbySecondRound = false;
  }
  nineOpts.style.display = 'none';
  startOpts.style.display = 'none';
  parPrompt.style.display = 'none';
  parGrid.style.display = 'none';
  document.getElementById('submitCourse').style.display = 'none';
  holesOpts.innerHTML = '';
  options.forEach(n => {
    const btn = document.createElement('button');
    btn.className = 'lobby-opt' + (lobbyHoleChoice() === n ? ' sel' : '');
    btn.textContent = n + ' holes';
    btn.addEventListener('click', () => {
      // 18 on a 9-hole course: one lap plus the repeat flag
      lobbySecondRound = n === 18 && eighteenIsDoubledNine(selectedCourse);
      selectedHoles = lobbySecondRound ? 9 : n;
      selectedNine = null;
      secondNine = null;
      selectedStart = null;
      holesOpts.querySelectorAll('.lobby-opt').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      // Show front/back prompt if 9 holes is derived from 18
      if (n === 9 && nineIsDerived(selectedCourse)) {
        buildNineOpts();
      } else {
        nineOpts.style.display = 'none';
        nineOpts.innerHTML = '';
      }
      // Show start hole prompt for full 18 on a known course
      if (n === 18 && hasFullRound(selectedCourse)) {
        buildStartOpts();
      } else {
        startOpts.style.display = 'none';
        startOpts.innerHTML = '';
      }
      // Show par prompt for custom/Others courses
      if (isCustomCourse(selectedCourse)) {
        buildParPrompt(n);
      } else {
        parPrompt.style.display = 'none';
        parGrid.style.display = 'none';
        parGrid.innerHTML = '';
      }
      buildTeeOpts();
      buildCategoryOpts();
      buildPlayerLobby();
      updateLobbyStartBtn();
    });
    holesOpts.appendChild(btn);
  });
  // Re-show rows if already selected
  if (selectedHoles > 0) {
    if (lobbyHoleChoice() === 9 && nineIsDerived(course)) buildNineOpts();
    if (lobbyHoleChoice() === 18 && hasFullRound(course)) buildStartOpts();
    if (isCustomCourse(course)) {
      // If pars already saved, skip prompt and show grid + submit button directly
      if (customHolePars.some(p => p !== null)) {
        buildParGrid(selectedHoles);
        buildSubmitBtn();
      } else {
        buildParPrompt(selectedHoles);
      }
    }
  }
  buildTeeOpts();
  buildCategoryOpts();
  buildPlayerLobby();
}

function openLobby() {
  lobbySnapshot = hasRoundData() ? snapshotRound() : null;
  buildRestoreBtn();
  document.getElementById('followLobbyBtn').style.display = shareEnabled() ? '' : 'none';
  // Doubled nine shows as 18
  lobbySecondRound = secondRound && eighteenIsDoubledNine(selectedCourse);
  // 'Others' was the old placeholder for a course not yet named
  if (selectedCourse === 'Others') selectedCourse = '';
  buildCourseOpts();
  buildCourseSearch();

  // Hole buttons for the current course
  buildHoleOpts(selectedCourse);

  // HCP input
  const hcpInput = document.getElementById('hcpInput');
  hcpInput.value = hcp;
  hcpInput.oninput = () => {
    const v = parseInt(hcpInput.value, 10);
    // Blank falls back to the max handicap
    hcp = isNaN(v) ? DEFAULT_HCP : Math.min(54, Math.max(0, v));
  };

  buildPlayerLobby();

  updateLobbyStartBtn();
  showOverlay('lobbyOverlay');
}

// ── COURSE PICKER ──
// Rounds started per course, { name: { n, last } }, to rank the lobby buttons
let courseStats = {};
try { courseStats = JSON.parse(localStorage.getItem('gct_coursestats')) || {}; } catch (e) {}

function recordCoursePlayed(name) {
  const s = courseStats[name] || { n: 0, last: 0 };
  courseStats[name] = { n: s.n + 1, last: Date.now() };
  localStorage.setItem('gct_coursestats', JSON.stringify(courseStats));
}

const COURSE_BUTTONS = 4;

// Every course in the list, built-in and saved, by base name
function allCourseNames() {
  return PRESET_COURSES.filter(n => n !== 'Others');
}

// Most played first, then most recent, then courses.js order. Frequency comes first so
// a one-off away round doesn't reshuffle the buttons.
function topCourses() {
  const names = allCourseNames();
  const stat = n => courseStats[n] || { n: 0, last: 0 };
  return [...names]
    .sort((a, b) => stat(b).n - stat(a).n || stat(b).last - stat(a).last || names.indexOf(a) - names.indexOf(b))
    .slice(0, COURSE_BUTTONS);
}

function selectCourse(name) {
  selectedCourse = name;
  customHolePars = [];
  customSSS      = null;
  customSlope    = null;
  selectedStart  = null;
  saveState();
  const search = document.getElementById('courseSearch');
  search.value = '';
  buildCourseResults();
  buildCourseOpts();
  buildHoleOpts(selectedCourse);
  updateLobbyStartBtn();
}

function buildCourseOpts() {
  const courseOpts = document.getElementById('courseOpts');
  courseOpts.innerHTML = '';
  const names = topCourses();
  // The selection always has a button, even when found by search or typed in
  if (selectedCourse && !names.includes(selectedCourse)) names.push(selectedCourse);
  names.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'lobby-opt' + (selectedCourse === name ? ' sel' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => selectCourse(name));
    courseOpts.appendChild(btn);
  });
  buildCourseTools();
}

const foldName = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function buildCourseSearch() {
  const search = document.getElementById('courseSearch');
  search.value = '';
  search.oninput = buildCourseResults;
  // Enter picks the first row
  search.onkeydown = e => {
    if (e.key !== 'Enter') return;
    const first = document.querySelector('#courseResults .course-result');
    if (first) { e.preventDefault(); first.click(); search.blur(); }
  };
  buildCourseResults();
}

// Matching courses, then play or save the typed name when nothing matches it exactly
function buildCourseResults() {
  const wrap = document.getElementById('courseResults');
  const typed = document.getElementById('courseSearch').value.trim();
  wrap.innerHTML = '';
  if (!typed) { wrap.style.display = 'none'; return; }
  const q = foldName(typed);
  const matches = allCourseNames().filter(n => foldName(n).includes(q)).slice(0, 6);
  const row = (html, onClick, extra = '') => {
    const btn = document.createElement('button');
    btn.className = 'course-result' + extra;
    btn.innerHTML = html;
    btn.addEventListener('click', onClick);
    wrap.appendChild(btn);
  };
  matches.forEach(name => {
    const s = courseStats[name];
    const played = s ? `<small>${s.n} round${s.n === 1 ? '' : 's'}</small>` : '';
    row(`${escHtml(name)}${played}`, () => selectCourse(name));
  });
  if (!matches.some(n => foldName(n) === q)) {
    row(`Play “${escHtml(typed)}” without saving<small>enter pars for this round</small>`,
      () => selectCourse(typed), ' course-result-new');
    row(`＋ Save “${escHtml(typed)}” as a course<small>pars, stroke index and ratings</small>`, () => {
      selectCourse(typed);
      openCourseEditor(null);
    }, ' course-result-new');
  }
  wrap.style.display = '';
}

// "New course" plus an edit button for each saved entry of the selected course
function buildCourseTools() {
  const wrap = document.getElementById('courseTools');
  wrap.innerHTML = '';
  const add = document.createElement('button');
  add.className = 'course-tool-btn';
  const fromOthers = isCustomCourse(selectedCourse) && selectedCourse && selectedCourse !== 'Others';
  add.textContent = fromOthers ? `＋ Save "${selectedCourse}" as a course` : '＋ New course';
  add.addEventListener('click', () => openCourseEditor(null));
  wrap.appendChild(add);
  Object.keys(userCourses)
    .filter(k => COURSES[k] === userCourses[k] && courseBaseName(COURSES[k]) === selectedCourse)
    .forEach(k => {
      const btn = document.createElement('button');
      btn.className = 'course-tool-btn';
      btn.textContent = `✎ Edit ${k}`;
      btn.addEventListener('click', () => openCourseEditor(k));
      wrap.appendChild(btn);
    });
  buildSubmissionStatus(wrap);
}

function updateLobbyStartBtn() {
  const needsNine  = selectedHoles === 9  && nineIsDerived(selectedCourse);
  const needsStart = selectedHoles === 18 && hasFullRound(selectedCourse);
  const ready = selectedCourse.length > 0 && selectedHoles > 0
    && (!needsNine  || selectedNine)
    && (!needsStart || selectedStart);
  const btn = document.getElementById('lobbyStartBtn');
  btn.disabled = !ready;
  const nineLabel  = selectedNine  ? ` (${selectedNine} 9)`             : '';
  const startLabel = selectedStart ? ` from hole ${selectedStart === 'front' ? '1' : '10'}` : '';
  const teeLabel   = selectedTee   ? ` · ${selectedTee} tee` : '';
  btn.textContent = ready
    ? `Tee off → ${lobbyHoleChoice()} holes at ${selectedCourse}${nineLabel}${startLabel}${teeLabel}`
    : needsNine && !selectedNine
      ? 'Select front or back 9 →'
      : needsStart && !selectedStart
        ? 'Select starting hole →'
        : 'Select a course & holes to start →';
}

document.getElementById('lobbyStartBtn').addEventListener('click', () => {
  if (!selectedCourse || !selectedHoles) return;
  if (lobbySnapshot) {
    localStorage.setItem('gct_lastround', JSON.stringify(lobbySnapshot));
    lobbySnapshot = null;
  }
  // A new round gets its own code
  localStorage.removeItem('gct_sharecode');
  localStorage.removeItem('gct_sharesecret');
  const hcpInput = document.getElementById('hcpInput');
  const v = parseInt(hcpInput.value, 10);
  hcp = isNaN(v) ? DEFAULT_HCP : Math.min(54, Math.max(0, v));
  // A doubled nine starts in its second round
  secondRound = lobbySecondRound;
  secondNine  = lobbySecondRound ? selectedNine : null;
  HOLES = selectedHoles * (lobbySecondRound ? 2 : 1);
  round = Array.from({length: HOLES}, () => []);
  getSimplePlayers().forEach(p => { p.round = Array(HOLES).fill(null); });
  hole  = 1;
  recordCoursePlayed(selectedCourse);
  hideOverlay('lobbyOverlay');
  saveState();
  buildStrip();
  buildClubButtons();
  render();
  // Ask tracking mode at the first tee
  openTrackSheet();
});
