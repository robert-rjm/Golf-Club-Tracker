// ── ALL AVAILABLE CLUBS ──
const ALL_CLUBS = {
  'Woods & Hybrid': ['D', '3W', '5W', '7W', '2H', '3H', '4H', '5H', '6H'],
  'Irons':          ['2i', '3i', '4i', '5i', '6i', '7i', '8i', '9i'],
  'Wedges':         ['PW', 'PA', 'GW', 'AW', 'SW', 'LW']
};

function withSecondRound(courseObj) {
  if (!secondRound) return courseObj;
  const holes = [...courseObj.holes, ...courseObj.holes];
  return { ...courseObj, holes, par: holes.reduce((s, h) => s + h.par, 0) };
}

// Rotate an 18-hole course to start on back 9 when selectedStart === 'back'
function withStartNine(courseObj) {
  if (selectedStart !== 'back' || courseObj.holes.length !== 18) return courseObj;
  const holes = [...courseObj.holes.slice(9), ...courseObj.holes.slice(0, 9)];
  return { ...courseObj, holes };
}

function getCourseData() {
  // Check for an explicit entry first
  const explicit = Object.values(COURSES).find(c =>
    courseBaseName(c) === selectedCourse && c.holes.length === selectedHoles
  );
  if (explicit) return withSecondRound(withStartNine(explicit));
  // For 9 holes derived from an 18-hole entry (front or back nine)
  if (selectedHoles === 9 && selectedNine) {
    const full = Object.values(COURSES).find(c =>
      courseBaseName(c) === selectedCourse && c.holes.length === 18
    );
    if (full) {
      const holes = selectedNine === 'front' ? full.holes.slice(0, 9) : full.holes.slice(9, 18);
      return withSecondRound({ ...full, holes, par: holes.reduce((s, h) => s + h.par, 0) });
    }
  }
  // Custom/Others course — build synthetic data from customHolePars (default par 4)
  if (selectedHoles > 0) {
    const baseHoles = Array.from({ length: selectedHoles }, (_, i) => ({
      par: customHolePars[i] || 4, si: null
    }));
    const holes = secondRound ? [...baseHoles, ...baseHoles] : baseHoles;
    return { par: holes.reduce((s, h) => s + h.par, 0), sss: null, slope: null, holes };
  }
  return null;
}

// Total holes being played (accounts for second round)
function totalHolesPlayed() {
  return selectedHoles * (secondRound ? 2 : 1);
}

// Returns the base course name (strips ' - X Hole' suffix if present)
function courseBaseName(courseData) {
  const key = Object.keys(COURSES).find(k => COURSES[k] === courseData);
  return key ? key.replace(/\s*-\s*\d+\s*Hole$/i, '') : '';
}

// WHS course handicap → adjusted for number of holes played
function calcPlayingHCP(course, totalHoles) {
  const ch = Math.round(hcp * (course.slope / 113) + (course.sss - course.par));
  return Math.round(ch * totalHoles / 18);
}

// How many extra strokes a player receives on a given hole (0-based index)
function strokesOnHole(holeIdx, playingHcp, course) {
  const si   = course.holes[holeIdx].si;
  const base = Math.floor(playingHcp / 18);
  const rem  = playingHcp % 18;
  return base + (si <= rem ? 1 : 0);
}

// Stableford points for a hole (returns null if hole not played)
function stablefordPoints(holeIdx, grossShots, playingHcp, course) {
  if (!grossShots) return null;
  const par     = course.holes[holeIdx].par;
  const strokes = strokesOnHole(holeIdx, playingHcp, course);
  return Math.max(0, 2 + par + strokes - grossShots);
}

// ── DEFAULTS (first visit only) ──
const DEFAULT_BAG = ['D', '3W', '5W', '5H', '5i', '6i', '7i', '8i', '9i', 'PW', 'SW'];
const DEFAULT_HCP = 54;

let activeBag = localStorage.getItem('gct_bag')
  ? JSON.parse(localStorage.getItem('gct_bag'))
  : [...DEFAULT_BAG];

let HOLES = 18;
let hole  = 1;
let round = Array.from({length: HOLES}, () => []);

// ── LOBBY STATE ──
const HOLE_OPTIONS   = [5, 9, 18];
let selectedCourse   = '';
let selectedHoles    = 0;   // 0 = not yet chosen
let selectedNine     = null; // 'front' | 'back' | null — only used when 9 holes derived from 18
let selectedStart    = null; // 'front' | 'back' | null — which 9 to start on for a full 18
let secondRound      = false; // play the selected holes twice (e.g. 9 → 18)
let customHolePars   = [];   // per-hole par for custom/Others courses (null = not set)
let hcp = localStorage.getItem('gct_hcp') !== null
  ? parseInt(localStorage.getItem('gct_hcp'), 10)
  : DEFAULT_HCP;

// ── LOCALSTORAGE ──
function saveState() {
  localStorage.setItem('gct_round',  JSON.stringify(round));
  localStorage.setItem('gct_hole',   hole);
  localStorage.setItem('gct_bag',    JSON.stringify(activeBag));
  localStorage.setItem('gct_holes',  HOLES);
  localStorage.setItem('gct_course', selectedCourse);
  localStorage.setItem('gct_hcp',    hcp);
}
function loadState() {
  const savedRound  = localStorage.getItem('gct_round');
  const savedHole   = localStorage.getItem('gct_hole');
  const savedHoles  = localStorage.getItem('gct_holes');
  const savedCourse = localStorage.getItem('gct_course');
  if (savedRound)  round          = JSON.parse(savedRound);
  if (savedHole)   hole           = parseInt(savedHole, 10);
  if (savedHoles)  { HOLES = parseInt(savedHoles, 10); selectedHoles = HOLES; }
  if (savedCourse) selectedCourse = savedCourse;
}
loadState();

function roundStarted() {
  return round.some(h => h.length > 0);
}

// ── STRIP ──
function buildStrip() {
  const stripEl = document.getElementById('strip');
  stripEl.innerHTML = '';
  for (let i = 1; i <= HOLES; i++) {
    const c = document.createElement('div');
    c.className = 'chip'; c.textContent = i; c.dataset.h = i;
    c.addEventListener('click', () => { hole = i; render(); });
    stripEl.appendChild(c);
  }
}

// ── BUILD CLUB BUTTONS ──
function gridClass(n) {
  if (n <= 3) return 'grid-3';
  if (n === 4) return 'grid-4';
  return 'grid-5';
}

function buildClubButtons() {
  const area = document.getElementById('clubsArea');
  area.innerHTML = '';

  // Filter using master list order, not activeBag order
  const groups = {
    'Woods & Hybrid': ALL_CLUBS['Woods & Hybrid'].filter(c => activeBag.includes(c)),
    'Irons':          ALL_CLUBS['Irons'].filter(c => activeBag.includes(c)),
    'Wedges':         ALL_CLUBS['Wedges'].filter(c => activeBag.includes(c))
  };

  Object.entries(groups).forEach(([title, clubs]) => {
    if (!clubs.length) return;

    const group = document.createElement('div');
    group.className = 'group';
    group.innerHTML = `<div class="group-title">${title}</div>`;

    const grid = document.createElement('div');
    grid.className = `grid ${gridClass(clubs.length)}`;

    clubs.forEach(name => {
      const b = document.createElement('button');
      b.className = 'cbt';
      b.textContent = name;
      b.addEventListener('click', () => {
        round[hole - 1].push(name);
        b.classList.remove('flash');
        void b.offsetWidth;
        b.classList.add('flash');
        saveState();
        render();
      });
      grid.appendChild(b);
    });

    group.appendChild(grid);
    area.appendChild(group);
  });

  // Putter stepper — always present
  const putterGroup = document.createElement('div');
  putterGroup.className = 'group';
  putterGroup.innerHTML = `
    <div class="group-title">Putter</div>
    <div class="putter-stepper">
      <button class="putter-step-btn" id="putterMinus" disabled>−</button>
      <div class="putter-count-wrap">
        <div class="putter-count" id="putterCount">0</div>
        <div class="putter-label">Putts</div>
      </div>
      <button class="putter-step-btn" id="putterPlus">+</button>
    </div>`;
  area.appendChild(putterGroup);

  document.getElementById('putterPlus').addEventListener('click', () => {
    setPutterCount(getPutterCount() + 1);
    updatePutterUI(true); saveState(); render();
  });
  document.getElementById('putterMinus').addEventListener('click', () => {
    const n = getPutterCount();
    if (n > 0) { setPutterCount(n - 1); updatePutterUI(true); saveState(); render(); }
  });

  // Penalty button
  const penaltyGroup = document.createElement('div');
  penaltyGroup.className = 'group';
  penaltyGroup.innerHTML = `<div class="group-title">Penalty</div>`;
  const penaltyBtn = document.createElement('button');
  penaltyBtn.className = 'cbt';
  penaltyBtn.style.cssText = 'background: rgba(176,48,32,0.12); border-color: rgba(176,48,32,0.35); color: #e07060;';
  penaltyBtn.textContent = '⚠ Penalty';
  penaltyBtn.addEventListener('click', () => {
    round[hole - 1].push('Penalty');
    penaltyBtn.classList.remove('flash');
    void penaltyBtn.offsetWidth;
    penaltyBtn.classList.add('flash');
    saveState();
    render();
  });
  penaltyGroup.appendChild(penaltyBtn);
  area.appendChild(penaltyGroup);
}

// ── PUTTER HELPERS ──
function getPutterCount() {
  return round[hole-1].filter(c => c === 'Putter').length;
}
function setPutterCount(n) {
  const nonPutts = round[hole-1].filter(c => c !== 'Putter');
  round[hole-1] = [...nonPutts, ...Array(n).fill('Putter')];
}
function updatePutterUI(animate) {
  const countEl = document.getElementById('putterCount');
  const minusBtn = document.getElementById('putterMinus');
  if (!countEl) return;
  const n = getPutterCount();
  countEl.textContent = n;
  if (animate) {
    countEl.classList.remove('bump');
    void countEl.offsetWidth;
    countEl.classList.add('bump');
  }
  if (minusBtn) minusBtn.disabled = n === 0;
}

// ── RENDER ──
function render() {
  document.getElementById('hNum').textContent = hole;

  document.querySelectorAll('.chip').forEach(c => {
    const h = +c.dataset.h;
    c.className = 'chip';
    if (round[h-1].length) c.classList.add('logged');
    if (h === hole)        c.classList.add('active');
  });
  document.querySelector('.chip.active')
    ?.scrollIntoView({block:'nearest', inline:'center', behavior:'smooth'});

  updatePutterUI(false);

  // Par + stroke allowance label for current hole
  const parEl = document.getElementById('holePar');
  if (parEl) {
    const cd = getCourseData();
    if (cd && hole <= cd.holes.length) {
      const ph = calcPlayingHCP(cd, HOLES);
      const s  = strokesOnHole(hole - 1, ph, cd);
      parEl.textContent = 'Par ' + cd.holes[hole-1].par + (s > 0 ? ' +' + s : '');
    } else {
      parEl.textContent = '';
    }
  }

  // Lock settings gear once round is started
  document.getElementById('settingsBtn').classList.toggle('locked', roundStarted());

  // Show "Continue round" button on last hole if second round not yet added
  const addNineBtn = document.getElementById('addNineBtn');
  addNineBtn.style.display = (hole === HOLES && !secondRound) ? '' : 'none';

  const shots = round[hole - 1];
  const countEl = document.getElementById('shotCount');
  if (countEl) countEl.textContent = shots.length > 0 ? shots.length : '';
  const row = document.getElementById('shotsRow');
  if (!shots.length) {
    row.innerHTML = `<span class="no-shots">Tap a club to start hole ${hole}</span>`;
  } else {
    row.innerHTML = shots.map((c, i) =>
      `<span class="shot-pill${c === 'Penalty' ? ' penalty' : ''}">
        <span class="pill-num">#${i+1}</span>${c}
        <button class="pill-x" data-i="${i}">✕</button>
      </span>`
    ).join('');
    row.querySelectorAll('.pill-x').forEach(b =>
      b.addEventListener('click', () => {
        round[hole-1].splice(+b.dataset.i, 1);
        saveState();
        render();
      })
    );
  }
}

// ── NAV ──
document.getElementById('prev').addEventListener('click', () => { if (hole > 1)    { hole--; saveState(); render(); }});
document.getElementById('next').addEventListener('click', () => { if (hole < HOLES) { hole++; saveState(); render(); }});

// ── ADD SECOND ROUND ──
function activateSecondRound(newNine) {
  // newNine: 'front' | 'back' | null (null = repeat same)
  secondRound = true;
  if (newNine) selectedNine = newNine;
  HOLES = selectedHoles * 2;
  while (round.length < HOLES) round.push([]);
  saveState();
  buildStrip();
  render();
}

function closeContinueSheet() {
  document.getElementById('continueSheet').style.display = 'none';
  document.getElementById('continueBackdrop').style.display = 'none';
}

document.getElementById('continueBackdrop').addEventListener('click', closeContinueSheet);

document.getElementById('addNineBtn').addEventListener('click', () => {
  // Only prompt for front/back when course has 18-hole data and we played a derived 9
  if (selectedHoles === 9 && nineIsDerived(selectedCourse)) {
    const opts = document.getElementById('continueOpts');
    opts.innerHTML = '';
    const choices = [
      { label: `Same 9 (${selectedNine === 'front' ? 'Front' : 'Back'} again)`, nine: null },
      { label: selectedNine === 'front' ? 'Back 9' : 'Front 9', nine: selectedNine === 'front' ? 'back' : 'front' }
    ];
    choices.forEach(({ label, nine }) => {
      const btn = document.createElement('button');
      btn.className = 'lobby-opt';
      btn.style.cssText = 'flex:1;padding:14px;font-size:15px';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        closeContinueSheet();
        activateSecondRound(nine);
      });
      opts.appendChild(btn);
    });
    document.getElementById('continueSheet').style.display = '';
    document.getElementById('continueBackdrop').style.display = '';
  } else {
    activateSecondRound(null);
  }
});

// ── UNDO ──
document.getElementById('undoBtn').addEventListener('click', () => {
  if (round[hole-1].length) { round[hole-1].pop(); saveState(); render(); }
});

// ── OVERLAY HELPERS (direct style — avoids Safari classList/flex bugs) ──
function showOverlay(id) {
  var el = document.getElementById(id);
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
}
function hideOverlay(id) {
  document.getElementById(id).style.display = 'none';
}

// ── SUMMARY ──
document.getElementById('sumBtn').addEventListener('click', () => {
  const cd = getCourseData();
  const ph = cd ? calcPlayingHCP(cd, HOLES) : 0;

  const body = document.getElementById('ovBody');
  let totalSF = 0; let sfHoles = 0;
  body.innerHTML = round.map((shots, i) => {
    const pills = shots.length
      ? shots.map((c,j) => `<span class="sum-pill">#${j+1} ${c}</span>`).join('')
      : '<span class="sum-none">No shots</span>';

    let sfCol = '';
    if (cd && i < cd.holes.length) {
      const pts = stablefordPoints(i, shots.length, ph, cd);
      if (pts !== null) { totalSF += pts; sfHoles++; }
      const parLabel = 'Par ' + cd.holes[i].par;
      sfCol = `<div class="sum-sf">
        <div class="sum-sf-pts">${pts !== null ? pts : '—'}</div>
        <div class="sum-sf-lbl">${parLabel}</div>
      </div>`;
    }

    return `<div class="sum-row">
      <div class="sum-left">
        <div class="sum-hnum">${i+1}</div>
        <div class="sum-shots-count">${shots.length ? shots.length + 'sh' : ''}</div>
      </div>
      <div class="sum-pills">${pills}</div>
      ${sfCol}
    </div>`;
  }).join('');

  const total = round.reduce((a, s) => a + s.length, 0);
  const holesPlayed = round.filter(s => s.length > 0).length;

  const freq = {};
  round.forEach(shots => shots.forEach(c => {
    if (c !== 'Putter') freq[c] = (freq[c]||0)+1;
  }));
  const sorted = Object.entries(freq).sort((a,b) => b[1]-a[1]);
  let topLabel = '—';
  if (sorted.length) {
    const topCount = sorted[0][1];
    const tied = sorted.filter(function(e){ return e[1] === topCount; }).map(function(e){ return e[0]; });
    topLabel = tied.length <= 3 ? tied.join(' / ') : '—';
  }

  const statsBoxes = cd
    ? `<div class="stat-box"><div class="stat-val">${total}</div><div class="stat-lbl">Gross Shots</div></div>
       <div class="stat-box"><div class="stat-val">${sfHoles > 0 ? totalSF : '—'}</div><div class="stat-lbl">Stableford</div></div>
       <div class="stat-box"><div class="stat-val">${holesPlayed}</div><div class="stat-lbl">Holes Logged</div></div>
       <div class="stat-box"><div class="stat-val" style="font-size:${topLabel.includes('/')?'18px':'28px'}">${topLabel}</div><div class="stat-lbl">Most Used</div></div>`
    : `<div class="stat-box"><div class="stat-val">${total}</div><div class="stat-lbl">Gross Shots</div></div>
       <div class="stat-box"><div class="stat-val">${hcp > 0 ? total - Math.round(hcp * HOLES / 18) : '—'}</div><div class="stat-lbl">Net Score</div></div>
       <div class="stat-box"><div class="stat-val">${holesPlayed}</div><div class="stat-lbl">Holes Logged</div></div>
       <div class="stat-box"><div class="stat-val" style="font-size:${topLabel.includes('/')?'18px':'28px'}">${topLabel}</div><div class="stat-lbl">Most Used</div></div>`;

  document.getElementById('ovStats').innerHTML = statsBoxes;

  var titleEl = document.querySelector('#summaryOverlay .ov-title');
  if (titleEl) titleEl.textContent = selectedCourse || 'Round Summary';
  showOverlay('summaryOverlay');
});
document.getElementById('sumClose').addEventListener('click', function() {
  hideOverlay('summaryOverlay');
});

// ── COPY ──
document.getElementById('copyBtn').addEventListener('click', () => {
  const header = [
    selectedCourse ? `Course: ${selectedCourse}` : null,
    `Holes: ${HOLES}`,
    hcp > 0 ? `HCP: ${hcp}` : null,
  ].filter(Boolean).join(' | ');
  const rows = round.map((shots, i) =>
    `Hole ${i+1} (${shots.length} shots): ${shots.length ? shots.join(' → ') : '—'}`
  ).join('\n');
  const text = header ? `${header}\n\n${rows}` : rows;
  navigator.clipboard.writeText(text).then(() => {
    const b = document.getElementById('copyBtn');
    b.textContent = '✓ Copied to clipboard!';
    setTimeout(() => b.textContent = 'Copy to Clipboard', 2000);
  });
});

// ── NEW ROUND ──
let newRoundPending = false;
document.getElementById('newRoundBtn').addEventListener('click', () => {
  const btn = document.getElementById('newRoundBtn');
  if (!newRoundPending) {
    newRoundPending = true;
    btn.textContent = 'Tap again to confirm';
    btn.style.borderColor = 'rgba(176,48,32,0.7)';
    setTimeout(() => {
      if (newRoundPending) {
        newRoundPending = false;
        btn.textContent = 'New Round';
        btn.style.borderColor = '';
      }
    }, 3000);
    return;
  }
  newRoundPending = false;
  btn.textContent = 'New Round';
  btn.style.borderColor = '';
  hideOverlay('summaryOverlay');
  openLobby();
});

// ── LOBBY ──
function holeOptionsFor(course) {
  const counts = Object.keys(COURSES)
    .filter(k => k.replace(/\s*-\s*\d+\s*Hole$/i, '') === course)
    .map(k => COURSES[k].holes.length);
  const set = new Set(counts);
  // Any course with an 18-hole entry also offers 9 (front or back)
  if (set.has(18)) set.add(9);
  // Unknown/custom courses default to 9 and 18
  if (set.size === 0) { set.add(9); set.add(18); }
  return [...set].sort((a, b) => a - b);
}

// Returns true if 9 holes for this course is derived from an 18-hole entry (not explicit, not unknown)
function nineIsDerived(course) {
  const entries = Object.keys(COURSES).filter(k =>
    k.replace(/\s*-\s*\d+\s*Hole$/i, '') === course
  );
  if (entries.length === 0) return false; // unknown/custom course — no data to derive from
  const hasExplicit9 = entries.some(k => COURSES[k].holes.length === 9);
  return !hasExplicit9;
}

// Returns true when the course has an 18-hole entry (so front/back start matters)
function hasFullRound(course) {
  return Object.keys(COURSES).some(k =>
    k.replace(/\s*-\s*\d+\s*Hole$/i, '') === course && COURSES[k].holes.length === 18
  );
}

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

function buildParGrid(n) {
  const grid = document.getElementById('parGrid');
  customHolePars = Array.from({ length: n }, (_, i) => customHolePars[i] || null);
  grid.innerHTML = '<div class="lobby-label" style="margin-bottom:2px">Par per hole <span style="font-weight:400;opacity:0.5">(optional)</span></div><div class="par-grid" id="parGridInner"></div>';
  const inner = grid.querySelector('#parGridInner');
  customHolePars.forEach((val, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'par-grid-item';
    wrap.innerHTML = `<span>${i + 1}</span>`;
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = 3; inp.max = 6;
    inp.placeholder = '4';
    if (val) inp.value = val;
    inp.addEventListener('input', () => {
      customHolePars[i] = inp.value ? parseInt(inp.value) : null;
    });
    wrap.appendChild(inp);
    inner.appendChild(wrap);
  });
  grid.style.display = '';
}

function isCustomCourse(course) {
  return Object.keys(COURSES).filter(k =>
    k.replace(/\s*-\s*\d+\s*Hole$/i, '') === course
  ).length === 0;
}

function buildHoleOpts(course) {
  const holesOpts = document.getElementById('holesOpts');
  const nineOpts  = document.getElementById('nineOpts');
  const startOpts = document.getElementById('startOpts');
  const parGrid   = document.getElementById('parGrid');
  const options = holeOptionsFor(course);
  // If current selectedHoles isn't valid for this course, reset it
  if (!options.includes(selectedHoles)) { selectedHoles = 0; selectedNine = null; selectedStart = null; }
  nineOpts.style.display = 'none';
  startOpts.style.display = 'none';
  parGrid.style.display = 'none';
  holesOpts.innerHTML = '';
  options.forEach(n => {
    const btn = document.createElement('button');
    btn.className = 'lobby-opt' + (selectedHoles === n ? ' sel' : '');
    btn.textContent = n + ' holes';
    btn.addEventListener('click', () => {
      selectedHoles = n;
      selectedNine = null;
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
      // Show per-hole par grid for custom/Others courses
      if (isCustomCourse(selectedCourse)) {
        buildParGrid(n);
      } else {
        parGrid.style.display = 'none';
        parGrid.innerHTML = '';
      }
      updateLobbyStartBtn();
    });
    holesOpts.appendChild(btn);
  });
  // Re-show rows if already selected
  if (selectedHoles > 0) {
    if (selectedHoles === 9 && nineIsDerived(course)) buildNineOpts();
    if (selectedHoles === 18 && hasFullRound(course)) buildStartOpts();
    if (isCustomCourse(course)) buildParGrid(selectedHoles);
  }
}

function openLobby() {
  // Rebuild course buttons
  const courseOpts = document.getElementById('courseOpts');
  courseOpts.innerHTML = '';
  PRESET_COURSES.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'lobby-opt' + (selectedCourse === name ? ' sel' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => {
      selectedCourse = name;
      customHolePars = [];
      selectedStart  = null;
      courseOpts.querySelectorAll('.lobby-opt').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      const customInput = document.getElementById('customCourse');
      if (name === 'Others') {
        customInput.style.display = 'block';
        customInput.focus();
        selectedCourse = customInput.value.trim() || 'Others';
      } else {
        customInput.style.display = 'none';
      }
      buildHoleOpts(selectedCourse);
      updateLobbyStartBtn();
    });
    courseOpts.appendChild(btn);
  });

  const customInput = document.getElementById('customCourse');
  if (selectedCourse === 'Others' || !PRESET_COURSES.slice(0,-1).includes(selectedCourse)) {
    const othersBtn = [...courseOpts.querySelectorAll('.lobby-opt')].find(b => b.textContent === 'Others');
    if (othersBtn) othersBtn.classList.add('sel');
    customInput.style.display = 'block';
    customInput.value = PRESET_COURSES.includes(selectedCourse) ? '' : selectedCourse;
  } else {
    customInput.style.display = 'none';
    customInput.value = '';
  }
  customInput.addEventListener('input', () => {
    selectedCourse = customInput.value.trim() || 'Others';
    buildHoleOpts(selectedCourse);
    updateLobbyStartBtn();
  });

  // Hole buttons — built based on current course
  buildHoleOpts(selectedCourse);

  // HCP input
  const hcpInput = document.getElementById('hcpInput');
  hcpInput.value = hcp;
  hcpInput.oninput = () => {
    const v = parseInt(hcpInput.value, 10);
    hcp = isNaN(v) ? 33 : Math.min(54, Math.max(0, v));
  };

  updateLobbyStartBtn();
  showOverlay('lobbyOverlay');
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
  btn.textContent = ready
    ? `Tee off → ${selectedHoles} holes at ${selectedCourse}${nineLabel}${startLabel}`
    : needsNine && !selectedNine
      ? 'Select front or back 9 →'
      : needsStart && !selectedStart
        ? 'Select starting hole →'
        : 'Select a course & holes to start →';
}

document.getElementById('lobbyStartBtn').addEventListener('click', () => {
  if (!selectedCourse || !selectedHoles) return;
  const hcpInput = document.getElementById('hcpInput');
  const v = parseInt(hcpInput.value, 10);
  hcp = isNaN(v) ? 33 : Math.min(54, Math.max(0, v));
  secondRound = false;
  HOLES = selectedHoles;
  round = Array.from({length: HOLES}, () => []);
  hole  = 1;
  hideOverlay('lobbyOverlay');
  document.getElementById('settingsBtn').classList.remove('locked');
  saveState();
  buildStrip();
  buildClubButtons();
  render();
});

// ── SETTINGS ──
function buildSettingsUI() {
  const scroll = document.getElementById('settingsScroll');
  scroll.innerHTML = '';

  Object.entries(ALL_CLUBS).forEach(([groupName, clubs]) => {
    const group = document.createElement('div');
    group.className = 'settings-group';

    const title = document.createElement('div');
    title.className = 'settings-group-title';
    title.textContent = groupName;
    group.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'settings-club-grid';

    clubs.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'toggle-btn' + (activeBag.includes(name) ? ' on' : '');
      btn.textContent = name;
      btn.addEventListener('click', () => {
        if (activeBag.includes(name)) {
          activeBag = activeBag.filter(c => c !== name);
          btn.classList.remove('on');
        } else {
          activeBag.push(name);
          btn.classList.add('on');
        }
      });
      grid.appendChild(btn);
    });

    group.appendChild(grid);
    scroll.appendChild(group);
  });

  // Putter note
  const note = document.createElement('div');
  note.className = 'settings-putter-note';
  note.innerHTML = `<span>⛳</span> Putter is always included`;
  scroll.appendChild(note);
}

function closeSettings() {
  hideOverlay('settingsOverlay');
  saveState();
  buildClubButtons();
  render();
}

document.getElementById('settingsBtn').addEventListener('click', () => {
  if (roundStarted()) return;
  buildSettingsUI();
  showOverlay('settingsOverlay');
});
document.getElementById('settingsClose').addEventListener('click', closeSettings);
document.getElementById('startRoundBtn').addEventListener('click', closeSettings);

// ── INIT ──
if (roundStarted()) {
  // Resume saved round directly
  buildStrip();
  buildClubButtons();
  render();
} else {
  // No active round — show lobby
  buildStrip();
  buildClubButtons();
  render();
  openLobby();
}
