// ── ALL AVAILABLE CLUBS ──
const ALL_CLUBS = {
  'Woods & Hybrid': ['D', '3W', '5W', '7W', '2H', '3H', '4H', '5H', '6H'],
  'Irons':          ['2i', '3i', '4i', '5i', '6i', '7i', '8i', '9i'],
  'Wedges':         ['PW', 'PA', 'GW', 'AW', 'SW', 'LW']
};

// Logged as strokes but not clubs. 'Shot' is the score-only placeholder.
const NOT_A_CLUB = ['Putter', 'Penalty', 'Shot'];

function withSecondRound(courseObj) {
  if (!secondRound) return courseObj;
  // Only the holes double. The ratings stay 18-hole values, calcPlayingHCP scales them.
  return { ...courseObj, holes: [...courseObj.holes, ...courseObj.holes] };
}

// Front or back nine of an 18-hole entry
function nineSlice(courseObj, side) {
  return side === 'back' ? courseObj.holes.slice(9, 18) : courseObj.holes.slice(0, 9);
}

// Rotate an 18-hole course to start on back 9 when selectedStart === 'back'
function withStartNine(courseObj) {
  if (selectedStart !== 'back' || courseObj.holes.length !== 18) return courseObj;
  const holes = [...courseObj.holes.slice(9), ...courseObj.holes.slice(0, 9)];
  return { ...courseObj, holes };
}

// Picks { sss, slope } for a tee and category, falling back to the default tee.
// A tee entry with no `players` is rated for every category.
function ratingFor(course, tee, players) {
  if (!course.tees || !course.tees.length) return { sss: course.sss, slope: course.slope };
  const pick = (colour, cat) => course.tees.find(x =>
    (!colour || x.colour === colour) && (!cat || !x.players || x.players === cat));
  const colour = tee || course.defaultTee;
  const t = pick(colour, players)
         || pick(colour, null)
         || pick(course.defaultTee, players)
         || pick(course.defaultTee, null)
         || course.tees[0];
  return { sss: t.sss, slope: t.slope };
}

// Course data for the round with the player's tee ratings applied
function getCourseData(player) {
  const course = buildCourseData();
  if (!course) return course;
  const tee = (player && player.tee) || selectedTee;
  return { ...course, ...ratingFor(course, tee, player && player.category) };
}

function buildCourseData() {
  const explicit = Object.values(COURSES).find(c =>
    courseBaseName(c) === selectedCourse && c.holes.length === selectedHoles
  );
  if (explicit) return withSecondRound(withStartNine(explicit));
  // 9 holes sliced from an 18-hole entry
  if (selectedHoles === 9 && selectedNine) {
    const full = Object.values(COURSES).find(c =>
      courseBaseName(c) === selectedCourse && c.holes.length === 18
    );
    if (full) {
      // A second round may be on the other nine
      const holes = secondRound
        ? [...nineSlice(full, selectedNine), ...nineSlice(full, secondNine || selectedNine)]
        : nineSlice(full, selectedNine);
      // Keep the 18-hole par/ratingPar/sss/slope, calcPlayingHCP scales for holes played
      return { ...full, holes };
    }
  }
  // Custom course, built from customHolePars
  if (selectedHoles > 0) {
    const baseHoles = Array.from({ length: selectedHoles }, (_, i) => ({
      par: customHolePars[i] || null, si: null
    }));
    const holes = secondRound ? [...baseHoles, ...baseHoles] : baseHoles;
    const knownPars = baseHoles.filter(h => h.par !== null);
    const basePar = knownPars.length ? knownPars.reduce((s, h) => s + h.par, 0) : null;
    // customSSS is an 18-hole rating, so ratingPar is scaled to 18 holes too
    const ratingPar = basePar !== null ? basePar * 18 / selectedHoles : null;
    return { par: basePar, ratingPar, sss: customSSS, slope: customSlope, holes };
  }
  return null;
}

function totalHolesPlayed() {
  return selectedHoles * (secondRound ? 2 : 1);
}

// Strips the ' - N Hole' suffix
function courseBaseName(courseData) {
  const key = Object.keys(COURSES).find(k => COURSES[k] === courseData);
  return key ? key.replace(/\s*-\s*\d+\s*Hole$/i, '') : '';
}

// WHS course handicap scaled to the holes played. Uses ratingPar, not the played par.
function calcPlayingHCP(playerHcp, course, totalHoles) {
  if (course.slope == null || course.sss == null) return Math.round(playerHcp * totalHoles / 18);
  const ratingPar = course.ratingPar ?? course.par;
  const ch = Math.round(playerHcp * (course.slope / 113) + (course.sss - ratingPar));
  return Math.round(ch * totalHoles / 18);
}

// Ranks the holes in play 1..n by SI, so the strokes handed out sum to the playing handicap
function strokeRanks(course) {
  const order = course.holes.map((h, i) => ({ i, si: h.si == null ? Infinity : h.si }));
  // Ties (repeated nine, no SI) go in playing order
  order.sort((a, b) => a.si - b.si || a.i - b.i);
  const ranks = new Array(course.holes.length);
  order.forEach((o, r) => { ranks[o.i] = r + 1; });
  return ranks;
}

// Extra strokes received on a hole (0-based index)
function strokesOnHole(holeIdx, playingHcp, course) {
  const numHoles = course.holes.length;
  if (!numHoles) return 0;
  const rank = strokeRanks(course)[holeIdx];
  if (playingHcp >= 0) {
    return Math.floor(playingHcp / numHoles) + (rank <= playingHcp % numHoles ? 1 : 0);
  }
  // Negative handicap gives strokes back, starting at the easiest hole
  const give = -playingHcp;
  return -(Math.floor(give / numHoles) + (numHoles - rank < give % numHoles ? 1 : 0));
}

// Stableford points for a hole, null if not played
function stablefordPoints(holeIdx, grossShots, playingHcp, course) {
  if (!grossShots) return null;
  const par     = course.holes[holeIdx].par;
  if (par === null) return null;
  const strokes = strokesOnHole(holeIdx, playingHcp, course);
  return Math.max(0, 2 + par + strokes - grossShots);
}

// Net double bogey cap
function adjustedGrossForHole(holeIdx, grossShots, playingHcp, course) {
  if (!grossShots) return null;
  const par = course.holes[holeIdx].par;
  if (par === null) return null;
  const strokes = strokesOnHole(holeIdx, playingHcp, course);
  return Math.min(grossShots, par + 2 + strokes);
}

// WHS score differential, PCC taken as 0. Partial rounds are scaled to 18 holes.
function scoreDifferential(course, holesCounted, adjustedGrossTotal) {
  if (!course || course.slope == null || course.sss == null || !holesCounted) return null;
  const sss  = course.sss * holesCounted / 18;
  const diff = (113 / course.slope) * (adjustedGrossTotal - sss);
  return diff * 18 / holesCounted;
}

// ── DEFAULTS (first visit only) ──
const DEFAULT_BAG = ['D', '3W', '5W', '5H', '5i', '6i', '7i', '8i', '9i', 'PW', 'SW'];
const DEFAULT_HCP = 54;
const DEFAULT_CATEGORY = 'men';

let activeBag = localStorage.getItem('gct_bag')
  ? JSON.parse(localStorage.getItem('gct_bag'))
  : [...DEFAULT_BAG];

let HOLES = 18;
let hole  = 1;
let round = Array.from({length: HOLES}, () => []);

// ── LOBBY STATE ──
const HOLE_OPTIONS   = [5, 9, 18];
let selectedCourse   = '';
let selectedHoles    = 0; // 0 = not chosen yet
let selectedNine     = null; // 'front' | 'back', 9 holes from an 18-hole course
let secondNine       = null; // nine played in the second round
let selectedStart    = null; // starting nine for a full 18
let selectedTee      = null; // null = course defaultTee
let secondRound      = false; // play the holes twice
let lobbySecondRound = false; // 18 on a 9-hole course
let customHolePars   = []; // null = not set
let customSSS        = null;
let customSlope      = null;
let trackClubs       = true; // false = score-only
let hcp = localStorage.getItem('gct_hcp') !== null
  ? parseInt(localStorage.getItem('gct_hcp'), 10)
  : DEFAULT_HCP;

// ── MULTIPLAYER STATE ──
// The detailed player has no `hcp`, scoring uses the global one
let players = [
  { name: 'You', mode: 'detailed', category: DEFAULT_CATEGORY }
];

function getSimplePlayers() {
  return players.filter(p => p.mode === 'simple');
}

// ── LOCALSTORAGE ──
function saveState() {
  localStorage.setItem('gct_round',  JSON.stringify(round));
  localStorage.setItem('gct_hole',   hole);
  localStorage.setItem('gct_bag',    JSON.stringify(activeBag));
  localStorage.setItem('gct_holes',  HOLES);
  localStorage.setItem('gct_selectedholes', selectedHoles);
  localStorage.setItem('gct_secondround',   secondRound ? '1' : '');
  localStorage.setItem('gct_selectednine',  selectedNine ?? '');
  localStorage.setItem('gct_secondnine',    secondNine ?? '');
  localStorage.setItem('gct_selectedstart', selectedStart ?? '');
  localStorage.setItem('gct_selectedtee',   selectedTee ?? '');
  localStorage.setItem('gct_course',    selectedCourse);
  localStorage.setItem('gct_hcp',       hcp);
  localStorage.setItem('gct_custompars',  JSON.stringify(customHolePars));
  localStorage.setItem('gct_customsss',   customSSS   ?? '');
  localStorage.setItem('gct_customslope', customSlope ?? '');
  localStorage.setItem('gct_trackclubs',  trackClubs ? '1' : '');
  localStorage.setItem('gct_players', JSON.stringify(players));
  scheduleShareSync();
}
function loadState() {
  const savedRound      = localStorage.getItem('gct_round');
  const savedHole       = localStorage.getItem('gct_hole');
  const savedHoles      = localStorage.getItem('gct_holes');
  const savedSelHoles   = localStorage.getItem('gct_selectedholes');
  const savedSecondRound = localStorage.getItem('gct_secondround');
  const savedNine       = localStorage.getItem('gct_selectednine');
  const savedSecondNine = localStorage.getItem('gct_secondnine');
  const savedStart      = localStorage.getItem('gct_selectedstart');
  const savedTee        = localStorage.getItem('gct_selectedtee');
  const savedCourse     = localStorage.getItem('gct_course');
  const savedCustomPars = localStorage.getItem('gct_custompars');
  const savedPlayers    = localStorage.getItem('gct_players');
  if (savedRound)      round          = JSON.parse(savedRound);
  if (savedHole)       hole           = parseInt(savedHole, 10);
  if (savedHoles)      HOLES          = parseInt(savedHoles, 10);
  // 0 so a first run shows nothing selected
  selectedHoles  = savedSelHoles ? parseInt(savedSelHoles, 10) : 0;
  secondRound    = savedSecondRound === '1';
  selectedNine   = savedNine  || null;
  secondNine     = savedSecondNine || null;
  selectedStart  = savedStart || null;
  selectedTee    = savedTee   || null;
  if (savedCourse)     selectedCourse = savedCourse;
  if (savedCustomPars) customHolePars = JSON.parse(savedCustomPars);
  if (savedPlayers)    players        = JSON.parse(savedPlayers);
  players.forEach(p => {
    // Older versions stored hcp on the detailed player
    if (p.mode === 'detailed') delete p.hcp;
    // Players saved before categories existed
    if (!p.category) p.category = DEFAULT_CATEGORY;
  });
  // Always keep a detailed player
  if (!players.some(p => p.mode === 'detailed')) {
    players.unshift({ name: 'You', mode: 'detailed', category: DEFAULT_CATEGORY });
  }
  const savedSSS   = localStorage.getItem('gct_customsss');
  const savedSlope = localStorage.getItem('gct_customslope');
  if (savedSSS)   customSSS   = savedSSS   ? parseFloat(savedSSS)   : null;
  if (savedSlope) customSlope = savedSlope ? parseFloat(savedSlope) : null;
  // Older saves predate score-only mode
  const savedTrackClubs = localStorage.getItem('gct_trackclubs');
  trackClubs = savedTrackClubs === null ? true : savedTrackClubs === '1';
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

  if (trackClubs) {
    buildClubGrids(area);
    buildPutterStepper(area);
    buildPenaltyButton(area);
  } else {
    buildScorePad(area);
    buildBreakdownSteppers(area);
  }

  buildPartnerSteppers(area);
}

function buildClubGrids(area) {
  // Master list order, not bag order
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

}

function buildPutterStepper(area) {
  // Putter stepper
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

}

function buildPenaltyButton(area) {
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

// ── SCORE-ONLY PAD ──
// Putts and penalties are a breakdown of the total, never added to it
function buildScorePad(area) {
  const group = document.createElement('div');
  group.className = 'group';
  group.innerHTML = `
    <div class="group-title">Score</div>
    <div class="putter-stepper">
      <button class="putter-step-btn" id="scoreMinus">−</button>
      <div class="putter-count-wrap">
        <div class="putter-count" id="scoreCount">0</div>
        <div class="putter-label" id="scoreLabel">Shots</div>
      </div>
      <button class="putter-step-btn" id="scorePlus">+</button>
    </div>
    <div class="score-hint" id="scoreHint"></div>`;
  area.appendChild(group);

  // An unplayed hole shows its par. Nothing is saved until the score is tapped or stepped.
  document.getElementById('scorePlus').addEventListener('click', () => {
    setHoleTotal((holeTotal() || pendingScore() || 0) + 1);
    bumpScore(); saveState(); render();
  });
  document.getElementById('scoreMinus').addEventListener('click', () => {
    const from = holeTotal() || pendingScore();
    if (!from || from <= 1) return;
    setHoleTotal(from - 1);
    bumpScore(); saveState(); render();
  });
  document.getElementById('scoreCount').addEventListener('click', () => {
    if (holeTotal()) return;
    const par = pendingScore();
    if (!par) return;
    setHoleTotal(par);
    bumpScore(); saveState(); render();
  });
}

function buildBreakdownSteppers(area) {
  const group = document.createElement('div');
  group.className = 'group';
  group.innerHTML = `
    <div class="group-title">Of which (optional)</div>
    <div class="partner-list">
      <div class="partner-row">
        <div class="partner-name">Putts</div>
        <div class="partner-stepper">
          <button class="putter-step-btn step-sm" id="putterMinus" disabled>−</button>
          <div class="partner-count-wrap"><div class="partner-count" id="putterCount">0</div></div>
          <button class="putter-step-btn step-sm" id="putterPlus">+</button>
        </div>
      </div>
      <div class="partner-row">
        <div class="partner-name">⚠ Penalties</div>
        <div class="partner-stepper">
          <button class="putter-step-btn step-sm" id="penaltyMinus" disabled>−</button>
          <div class="partner-count-wrap"><div class="partner-count" id="penaltyCount">0</div></div>
          <button class="putter-step-btn step-sm" id="penaltyPlus">+</button>
        </div>
      </div>
    </div>`;
  area.appendChild(group);

  // Steppers only move strokes around inside the total
  const bump = id => {
    const el = document.getElementById(id);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  };
  const room = () => holeTotal() - getPutterCount() - getPenaltyCount();

  document.getElementById('putterPlus').addEventListener('click', () => {
    if (room() <= 0) return;
    setBreakdown(getPutterCount() + 1, getPenaltyCount());
    bump('putterCount'); saveState(); render();
  });
  document.getElementById('putterMinus').addEventListener('click', () => {
    if (getPutterCount() <= 0) return;
    setBreakdown(getPutterCount() - 1, getPenaltyCount());
    bump('putterCount'); saveState(); render();
  });
  document.getElementById('penaltyPlus').addEventListener('click', () => {
    if (room() <= 0) return;
    setBreakdown(getPutterCount(), getPenaltyCount() + 1);
    bump('penaltyCount'); saveState(); render();
  });
  document.getElementById('penaltyMinus').addEventListener('click', () => {
    if (getPenaltyCount() <= 0) return;
    setBreakdown(getPutterCount(), getPenaltyCount() - 1);
    bump('penaltyCount'); saveState(); render();
  });
}

function buildPartnerSteppers(area) {
  const simplePlayers = getSimplePlayers();
  if (simplePlayers.length > 0) {
    const partnerGroup = document.createElement('div');
    partnerGroup.className = 'group';
    partnerGroup.innerHTML = `<div class="group-title">Playing Partners</div>`;

    const partnerList = document.createElement('div');
    partnerList.className = 'partner-list';
    partnerList.id = 'partnerList';

    simplePlayers.forEach((player, pIdx) => {
      const row = document.createElement('div');
      row.className = 'partner-row';
      row.dataset.pidx = pIdx;
      row.innerHTML = `
        <div class="partner-name">${player.name} <span class="partner-hcp">(${player.hcp})</span></div>
        <div class="partner-stepper">
          <button class="putter-step-btn partner-minus" data-pidx="${pIdx}">−</button>
          <div class="partner-count-wrap">
            <div class="partner-count" id="partnerCount-${pIdx}" data-pidx="${pIdx}">—</div>
            <div class="partner-label" id="partnerLabel-${pIdx}">shots</div>
          </div>
          <button class="putter-step-btn partner-plus" data-pidx="${pIdx}">+</button>
        </div>
        <div class="partner-sf" id="partnerSF-${pIdx}"></div>
      `;
      partnerList.appendChild(row);
    });

    partnerGroup.appendChild(partnerList);

    const hint = document.createElement('div');
    hint.className = 'score-hint';
    hint.textContent = 'Tap a number to take par';
    partnerGroup.appendChild(hint);

    area.appendChild(partnerGroup);

    // Same par preselect as the main pad
    partnerList.querySelectorAll('.partner-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = getSimplePlayers()[btn.dataset.pidx];
        p.round[hole - 1] = (p.round[hole - 1] || partnerPar(p) || 0) + 1;
        saveState();
        renderPartnerScores();
      });
    });

    partnerList.querySelectorAll('.partner-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = getSimplePlayers()[btn.dataset.pidx];
        const current = p.round[hole - 1];
        if (current) {
          // Below 1 clears the hole
          p.round[hole - 1] = current - 1 || null;
        } else {
          const par = partnerPar(p);
          if (!par || par <= 1) return;
          p.round[hole - 1] = par - 1;
        }
        saveState();
        renderPartnerScores();
      });
    });

    partnerList.querySelectorAll('.partner-count').forEach(el => {
      el.addEventListener('click', () => {
        const p = getSimplePlayers()[el.dataset.pidx];
        if (p.round[hole - 1]) return;
        const par = partnerPar(p);
        if (!par) return;
        p.round[hole - 1] = par;
        saveState();
        renderPartnerScores();
      });
    });
  }
}

// Par a partner's hole is preselected at
function partnerPar(player) {
  const cd = getCourseData(player);
  return cd && hole <= cd.holes.length ? cd.holes[hole-1].par : null;
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

// ── SCORE-ONLY HELPERS ──
// Score-only holes store 'Shot' tokens in place of clubs, so scoring reads them the same.
// Order: shots, penalties, putts.
function getPenaltyCount() {
  return round[hole-1].filter(c => c === 'Penalty').length;
}
function holeTotal() {
  return round[hole-1].length;
}
function writeHole(total, putts, pens) {
  round[hole-1] = [
    ...Array(Math.max(0, total - putts - pens)).fill('Shot'),
    ...Array(pens).fill('Penalty'),
    ...Array(putts).fill('Putter')
  ];
}
// Trim the breakdown if it no longer fits the total
function setHoleTotal(n) {
  n = Math.max(0, n);
  const putts = Math.min(getPutterCount(), n);
  const pens  = Math.min(getPenaltyCount(), n - putts);
  writeHole(n, putts, pens);
}
function setBreakdown(putts, pens) {
  const total = holeTotal();
  putts = Math.min(Math.max(0, putts), total);
  pens  = Math.min(Math.max(0, pens), total - putts);
  writeHole(total, putts, pens);
}
// Par preselect for this hole, null if the par is unknown
function pendingScore() {
  const cd = getCourseData(mainPlayer());
  return cd && hole <= cd.holes.length ? cd.holes[hole-1].par : null;
}
function bumpScore() {
  const el = document.getElementById('scoreCount');
  if (!el) return;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function updateScorePadUI() {
  const countEl = document.getElementById('scoreCount');
  if (!countEl) return;
  const total = holeTotal();
  const par   = pendingScore();
  const putts = getPutterCount();
  const pens  = getPenaltyCount();

  countEl.textContent = total || (par ?? '—');
  countEl.classList.toggle('pending', !total);
  document.getElementById('scoreLabel').textContent = total ? 'Shots' : 'Par';
  document.getElementById('scoreHint').textContent  = total
    ? ''
    : par ? 'Tap the number to take par' : 'Tap + to start counting';
  document.getElementById('scoreMinus').disabled = (total || par || 0) <= 1;

  // Strokes not in the breakdown
  const room = total - putts - pens;
  document.getElementById('putterCount').textContent  = putts;
  document.getElementById('penaltyCount').textContent = pens;
  document.getElementById('putterMinus').disabled  = putts === 0;
  document.getElementById('penaltyMinus').disabled = pens === 0;
  document.getElementById('putterPlus').disabled   = room <= 0;
  document.getElementById('penaltyPlus').disabled  = room <= 0;
}

function renderPartnerScores() {
  getSimplePlayers().forEach((player, pIdx) => {
    // Same tee, own category
    const cd = getCourseData(player);
    const countEl = document.getElementById(`partnerCount-${pIdx}`);
    const sfEl = document.getElementById(`partnerSF-${pIdx}`);
    if (!countEl) return;

    const gross = player.round[hole - 1];
    // Unscored hole shows its par dimmed
    const par = cd && hole <= cd.holes.length ? cd.holes[hole-1].par : null;
    countEl.textContent = gross || (par ?? '—');
    countEl.classList.toggle('pending', !gross);
    const labelEl = document.getElementById(`partnerLabel-${pIdx}`);
    if (labelEl) labelEl.textContent = gross ? 'shots' : 'par';

    // Stableford
    if (sfEl && cd && gross) {
      const playerPH = calcPlayingHCP(player.hcp, cd, HOLES);
      const pts = stablefordPoints(hole - 1, gross, playerPH, cd);
      sfEl.textContent = pts !== null ? `${pts} pts` : '';
      sfEl.className = 'partner-sf' + (pts >= 2 ? ' good' : pts === 0 ? ' bad' : '');
    } else if (sfEl) {
      sfEl.textContent = '';
    }

    // Minus clears the hole below 1. On the preselect it needs a par above 1.
    const minusBtn = document.querySelector(`.partner-minus[data-pidx="${pIdx}"]`);
    if (minusBtn) minusBtn.disabled = gross ? false : !(par > 1);
  });
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

  if (trackClubs) updatePutterUI(false);
  else            updateScorePadUI();

  // Par and strokes received
  const parEl = document.getElementById('holePar');
  if (parEl) {
    const cd = getCourseData(mainPlayer());
    if (cd && hole <= cd.holes.length) {
      const ph = calcPlayingHCP(hcp, cd, HOLES);
      const s  = strokesOnHole(hole - 1, ph, cd);
      const holePar = cd.holes[hole-1].par;
      parEl.textContent = holePar !== null ? 'Par ' + holePar + (s > 0 ? ' +' + s : '') : '';
    } else {
      parEl.textContent = '';
    }
    renderPartnerScores();
  }

  // Offer another nine on the last hole
  const addNineBtn = document.getElementById('addNineBtn');
  addNineBtn.style.display = (hole === HOLES && !secondRound) ? '' : 'none';

  const shots = round[hole - 1];
  const countEl = document.getElementById('shotCount');
  if (countEl) countEl.textContent = shots.length > 0 ? shots.length : '';
  const labelEl = document.getElementById('logLabelText');
  if (labelEl) labelEl.textContent = trackClubs ? 'Shots this hole' : 'Score this hole';
  const row = document.getElementById('shotsRow');
  if (!shots.length) {
    row.innerHTML = `<span class="no-shots">${trackClubs
      ? `Tap a club to start hole ${hole}`
      : `Set your score for hole ${hole}`}</span>`;
  } else if (!trackClubs) {
    // Score-only: show the breakdown instead of a row of 'Shot' pills
    const putts = getPutterCount(), pens = getPenaltyCount();
    row.innerHTML = [
      `<span class="shot-pill">${shots.length} shot${shots.length === 1 ? '' : 's'}</span>`,
      putts ? `<span class="shot-pill">${putts} putt${putts === 1 ? '' : 's'}</span>` : '',
      pens  ? `<span class="shot-pill penalty">${pens} penalt${pens === 1 ? 'y' : 'ies'}</span>` : ''
    ].join('');
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
  // Stored separately so the first nine keeps its own pars and SI
  secondNine = newNine || selectedNine;
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
  // Ask front/back only for a nine sliced from 18
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
  if (!round[hole-1].length) return;
  // Score-only: take a stroke off the total, not the last token
  if (trackClubs) round[hole-1].pop();
  else            setHoleTotal(holeTotal() - 1);
  saveState();
  render();
});

// ── OVERLAY HELPERS (inline style avoids Safari flex bugs) ──
function showOverlay(id) {
  var el = document.getElementById(id);
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
}
function hideOverlay(id) {
  document.getElementById(id).style.display = 'none';
}

// ── SUMMARY ──
const PLAYER_COLORS = ['#c9a84c', '#5fb0c9', '#e0973c', '#8fbf5f', '#d1637a', '#8a7fd6'];
let summaryPlayerIdx = 0;

// Pills for a hole with no club detail
function countPills(tokens, gross) {
  const putts = tokens ? tokens.filter(c => c === 'Putter').length : 0;
  const pens  = tokens ? tokens.filter(c => c === 'Penalty').length : 0;
  return `<span class="sum-pill">${gross} shot${gross === 1 ? '' : 's'}</span>`
    + (putts ? `<span class="sum-pill">${putts} putt${putts === 1 ? '' : 's'}</span>` : '')
    + (pens  ? `<span class="sum-pill">${pens} penalt${pens === 1 ? 'y' : 'ies'}</span>` : '');
}

// Data behind the summary on screen, read by the detail sheets
let summaryData = null;

const sumOf = arr => arr.reduce((n, x) => n + x, 0);
const oneDp = n => (Math.round(n * 10) / 10).toFixed(1);
function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const signed = n => (n > 0 ? '+' : '') + n;

// Summary data for one player
function buildSummaryData(playerIdx) {
  const player = players[playerIdx];
  const cd = getCourseData(player);
  const isDetailed = player.mode === 'detailed';
  const ph = cd ? calcPlayingHCP(isDetailed ? hcp : player.hcp, cd, HOLES) : 0;

  const holes = Array.from({ length: HOLES }, (_, i) => {
    const shots = isDetailed ? round[i] : null;
    const gross = isDetailed ? shots.length : (player.round[i] || 0);
    const onCourse = cd && i < cd.holes.length;
    const par = onCourse ? cd.holes[i].par : null;
    const pts = onCourse ? stablefordPoints(i, gross, ph, cd) : null;
    return {
      i, shots, gross, par, pts,
      adj: pts !== null ? adjustedGrossForHole(i, gross, ph, cd) : null,
      // Per hole, since the mode can change mid-round
      hasClubs: isDetailed && shots.some(c => !NOT_A_CLUB.includes(c)),
      putts: shots ? shots.filter(c => c === 'Putter').length : 0,
      onCourse
    };
  });
  const played = holes.filter(h => h.gross);
  const sfHoles = holes.filter(h => h.pts !== null);
  return {
    player, cd, ph, isDetailed, holes, played, sfHoles,
    total: sumOf(played.map(h => h.gross)),
    totalSF: sumOf(sfHoles.map(h => h.pts)),
    adjGrossTotal: sumOf(sfHoles.map(h => h.adj))
  };
}

function statBox(key, val, lbl, valStyle) {
  return `<div class="stat-box" data-stat="${key}">
    <div class="stat-val"${valStyle ? ` style="${valStyle}"` : ''}>${val}</div>
    <div class="stat-lbl">${lbl}</div>
  </div>`;
}

function renderSummaryFor(playerIdx) {
  const d = summaryData = buildSummaryData(playerIdx);
  const { cd, isDetailed, holes, played, sfHoles, total, totalSF } = d;

  // Hole grid
  document.getElementById('ovHoles').innerHTML = holes.map(h => {
    let cls = 'empty';
    if (h.gross) {
      const toPar = h.par !== null ? h.gross - h.par : null;
      cls = toPar === null ? 'nopar' : toPar < 0 ? 'under' : toPar === 0 ? 'even' : toPar === 1 ? 'over1' : 'over2';
    }
    const sub = h.pts !== null
      ? `${h.pts} pt${h.pts === 1 ? '' : 's'}`
      : h.par !== null ? `Par ${h.par}` : '';
    return `<div class="hole-tile ${cls}" data-hole="${h.i}">
      <div class="ht-num">${h.i + 1}</div>
      <div class="ht-gross">${h.gross || '–'}</div>
      <div class="ht-sub">${sub}</div>
    </div>`;
  }).join('');

  // Stat boxes. Most Used only applies to tracked clubs.
  let mostUsedBox = '';
  if (isDetailed) {
    const freq = clubFrequency(holes, true);
    if (freq.length) {
      const topCount = freq[0][1];
      const tied = freq.filter(e => e[1] === topCount).map(e => e[0]);
      const topLabel = tied.length <= 3 ? tied.join(' / ') : '—';
      mostUsedBox = statBox('clubs', topLabel, 'Most Used', topLabel.includes('/') ? 'font-size:18px' : '');
    }
  }

  const puttTotal = sumOf(holes.map(h => h.putts));
  const puttsBox = puttTotal ? statBox('putts', puttTotal, 'Putts') : '';

  const diff = cd ? scoreDifferential(cd, sfHoles.length, d.adjGrossTotal) : null;
  const diffBox = diff !== null ? statBox('diff', diff.toFixed(1), 'Played to (WHS)') : '';

  document.getElementById('ovStats').innerHTML = cd
    ? statBox('gross', total, 'Gross Shots')
      + statBox('sf', sfHoles.length > 0 ? totalSF : '—', 'Stableford')
      + statBox('holes', played.length, 'Holes Logged')
      + mostUsedBox + puttsBox + diffBox
    : statBox('gross', total, 'Gross Shots')
      + statBox('net', isDetailed && hcp > 0 ? total - Math.round(hcp * HOLES / 18) : '—', 'Net Score')
      + statBox('holes', played.length, 'Holes Logged')
      + mostUsedBox + puttsBox;

  const titleEl = document.querySelector('#summaryOverlay .ov-title');
  if (titleEl) titleEl.textContent = isDetailed ? (selectedCourse || 'Round Summary') : `${d.player.name}'s Round`;
}

// [club, count], most used first. clubsOnly = false also counts putts and penalties.
function clubFrequency(holes, clubsOnly) {
  const freq = {};
  holes.forEach(h => (h.shots || []).forEach(c => {
    if (c === 'Shot' || (clubsOnly && NOT_A_CLUB.includes(c))) return;
    freq[c] = (freq[c] || 0) + 1;
  }));
  return Object.entries(freq).sort((a, b) => b[1] - a[1]);
}

// ── DETAIL SHEET ──
function openSheet(title, html) {
  document.getElementById('sheetTitle').textContent = title;
  const body = document.getElementById('sheetBody');
  body.innerHTML = html;
  body.scrollTop = 0;
  const sheet = document.getElementById('sumSheet');
  sheet.style.display = 'flex';
  sheet.style.flexDirection = 'column';
}
function closeSheet() {
  document.getElementById('sumSheet').style.display = 'none';
}
document.getElementById('sheetBack').addEventListener('click', closeSheet);

const dtRow = (label, val, note) =>
  `<div class="dt-row"><span>${label}${note ? `<small>${note}</small>` : ''}</span><b>${val}</b></div>`;
const dtGroup = (title, inner) =>
  inner ? `<div class="dt-group"><div class="lobby-label">${title}</div>${inner}</div>` : '';
function dtBars(entries) {
  const max = Math.max(1, ...entries.map(e => e[1]));
  return entries.map(([label, n]) => `<div class="dt-bar">
    <span class="dt-bar-lbl">${label}</span>
    <span class="dt-bar-track"><span class="dt-bar-fill" style="width:${n / max * 100}%"></span></span>
    <span class="dt-bar-n">${n}</span>
  </div>`).join('');
}
// Split into nines
function nineChunks(holes) {
  const out = [];
  for (let s = 0; s < holes.length; s += 9) out.push(holes.slice(s, s + 9));
  return out;
}
const chunkLabel = c => `Holes ${c[0].i + 1}–${c[c.length - 1].i + 1}`;

// Hole-by-hole club list, scrolled to the tapped hole
function openHoleDetail(focusIdx) {
  const html = summaryData.holes.map(h => {
    const pills = !h.gross
      ? '<span class="sum-none">No shots</span>'
      : h.hasClubs
        ? h.shots.map((c, j) => `<span class="sum-pill">#${j + 1} ${c}</span>`).join('')
        : countPills(h.shots, h.gross);
    const sfCol = h.onCourse
      ? `<div class="sum-sf">
          <div class="sum-sf-pts">${h.pts !== null ? h.pts : '—'}</div>
          <div class="sum-sf-lbl">${h.par !== null ? 'Par ' + h.par : ''}</div>
        </div>`
      : '';
    return `<div class="sum-row${h.i === focusIdx ? ' focus' : ''}" data-hole="${h.i}">
      <div class="sum-left">
        <div class="sum-hnum">${h.i + 1}</div>
        <div class="sum-shots-count">${h.gross ? h.gross + 'sh' : ''}</div>
      </div>
      <div class="sum-pills">${pills}</div>
      ${sfCol}
    </div>`;
  }).join('');
  openSheet('Hole by Hole', html);
  const row = document.querySelector(`#sheetBody .sum-row[data-hole="${focusIdx}"]`);
  if (row) row.scrollIntoView({ block: 'center' });
}

const STAT_DETAIL = {
  gross(d) {
    const g = d.played.map(h => h.gross);
    const withPar = d.played.filter(h => h.par !== null);
    const toPar = sumOf(withPar.map(h => h.gross - h.par));
    let html = dtGroup('Overall',
      dtRow('Gross shots', d.total)
      + (withPar.length ? dtRow('To par', signed(toPar), `${withPar.length} hole${withPar.length === 1 ? '' : 's'} with a par`) : '')
      + dtRow('Average per hole', g.length ? oneDp(sumOf(g) / g.length) : '—')
      + dtRow('Median per hole', g.length ? median(g) : '—'));

    const chunks = nineChunks(d.holes);
    if (chunks.length > 1) {
      html += dtGroup('By nine', chunks.map(c => {
        const p = c.filter(h => h.gross);
        const wp = p.filter(h => h.par !== null);
        const tp = wp.length ? ` (${signed(sumOf(wp.map(h => h.gross - h.par)))})` : '';
        return dtRow(chunkLabel(c), p.length ? sumOf(p.map(h => h.gross)) + tp : '—');
      }).join(''));
    }

    const parTypes = [...new Set(withPar.map(h => h.par))].sort((a, b) => a - b);
    html += dtGroup('Average by par', parTypes.map(par => {
      const hs = withPar.filter(h => h.par === par);
      return dtRow(`Par ${par}`, oneDp(sumOf(hs.map(h => h.gross)) / hs.length),
        `${hs.length} hole${hs.length === 1 ? '' : 's'}`);
    }).join(''));

    if (withPar.length) {
      const buckets = [['Eagle+', 0], ['Birdie', 0], ['Par', 0], ['Bogey', 0], ['Double', 0], ['Triple+', 0]];
      withPar.forEach(h => { buckets[Math.min(5, Math.max(0, h.gross - h.par + 2))][1]++; });
      html += dtGroup('Scores', dtBars(buckets));
    }
    return html;
  },

  sf(d) {
    const pts = d.sfHoles.map(h => h.pts);
    const target = 2 * d.sfHoles.length;
    let html = dtGroup('Overall',
      dtRow('Stableford points', d.totalSF)
      + dtRow('Playing handicap', d.ph)
      + dtRow('Vs. playing to handicap', pts.length ? signed(d.totalSF - target) : '—', `${target} pts over ${d.sfHoles.length} holes`)
      + dtRow('Average per hole', pts.length ? oneDp(d.totalSF / pts.length) : '—'));

    const chunks = nineChunks(d.holes);
    if (chunks.length > 1) {
      html += dtGroup('By nine', chunks.map(c => {
        const s = c.filter(h => h.pts !== null);
        return dtRow(chunkLabel(c), s.length ? sumOf(s.map(h => h.pts)) : '—');
      }).join(''));
    }

    if (pts.length) {
      const buckets = [['0 pts', 0], ['1 pt', 0], ['2 pts', 0], ['3 pts', 0], ['4+ pts', 0]];
      pts.forEach(p => { buckets[Math.min(4, p)][1]++; });
      html += dtGroup('Points per hole', dtBars(buckets));
    }
    return html;
  },

  holes(d) {
    const missing = d.holes.filter(h => !h.gross).map(h => h.i + 1);
    return dtGroup('Logged',
      dtRow('Holes logged', `${d.played.length} / ${HOLES}`)
      + dtRow('Not logged yet', missing.length ? missing.join(', ') : 'None'));
  },

  clubs(d) {
    const clubs = clubFrequency(d.holes, true);
    const all = clubFrequency(d.holes, false);
    const clubShots = sumOf(clubs.map(e => e[1]));
    const clubHoles = d.holes.filter(h => h.hasClubs).length;
    return dtGroup('Overall',
      dtRow('Full shots (excl. putts)', clubShots)
      + dtRow('Different clubs used', clubs.length)
      + dtRow('Holes with club detail', clubHoles))
      + dtGroup('Hits per club', dtBars(all));
  },

  putts(d) {
    // Holes with known putts: tracked holes, or score-only holes with putts entered
    const known = d.played.filter(h => h.hasClubs || h.putts > 0);
    const p = known.map(h => h.putts);
    const total = sumOf(p);
    let html = dtGroup('Overall',
      dtRow('Total putts', total)
      + dtRow('Average per hole', p.length ? oneDp(total / p.length) : '—', `${p.length} hole${p.length === 1 ? '' : 's'} with putts logged`)
      + dtRow('Median per hole', p.length ? median(p) : '—')
      + dtRow('One-putts', p.filter(n => n === 1).length)
      + dtRow('Three-putts or worse', p.filter(n => n >= 3).length));

    const chunks = nineChunks(known.length ? d.holes : []);
    if (chunks.length > 1) {
      html += dtGroup('By nine', chunks.map(c => {
        const k = c.filter(h => h.gross && (h.hasClubs || h.putts > 0));
        return dtRow(chunkLabel(c), k.length ? `${sumOf(k.map(h => h.putts))} (${oneDp(sumOf(k.map(h => h.putts)) / k.length)}/hole)` : '—');
      }).join(''));
    }

    if (p.length) {
      const buckets = [['0 putts', 0], ['1 putt', 0], ['2 putts', 0], ['3+ putts', 0]];
      p.forEach(n => { buckets[Math.min(3, n)][1]++; });
      html += dtGroup('Putts per hole', dtBars(buckets));
    }
    return html;
  },

  diff(d) {
    const n = d.sfHoles.length;
    const diff = scoreDifferential(d.cd, n, d.adjGrossTotal);
    return dtGroup('Score differential',
      dtRow('Adjusted gross', d.adjGrossTotal, 'each hole capped at net double bogey')
      + dtRow('Holes counted', n)
      + dtRow('Course rating (SSS)', n === 18 ? d.cd.sss : `${d.cd.sss} → ${oneDp(d.cd.sss * n / 18)}`, n === 18 ? '' : `18-hole rating scaled to ${n} holes`)
      + dtRow('Slope', d.cd.slope)
      + dtRow('Played to', diff.toFixed(1), n === 18 ? '' : 'scaled up to 18 holes'))
      + `<p class="dt-note">(113 ÷ slope) × (adjusted gross − course rating). Playing conditions (PCC) are taken as 0.</p>`;
  },

  net(d) {
    const allowance = Math.round(hcp * HOLES / 18);
    return dtGroup('Net score',
      dtRow('Gross shots', d.total)
      + dtRow('Handicap allowance', allowance, `HCP ${hcp} over ${HOLES} holes`)
      + dtRow('Net score', hcp > 0 ? d.total - allowance : '—'));
  }
};
const STAT_TITLES = {
  gross: 'Gross Shots', sf: 'Stableford', holes: 'Holes Logged',
  clubs: 'Club Hits', putts: 'Putts', diff: 'Played To (WHS)', net: 'Net Score'
};

document.getElementById('ovHoles').addEventListener('click', e => {
  const tile = e.target.closest('.hole-tile');
  if (tile) openHoleDetail(+tile.dataset.hole);
});
document.getElementById('ovStats').addEventListener('click', e => {
  const box = e.target.closest('.stat-box');
  if (!box || !summaryData) return;
  const key = box.dataset.stat;
  openSheet(STAT_TITLES[key], STAT_DETAIL[key](summaryData));
});

function buildPlayerSwitch() {
  const wrap = document.getElementById('ovPlayerSwitch');
  wrap.innerHTML = '';
  if (players.length <= 1) return;
  players.forEach((p, idx) => {
    const tab = document.createElement('div');
    tab.className = 'player-tab' + (idx === summaryPlayerIdx ? ' sel' : '');
    tab.style.setProperty('--player-color', PLAYER_COLORS[idx % PLAYER_COLORS.length]);
    tab.innerHTML = `<span class="player-tab-dot"></span>${p.name}`;
    tab.addEventListener('click', () => {
      summaryPlayerIdx = idx;
      buildPlayerSwitch();
      renderSummaryFor(idx);
    });
    wrap.appendChild(tab);
  });
}

document.getElementById('sumBtn').addEventListener('click', () => {
  summaryPlayerIdx = 0;
  closeSheet();
  buildPlayerSwitch();
  renderSummaryFor(0);
  renderShareSection();

  const existingLb = document.querySelector('#summaryOverlay .leaderboard');
  if (existingLb) existingLb.remove();

  if (getSimplePlayers().length > 0) {
    const leaderboard = players.map((p, idx) => {
      let totalSF = 0;
      const cd = getCourseData(p);
      const isDetailed = p.mode === 'detailed';
      const ph = calcPlayingHCP(isDetailed ? hcp : p.hcp, cd, HOLES);

      for (let i = 0; i < HOLES; i++) {
        const gross = isDetailed ? round[i].length : p.round[i];
        if (gross) {
          const pts = stablefordPoints(i, gross, ph, cd);
          if (pts !== null) totalSF += pts;
        }
      }
      return { idx, name: p.name, sf: totalSF, hcp: isDetailed ? hcp : p.hcp };
    }).sort((a, b) => b.sf - a.sf);

    const lbHtml = leaderboard.map((p, i) =>
      `<div class="lb-row${i === 0 ? ' winner' : ''}" data-pidx="${p.idx}" style="--player-color:${PLAYER_COLORS[p.idx % PLAYER_COLORS.length]}">
        <span class="lb-pos">${i === 0 ? '🏆' : i + 1 + '.'}</span>
        <span class="lb-name">${p.name}</span>
        <span class="lb-sf">${p.sf} pts</span>
        <span class="lb-hcp">HCP ${p.hcp}</span>
      </div>`
    ).join('');

    document.getElementById('ovStatsSection').insertAdjacentHTML('afterend',
      `<div class="leaderboard"><div class="lobby-label" style="margin-bottom:8px">🏆 Leaderboard</div>${lbHtml}</div>`
    );

    document.querySelectorAll('#summaryOverlay .leaderboard .lb-row').forEach(row => {
      row.addEventListener('click', () => {
        summaryPlayerIdx = +row.dataset.pidx;
        buildPlayerSwitch();
        renderSummaryFor(summaryPlayerIdx);
      });
    });
  }

  showOverlay('summaryOverlay');
});
document.getElementById('sumClose').addEventListener('click', function() {
  hideOverlay('summaryOverlay');
});

// ── COPY ──
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Pipes instead of tabs so iOS doesn't turn rows of numbers into phone links
function textTable(rows) {
  const widths = rows[0].map((_, c) => Math.max(...rows.map(r => String(r[c]).length)));
  return rows.map(r => r.map((v, c) =>
    c === r.length - 1 ? String(v) : String(v).padEnd(widths[c])
  ).join(' | ').trimEnd()).join('\n');
}
function htmlTable(rows) {
  const [head, ...body] = rows;
  return `<table border="1" cellpadding="4" style="border-collapse:collapse">`
    + `<tr>${head.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr>`
    + body.map(r => `<tr>${r.map(v => `<td>${escHtml(v)}</td>`).join('')}</tr>`).join('')
    + `</table>`;
}

document.getElementById('copyBtn').addEventListener('click', () => {
  // No leading "Label:", iOS reads it as a URL and pastes a link
  const header = [
    selectedCourse || null,
    `${HOLES} holes`,
    hcp > 0 ? `HCP ${hcp}` : null,
  ].filter(Boolean).join(' · ');

  // Shots per hole
  const shotRows = [['Hole', 'Shots', 'Putts', 'Clubs used']];
  let shotTotal = 0, puttTotal = 0;
  round.forEach((shots, i) => {
    const putts = shots.filter(c => c === 'Putter').length;
    const clubs = shots.filter(c => c !== 'Putter' && c !== 'Shot');
    shotTotal += shots.length; puttTotal += putts;
    shotRows.push([i + 1, shots.length || '', shots.length ? putts : '', clubs.length ? clubs.join(' → ') : '']);
  });
  shotRows.push(['Total', shotTotal || '', puttTotal || '', '']);

  // Scorecard with Stableford for each player
  const cards = players.map((_, idx) => buildSummaryData(idx));
  const cardRows = [['Hole', 'Par', ...players.flatMap((p, idx) =>
    idx === 0 ? ['Shots', 'Stableford'] : [p.name, `${p.name} Stableford`])]];
  let parTotal = 0;
  for (let i = 0; i < HOLES; i++) {
    const par = cards[0].holes[i].par;
    if (par !== null) parTotal += par;
    cardRows.push([i + 1, par ?? '', ...cards.flatMap(c => {
      const h = c.holes[i];
      return [h.gross || '', h.pts ?? ''];
    })]);
  }
  cardRows.push(['Total', parTotal || '', ...cards.flatMap(c =>
    [c.total || '', c.sfHoles.length ? c.totalSF : ''])]);

  const text = [header, textTable(shotRows), textTable(cardRows)].join('\n\n');
  const html = `<p>${escHtml(header)}</p>${htmlTable(shotRows)}<br>${htmlTable(cardRows)}`;

  // Copy as HTML too so apps paste a real table
  const write = typeof ClipboardItem !== 'undefined' && navigator.clipboard.write
    ? navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html':  new Blob([html], { type: 'text/html' })
      })]).catch(() => navigator.clipboard.writeText(text))
    : navigator.clipboard.writeText(text);
  write.then(() => {
    const b = document.getElementById('copyBtn');
    b.textContent = '✓ Copied to clipboard!';
    setTimeout(() => b.textContent = 'Copy to Clipboard', 2000);
  });
});

// ── LIVE SHARE ──
// While a code is active, every save is pushed to Supabase (see share.js, supabase.sql)
// Declared so saveState can call scheduleShareSync before this section has run
var shareTimer = null;
function shareCode()   { return localStorage.getItem('gct_sharecode'); }
function shareSecret() { return localStorage.getItem('gct_sharesecret'); }
const shareUrl = code => new URL(`view.html?code=${formatCode(code)}`, location.href).href;
const clockTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Scored per player on the phone, so the web page only has to display it
function sharePayload() {
  return {
    v: 1,
    course: selectedCourse || null,
    hole,
    trackClubs,
    players: players.map((p, idx) => {
      const d = buildSummaryData(idx);
      return {
        name: p.name,
        hcp: d.isDetailed ? hcp : p.hcp,
        ph: d.cd ? d.ph : null,
        holes: d.holes.map(h => ({
          par: h.par,
          gross: h.gross || null,
          pts: h.pts,
          shots: h.shots && h.shots.length ? h.shots : null
        }))
      };
    })
  };
}

function setShareStatus(text) {
  document.getElementById('shareStatus').textContent = text;
}

async function pushShare() {
  const code = shareCode();
  if (!code) return;
  try {
    const ok = await supabaseRpc('share_round', { p_code: code, p_secret: shareSecret(), p_data: sharePayload() });
    setShareStatus(ok ? `synced ${clockTime()}` : 'code rejected');
  } catch (e) {
    setShareStatus('offline, will retry');
  }
}

function scheduleShareSync() {
  if (!shareEnabled() || !shareCode()) return;
  clearTimeout(shareTimer);
  shareTimer = setTimeout(pushShare, 2000);
}
window.addEventListener('online', scheduleShareSync);

function renderShareSection() {
  const section = document.getElementById('ovShareSection');
  section.style.display = shareEnabled() ? '' : 'none';
  if (!shareEnabled()) return;
  const code = shareCode();
  document.getElementById('ovShare').innerHTML = code
    ? `<div class="share-code">${formatCode(code)}</div>
       <div class="share-hint">${escHtml(shareUrl(code))}</div>
       <div class="share-actions">
         <button class="share-btn" data-share="link">Share link</button>
         <button class="share-btn share-stop" data-share="stop">Stop sharing</button>
       </div>`
    : `<button class="share-btn" data-share="start">Get a live code</button>
       <div class="share-hint">Anyone with the code can follow this round on the web</div>`;
  if (!code) setShareStatus('');
}

async function startSharing(btn) {
  btn.disabled = true;
  btn.textContent = 'Creating code…';
  const secret = randomSecret();
  try {
    // Retry on the rare code that's already taken
    for (let i = 0; i < 3; i++) {
      const code = randomCode();
      if (await supabaseRpc('share_round', { p_code: code, p_secret: secret, p_data: sharePayload() })) {
        localStorage.setItem('gct_sharecode', code);
        localStorage.setItem('gct_sharesecret', secret);
        renderShareSection();
        setShareStatus(`synced ${clockTime()}`);
        return;
      }
    }
  } catch (e) {}
  btn.disabled = false;
  btn.textContent = 'No connection, try again';
}

async function stopSharing() {
  if (!confirm('Stop sharing? The code will stop working.')) return;
  try {
    await supabaseRpc('unshare_round', { p_code: shareCode(), p_secret: shareSecret() });
  } catch (e) {
    alert("Couldn't reach the server. Try again when you have signal.");
    return;
  }
  localStorage.removeItem('gct_sharecode');
  localStorage.removeItem('gct_sharesecret');
  renderShareSection();
}

document.getElementById('ovShare').addEventListener('click', e => {
  const btn = e.target.closest('[data-share]');
  if (!btn) return;
  const action = btn.dataset.share;
  if (action === 'start') startSharing(btn);
  if (action === 'stop') stopSharing();
  if (action === 'link') {
    const url = shareUrl(shareCode());
    if (navigator.share) navigator.share({ title: 'Live round', url }).catch(() => {});
    else navigator.clipboard.writeText(url).then(() => { btn.textContent = '✓ Link copied'; });
  }
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

// ── TRACKING SHEET ──
// Clubs vs score-only, asked at the first tee.
// Mode buttons are shared with the settings overlay.
function trackOptionButtons(afterPick) {
  return [
    { label: '⛳ Clubs & Shots', val: true,  sub: 'A club for every shot' },
    { label: '🔢 Score Only',   val: false, sub: 'Just a total per hole' }
  ].map(({ label, val, sub }) => {
    const btn = document.createElement('button');
    // Current choice is highlighted, so dismissing keeps it
    btn.className = 'lobby-opt' + (trackClubs === val ? ' sel' : '');
    btn.style.cssText = 'flex:1;padding:14px 10px';
    btn.innerHTML = `<div style="font-size:15px">${label}</div>
      <div style="font-size:11px;opacity:0.55;font-weight:400;line-height:1.35;margin-top:5px">${sub}</div>`;
    btn.addEventListener('click', () => {
      trackClubs = val;
      saveState();
      afterPick();
    });
    return btn;
  });
}

function buildTrackOpts() {
  const wrap = document.getElementById('trackOpts');
  wrap.innerHTML = '';
  trackOptionButtons(() => {
    closeTrackSheet();
    buildClubButtons();
    render();
  }).forEach(btn => wrap.appendChild(btn));
}

function openTrackSheet() {
  buildTrackOpts();
  document.getElementById('trackSheet').style.display = '';
  document.getElementById('trackBackdrop').style.display = '';
}

function closeTrackSheet() {
  document.getElementById('trackSheet').style.display = 'none';
  document.getElementById('trackBackdrop').style.display = 'none';
}

document.getElementById('trackBackdrop').addEventListener('click', closeTrackSheet);

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

  const totalPar = customHolePars.reduce((s, p) => s + (p || 0), 0);
  const holesSnippet = customHolePars
    .map((p, i) => `      { par: ${p ?? '?'}, si: null }`)
    .join(',\n');
  const body =
`### New course suggestion

**Course name:** ${selectedCourse}
**Holes:** ${customHolePars.length}
**Total par:** ${totalPar}
**SSS:** ${customSSS ?? 'unknown'}
**Slope:** ${customSlope ?? 'unknown'}

\`\`\`js
'${selectedCourse}': {
  par: ${totalPar}, sss: ${customSSS ?? null}, slope: ${customSlope ?? null},
  holes: [
${holesSnippet}
  ]
}
\`\`\``;

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

// ── FRIENDS ──
// Saved partners: handicap, category and the tee they play off at each course
let friends = [];
try { friends = JSON.parse(localStorage.getItem('gct_friends')) || []; } catch (e) {}
function saveFriends() {
  localStorage.setItem('gct_friends', JSON.stringify(friends));
}
const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
function friendFor(p) {
  return friends.find(f => sameName(f.name, p.name));
}

function rememberFriend(p) {
  let f = friendFor(p);
  if (!f) {
    f = { name: p.name.trim(), tees: {} };
    friends.push(f);
  }
  f.hcp = p.hcp;
  f.category = p.category;
  // Only touch the tee where there was a choice to make
  if (selectedCourse && teeColoursFor().length > 1) {
    if (p.tee) f.tees[selectedCourse] = p.tee;
    else delete f.tees[selectedCourse];
  }
  saveFriends();
}

function addFriendAsPartner(f) {
  players.push({
    name: f.name,
    hcp: f.hcp,
    mode: 'simple',
    tee: null, // set from f.tees when the rows are built
    category: f.category || DEFAULT_CATEGORY,
    round: Array(HOLES || 18).fill(null)
  });
}

function buildPlayerLobby() {
  const wrap = document.getElementById('playersLobby');
  wrap.innerHTML = '<div class="lobby-label">Playing Partners (optional)</div>';
  buildPartnerRows(wrap, buildPlayerLobby);
}

// Partner rows with add/remove, used by the lobby and the settings overlay
function buildPartnerRows(wrap, rebuild) {
  const cats    = categoriesFor();
  const colours = teeColoursFor();
  const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
  getSimplePlayers().forEach((p, i) => {
    // A saved friend plays off their own tee for this course
    const friend = friendFor(p);
    if (friend) {
      const t = friend.tees[selectedCourse];
      p.tee = colours.includes(t) ? t : null;
    } else if (p.tee && !colours.includes(p.tee)) {
      p.tee = null; // tee from another course or hole count
    }
    if (!p.category) p.category = DEFAULT_CATEGORY;
    const teeField = colours.length < 2 ? '' : `
      <select class="lobby-custom-input" style="flex:1;padding:10px 30px 10px 10px" data-pidx="${i}" data-field="tee">
        <option value=""${p.tee ? '' : ' selected'}>Tee: ${selectedTee || 'default'}</option>
        ${colours.map(c => `<option value="${c}"${p.tee === c ? ' selected' : ''}>${c}</option>`).join('')}
      </select>`;
    const catField = cats.length < 2 ? '' : `
      <select class="lobby-custom-input" style="flex:1;padding:10px 30px 10px 10px" data-pidx="${i}" data-field="category">
        ${cats.map(c => `<option value="${c}"${p.category === c ? ' selected' : ''}>${cap(c)}</option>`).join('')}
      </select>`;
    const extras = (teeField || catField)
      ? `<div style="display:flex;gap:8px;margin-top:6px">${teeField}${catField}</div>` : '';
    const row = document.createElement('div');
    row.style.cssText = 'margin:10px 0';
    row.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center">
        <input class="lobby-custom-input" style="flex:2;padding:10px" value="${p.name}" placeholder="Name" data-pidx="${i}" data-field="name">
        <input class="lobby-custom-input" style="flex:1;padding:10px" type="number" value="${p.hcp}" placeholder="HCP" data-pidx="${i}" data-field="hcp">
        <button class="friend-star${friend ? ' on' : ''}" data-star="${i}" title="Save as friend">${friend ? '★' : '☆'}</button>
        <button class="pill-x" style="font-size:18px" data-pidx="${i}">✕</button>
      </div>${extras}
    `;
    wrap.appendChild(row);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'lobby-opt';
  addBtn.textContent = '+ Add player';
  addBtn.addEventListener('click', () => {
    players.push({
      name: `Player ${players.length}`,
      hcp: 36,
      mode: 'simple',
      tee: null,
      category: DEFAULT_CATEGORY,
      round: Array(HOLES || 18).fill(null)
    });
    saveState();
    rebuild();
  });
  wrap.appendChild(addBtn);

  const available = friends.filter(f => !getSimplePlayers().some(p => sameName(p.name, f.name)));
  if (available.length) {
    const chips = document.createElement('div');
    chips.className = 'friend-chips';
    chips.innerHTML = available.map(f =>
      `<button class="friend-chip" data-friend="${friends.indexOf(f)}">+ ${escHtml(f.name)} <small>${f.hcp}</small></button>`
    ).join('');
    chips.addEventListener('click', e => {
      const chip = e.target.closest('[data-friend]');
      if (!chip) return;
      addFriendAsPartner(friends[+chip.dataset.friend]);
      saveState();
      rebuild();
    });
    wrap.appendChild(chips);
  }

  // Category picker is a <select>
  wrap.querySelectorAll('[data-field]').forEach(inp => {
    inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      const p = getSimplePlayers()[inp.dataset.pidx];
      if (inp.dataset.field === 'name')     p.name = inp.value;
      if (inp.dataset.field === 'hcp')      p.hcp = Math.min(54, Math.max(0, parseInt(inp.value) || 0));
      if (inp.dataset.field === 'category') p.category = inp.value || DEFAULT_CATEGORY;
      if (inp.dataset.field === 'tee')      p.tee = inp.value || null;
      if (inp.dataset.field === 'name') {
        const star = wrap.querySelector(`[data-star="${inp.dataset.pidx}"]`);
        const saved = Boolean(friendFor(p));
        star.classList.toggle('on', saved);
        star.textContent = saved ? '★' : '☆';
      } else if (friendFor(p)) {
        rememberFriend(p);
      }
      saveState();
    });
  });

  wrap.querySelectorAll('[data-star]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = getSimplePlayers()[+btn.dataset.star];
      if (!p.name.trim()) return;
      const f = friendFor(p);
      if (f) {
        friends.splice(friends.indexOf(f), 1);
        saveFriends();
      } else {
        rememberFriend(p);
      }
      rebuild();
    });
  });

  // Bind remove
  wrap.querySelectorAll('.pill-x[data-pidx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = getSimplePlayers()[parseInt(btn.dataset.pidx)];
      if (p.round.some(Boolean) && !confirm(`Remove ${p.name}? Their scores will be lost.`)) return;
      players.splice(players.indexOf(p), 1);
      saveState();
      rebuild();
    });
  });
}

function openLobby() {
  lobbySnapshot = hasRoundData() ? snapshotRound() : null;
  buildRestoreBtn();
  // Doubled nine shows as 18
  lobbySecondRound = secondRound && eighteenIsDoubledNine(selectedCourse);
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
      customSSS      = null;
      customSlope    = null;
      selectedStart  = null;
      saveState();
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
  hideOverlay('lobbyOverlay');
  saveState();
  buildStrip();
  buildClubButtons();
  render();
  // Ask tracking mode at the first tee
  openTrackSheet();
});

// ── SETTINGS ──
function buildSettingsUI() {
  const scroll = document.getElementById('settingsScroll');
  scroll.innerHTML = '';

  // Tracking mode can change mid-round without losing scores
  const trackGroup = document.createElement('div');
  trackGroup.className = 'settings-group';
  trackGroup.innerHTML = `<div class="settings-group-title">Tracking</div>`;
  const trackRow = document.createElement('div');
  trackRow.style.cssText = 'display:flex;gap:10px';
  // closeSettings applies the change to the pad
  trackOptionButtons(buildSettingsUI).forEach(btn => trackRow.appendChild(btn));
  trackGroup.appendChild(trackRow);
  scroll.appendChild(trackGroup);

  if (!trackClubs) {
    const modeNote = document.createElement('div');
    modeNote.className = 'settings-putter-note';
    modeNote.innerHTML = `<span>🔢</span> Your bag isn't used while scoring by total`;
    scroll.appendChild(modeNote);
  }

  const partnerGroup = document.createElement('div');
  partnerGroup.className = 'settings-group';
  const rebuildPartners = () => {
    partnerGroup.innerHTML = '<div class="settings-group-title">Playing Partners</div>';
    buildPartnerRows(partnerGroup, rebuildPartners);
  };
  rebuildPartners();

  scroll.appendChild(partnerGroup);

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

  // Mid-round the bag is being adjusted, not chosen before teeing off
  document.getElementById('startRoundBtn').textContent =
    roundStarted() ? 'Done' : 'Start Round →';
}

function closeSettings() {
  hideOverlay('settingsOverlay');
  saveState();
  buildClubButtons();
  render();
}

document.getElementById('settingsBtn').addEventListener('click', () => {
  buildSettingsUI();
  showOverlay('settingsOverlay');
});
document.getElementById('settingsClose').addEventListener('click', closeSettings);
document.getElementById('startRoundBtn').addEventListener('click', closeSettings);

// Return to lobby if pressing on logo during a round
document.querySelector('.logo').addEventListener('click', () => {
  if (roundStarted()) {
    if (!confirm('Leave round? Progress will be lost.')) return;
  }
  openLobby();
});

// ── INIT ──
if (roundStarted()) {
  // Resume saved round directly
  buildStrip();
  buildClubButtons();
  render();
} else {
  // No active round, show lobby
  buildStrip();
  buildClubButtons();
  render();
  openLobby();
}
