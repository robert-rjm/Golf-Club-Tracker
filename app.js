// ── ALL AVAILABLE CLUBS ──
const ALL_CLUBS = {
  'Woods & Hybrid': ['D', '3W', '5W', '7W', '2H', '3H', '4H', '5H', '6H'],
  'Irons':          ['2i', '3i', '4i', '5i', '6i', '7i', '8i', '9i'],
  'Wedges':         ['PW', 'PA', 'GW', 'AW', 'SW', 'LW']
};

// Logged alongside clubs but not clubs, so they never count towards "Most Used".
// 'Shot' is the placeholder a score-only round logs in place of a club name.
const NOT_A_CLUB = ['Putter', 'Penalty', 'Shot'];

function withSecondRound(courseObj) {
  if (!secondRound) return courseObj;
  // Only the hole list doubles. par/ratingPar/sss/slope stay at the course's rating
  // values — calcPlayingHCP scales the resulting course handicap up by totalHoles/18,
  // so doubling the par here too would mismatch it against the un-doubled rating and
  // swing the handicap wildly negative.
  return { ...courseObj, holes: [...courseObj.holes, ...courseObj.holes] };
}

// The front or back nine of an 18-hole course entry
function nineSlice(courseObj, side) {
  return side === 'back' ? courseObj.holes.slice(9, 18) : courseObj.holes.slice(0, 9);
}

// Rotate an 18-hole course to start on back 9 when selectedStart === 'back'
function withStartNine(courseObj) {
  if (selectedStart !== 'back' || courseObj.holes.length !== 18) return courseObj;
  const holes = [...courseObj.holes.slice(9), ...courseObj.holes.slice(0, 9)];
  return { ...courseObj, holes };
}

// Ratings vary by tee colour and player category, the card does not — so this returns
// only { sss, slope }. A course with no `tees` list keeps using its top-level ratings.
// Passing null for either axis takes the course's defaultTee and, within it, the first
// entry listed. An unrated combination degrades down the chain below to the default tee,
// so a round never ends up with no ratings at all.
//
// A tee entry with no `players` is rated for everyone, which is how most courses outside
// France publish: one rating per tee, no men/ladies split. Such an entry matches whatever
// category is asked for, so a colour can mix the two — list the gendered entries and let
// an unlabelled one catch every other category.
function ratingFor(course, tee, players) {
  if (!course.tees || !course.tees.length) return { sss: course.sss, slope: course.slope };
  const pick = (colour, cat) => course.tees.find(x =>
    (!colour || x.colour === colour) && (!cat || !x.players || x.players === cat));
  const colour = tee || course.defaultTee;
  const t = pick(colour, players)              // the tee and category asked for
         || pick(colour, null)                 // that tee, whichever category it lists
         || pick(course.defaultTee, players)   // unknown tee — fall back to the default
         || pick(course.defaultTee, null)
         || course.tees[0];
  return { sss: t.sss, slope: t.slope };
}

// Resolves the hole list for the round, then layers on the ratings for the tee this
// player is off and the category they are rated under. `selectedTee` is the lobby's
// choice — yours, and the default for any partner who has not picked their own.
function getCourseData(player) {
  const course = buildCourseData();
  if (!course) return course;
  const tee = (player && player.tee) || selectedTee;
  return { ...course, ...ratingFor(course, tee, player && player.category) };
}

function buildCourseData() {
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
      // A second round may be played on the other nine, so build the hole list from
      // both selections rather than repeating selectedNine twice.
      const holes = secondRound
        ? [...nineSlice(full, selectedNine), ...nineSlice(full, secondNine || selectedNine)]
        : nineSlice(full, selectedNine);
      // Keep full.par/ratingPar/sss/slope (18-hole rating) intact — calcPlayingHCP
      // already scales the resulting course handicap down by totalHoles/18 for
      // partial rounds. Overriding par with the 9-hole subset here would mismatch
      // it against the still-18-hole sss/slope and badly inflate the handicap calc.
      return { ...full, holes };
    }
  }
  // Custom/Others course — build synthetic data from customHolePars (default par 4)
  if (selectedHoles > 0) {
    const baseHoles = Array.from({ length: selectedHoles }, (_, i) => ({
      par: customHolePars[i] || null, si: null
    }));
    const holes = secondRound ? [...baseHoles, ...baseHoles] : baseHoles;
    const knownPars = baseHoles.filter(h => h.par !== null);
    const basePar = knownPars.length ? knownPars.reduce((s, h) => s + h.par, 0) : null;
    // customSSS is entered as an 18-hole rating, so ratingPar has to be 18-hole too.
    const ratingPar = basePar !== null ? basePar * 18 / selectedHoles : null;
    return { par: basePar, ratingPar, sss: customSSS, slope: customSlope, holes };
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

// WHS course handicap for any player, adjusted for the number of holes played.
// sss/slope are always 18-hole-equivalent ratings, so ratingPar (the par those ratings
// were measured against) is used here rather than the par of the holes being played.
function calcPlayingHCP(playerHcp, course, totalHoles) {
  if (course.slope == null || course.sss == null) return Math.round(playerHcp * totalHoles / 18);
  const ratingPar = course.ratingPar ?? course.par;
  const ch = Math.round(playerHcp * (course.slope / 113) + (course.sss - ratingPar));
  return Math.round(ch * totalHoles / 18);
}

// Stroke indexes are ranked 1..18 across a whole course entry, but a round may play a
// subset of it (a single nine), repeat holes (a second round), or use holes with no SI
// at all (custom courses). Rank the holes actually being played into a dense 1..n so
// the stroke allocation below hands out exactly the playing handicap, no more or less.
function strokeRanks(course) {
  const order = course.holes.map((h, i) => ({ i, si: h.si == null ? Infinity : h.si }));
  // Ties — a repeated nine, or holes with no SI — fall back to the order played.
  order.sort((a, b) => a.si - b.si || a.i - b.i);
  const ranks = new Array(course.holes.length);
  order.forEach((o, r) => { ranks[o.i] = r + 1; });
  return ranks;
}

// How many extra strokes a player receives on a given hole (0-based index)
function strokesOnHole(holeIdx, playingHcp, course) {
  const numHoles = course.holes.length;
  if (!numHoles) return 0;
  const rank = strokeRanks(course)[holeIdx];
  if (playingHcp >= 0) {
    return Math.floor(playingHcp / numHoles) + (rank <= playingHcp % numHoles ? 1 : 0);
  }
  // A negative course handicap gives strokes back, starting at the easiest hole, so
  // count in from the other end of the ranking.
  const give = -playingHcp;
  return -(Math.floor(give / numHoles) + (numHoles - rank < give % numHoles ? 1 : 0));
}

// Stableford points for a hole (returns null if hole not played)
function stablefordPoints(holeIdx, grossShots, playingHcp, course) {
  if (!grossShots) return null;
  const par     = course.holes[holeIdx].par;
  if (par === null) return null;
  const strokes = strokesOnHole(holeIdx, playingHcp, course);
  return Math.max(0, 2 + par + strokes - grossShots);
}

// WHS "Net Double Bogey" cap for a hole (max score countable for handicap purposes)
function adjustedGrossForHole(holeIdx, grossShots, playingHcp, course) {
  if (!grossShots) return null;
  const par = course.holes[holeIdx].par;
  if (par === null) return null;
  const strokes = strokesOnHole(holeIdx, playingHcp, course);
  return Math.min(grossShots, par + 2 + strokes);
}

// WHS Score Differential: (113 / Slope Rating) × (Adjusted Gross Score − Course Rating − PCC)
// PCC (Playing Conditions Calculation) isn't computed here — it needs field-wide scoring
// data this app doesn't track, so it's treated as 0. For rounds shorter than 18 holes the
// result is scaled to an 18-hole equivalent, matching how playing handicap is already
// scaled elsewhere in this app for partial rounds.
function scoreDifferential(course, holesCounted, adjustedGrossTotal) {
  if (!course || course.slope == null || course.sss == null || !holesCounted) return null;
  // course.sss is always an 18-hole-equivalent rating (same assumption calcPlayingHCP
  // makes) — scale it down to the holes actually played before comparing.
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
let selectedHoles    = 0;   // 0 = not yet chosen
let selectedNine     = null; // 'front' | 'back' | null — only used when 9 holes derived from 18
let secondNine       = null; // 'front' | 'back' | null — the nine played in an added second round
let selectedStart    = null; // 'front' | 'back' | null — which 9 to start on for a full 18
let selectedTee      = null; // tee colour for the round; null uses the course's defaultTee
let secondRound      = false; // play the selected holes twice (e.g. 9 → 18)
let lobbySecondRound = false; // lobby picked 18 on a 9-hole course — play its nine twice
let customHolePars   = [];   // per-hole par for custom/Others courses (null = not set)
let customSSS        = null; // Standard Scratch Score for custom courses
let customSlope      = null; // Slope rating for custom courses
let trackClubs       = true; // false = score-only round: one total per hole, no club per shot
let hcp = localStorage.getItem('gct_hcp') !== null
  ? parseInt(localStorage.getItem('gct_hcp'), 10)
  : DEFAULT_HCP;

// ── MULTIPLAYER STATE ──
// The detailed player carries no `hcp`: scoring reads the global `hcp` for them
// (`isDetailed ? hcp : p.hcp`), so a copy here would only drift. Partners have their own.
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
  // 0 rather than HOLES, so a first run shows nothing selected instead of a phantom 18
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
    // Drop the stale copy older versions stored on the detailed player
    if (p.mode === 'detailed') delete p.hcp;
    // Players saved before categories existed default in rather than staying unrated
    if (!p.category) p.category = DEFAULT_CATEGORY;
  });
  // Corrupted or hand-cleared storage could otherwise leave no detailed player at all,
  // which mainPlayer() reports as undefined and every caller of it then trips over.
  if (!players.some(p => p.mode === 'detailed')) {
    players.unshift({ name: 'You', mode: 'detailed', category: DEFAULT_CATEGORY });
  }
  const savedSSS   = localStorage.getItem('gct_customsss');
  const savedSlope = localStorage.getItem('gct_customslope');
  if (savedSSS)   customSSS   = savedSSS   ? parseFloat(savedSSS)   : null;
  if (savedSlope) customSlope = savedSlope ? parseFloat(savedSlope) : null;
  // Absent on rounds saved before score-only mode existed — those tracked clubs
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

}

function buildPutterStepper(area) {
  // Putter stepper — always present alongside the clubs
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
// The total is the primary number. Putts and penalties below are a breakdown *of* it,
// never an addition to it, so forgetting to log a putt can never make the score wrong.
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

  // An unplayed hole sits on its par: tapping the number takes par, ± steps away from
  // it. Nothing is written to `round` until one of those happens, so an unvisited hole
  // stays genuinely empty for the strip, "holes logged" and the Stableford total.
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
    if (holeTotal()) return;               // already scored — the steppers edit it
    const par = pendingScore();
    if (!par) return;                      // no par data to preselect
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

  // Both steppers only ever reassign strokes already inside the total, so the score
  // never moves underneath the golfer. `updateScorePadUI` disables + when it is full.
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

    // Event listeners. Like the main pad, an unscored hole sits on its par: ± steps away
    // from it and tapping the number takes it, but nothing is written to the partner's
    // card until one of those happens, so an unplayed hole stays genuinely empty.
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
          // Stepping below 1 clears the hole, putting it back on the par preselect
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
        if (p.round[hole - 1]) return;        // already scored — the steppers edit it
        const par = partnerPar(p);
        if (!par) return;                     // no par data to preselect
        p.round[hole - 1] = par;
        saveState();
        renderPartnerScores();
      });
    });
  }
}

// The par a partner's current hole is preselected at. Hole pars are shared across tees
// and categories, but the player is passed through so this follows their own card.
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
// A score-only hole stores the same token array as a tracked one — plain 'Shot'
// placeholders in place of club names — so every count, chip, Stableford point,
// adjusted gross and scorecard cell downstream reads exactly as it always did.
// Canonical order mirrors setPutterCount: shots, then penalties, then putts.
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
// The total is authoritative: a breakdown that no longer fits inside it is trimmed
function setHoleTotal(n) {
  n = Math.max(0, n);
  const putts = Math.min(getPutterCount(), n);
  const pens  = Math.min(getPenaltyCount(), n - putts);
  writeHole(n, putts, pens);
}
// ...and the breakdown can never move the total, only reassign strokes inside it
function setBreakdown(putts, pens) {
  const total = holeTotal();
  putts = Math.min(Math.max(0, putts), total);
  pens  = Math.min(Math.max(0, pens), total - putts);
  writeHole(total, putts, pens);
}
// The par this hole is preselected at before anything is logged.
// null on a custom course whose pars were never entered.
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

  // Strokes in the total not yet claimed by the breakdown
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
    // Same tee, but each player is rated under their own category
    const cd = getCourseData(player);
    const countEl = document.getElementById(`partnerCount-${pIdx}`);
    const sfEl = document.getElementById(`partnerSF-${pIdx}`);
    if (!countEl) return;

    const gross = player.round[hole - 1];
    // An unscored hole shows its par, dimmed, until the golfer commits to a number
    const par = cd && hole <= cd.holes.length ? cd.holes[hole-1].par : null;
    countEl.textContent = gross || (par ?? '—');
    countEl.classList.toggle('pending', !gross);
    const labelEl = document.getElementById(`partnerLabel-${pIdx}`);
    if (labelEl) labelEl.textContent = gross ? 'shots' : 'par';

    // Stableford for this player
    if (sfEl && cd && gross) {
      // Recalc with player's own HCP
      const playerPH = calcPlayingHCP(player.hcp, cd, HOLES);
      const pts = stablefordPoints(hole - 1, gross, playerPH, cd);
      sfEl.textContent = pts !== null ? `${pts} pts` : '';
      sfEl.className = 'partner-sf' + (pts >= 2 ? ' good' : pts === 0 ? ' bad' : '');
    } else if (sfEl) {
      sfEl.textContent = '';
    }

    // With a score logged, minus always works — stepping below 1 clears the hole.
    // On the par preselect it only makes sense if there is a par above 1 to step down from.
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

  // Par + stroke allowance label for current hole
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

  // Show "Continue round" button on last hole if second round not yet added
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
    // A row of identical 'Shot' pills would say nothing — show the breakdown instead
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
  // Record which nine the extra holes are played on separately — overwriting
  // selectedNine here would re-score the already-played first nine against the
  // other nine's pars and stroke indexes.
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
  if (!round[hole-1].length) return;
  // Score-only: take a stroke off the total rather than popping whichever token happens
  // to be last, which would quietly drop a putt out of the breakdown as well.
  if (trackClubs) round[hole-1].pop();
  else            setHoleTotal(holeTotal() - 1);
  saveState();
  render();
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
const PLAYER_COLORS = ['#c9a84c', '#5fb0c9', '#e0973c', '#8fbf5f', '#d1637a', '#8a7fd6'];
let summaryPlayerIdx = 0;

// Summary pills for a hole with no club detail: the total, plus whatever breakdown a
// score-only round recorded. Partners pass no tokens and get just the total.
function countPills(tokens, gross) {
  const putts = tokens ? tokens.filter(c => c === 'Putter').length : 0;
  const pens  = tokens ? tokens.filter(c => c === 'Penalty').length : 0;
  return `<span class="sum-pill">${gross} shot${gross === 1 ? '' : 's'}</span>`
    + (putts ? `<span class="sum-pill">${putts} putt${putts === 1 ? '' : 's'}</span>` : '')
    + (pens  ? `<span class="sum-pill">${pens} penalt${pens === 1 ? 'y' : 'ies'}</span>` : '');
}

// Per-hole data behind the summary currently on screen. The detail sheets read from
// here so they always describe the same player and numbers as the boxes they came from.
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

// Gathers everything the summary shows for one player (main or partner)
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
      // Decided per hole, not by the mode currently selected: switching mid-round leaves
      // a card where some holes carry club names and others only 'Shot' placeholders.
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

  // ── Area 1: compact hole grid (gross + Stableford), tap for the club-by-club list
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

  // ── Area 2: stat boxes, each opening its own breakdown
  // "Most Used" club is only meaningful for the main player — partners aren't tracked
  // per-club, and a score-only round has no club names to rank at all
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

  // Putts are worth showing whenever any were logged — in a score-only round they are
  // the whole payoff for keeping the optional breakdown
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

// [club, count] pairs, most used first. `clubsOnly` false also counts putts and
// penalties so the breakdown sheet can show every stroke.
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
// Nines as played: 1–9, 10–18, and on into a second round
function nineChunks(holes) {
  const out = [];
  for (let s = 0; s < holes.length; s += 9) out.push(holes.slice(s, s + 9));
  return out;
}
const chunkLabel = c => `Holes ${c[0].i + 1}–${c[c.length - 1].i + 1}`;

// Full hole-by-hole log with every club, scrolled to the hole that was tapped
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
    // A hole counts if its putts are known: club-tracked holes always log them (0 means
    // a chip-in), score-only holes only when a putt breakdown was entered
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
document.getElementById('copyBtn').addEventListener('click', () => {
  const header = [
    selectedCourse ? `Course: ${selectedCourse}` : null,
    `Holes: ${HOLES}`,
    hcp > 0 ? `HCP: ${hcp}` : null,
  ].filter(Boolean).join(' | ');
  const rows = round.map((shots, i) => {
    if (trackClubs) {
      return `Hole ${i+1} (${shots.length} shots): ${shots.length ? shots.join(' → ') : '—'}`;
    }
    // Score-only: a run of identical 'Shot' tokens is noise — print the breakdown
    const putts = shots.filter(c => c === 'Putter').length;
    const pens  = shots.filter(c => c === 'Penalty').length;
    const extra = [
      putts ? `${putts} putt${putts === 1 ? '' : 's'}` : null,
      pens  ? `${pens} penalt${pens === 1 ? 'y' : 'ies'}` : null
    ].filter(Boolean).join(', ');
    return `Hole ${i+1}: ${shots.length || '—'}${extra ? ` (${extra})` : ''}`;
  }).join('\n');

  // Scorecard table (Hole, Par, score per player) appended at the bottom. No player is
  // passed because this only reads hole pars, which are shared across tees and categories.
  const cd = getCourseData();
  const cols = ['Hole', 'Par', ...players.map(p => p.name)];
  const tableLines = [cols.join('\t')];
  const totals = players.map(() => 0);
  let parTotal = 0;
  for (let i = 0; i < HOLES; i++) {
    const par = cd && i < cd.holes.length && cd.holes[i].par !== null ? cd.holes[i].par : '';
    if (par !== '') parTotal += par;
    const scores = players.map((p, pIdx) => {
      const gross = p.mode === 'detailed' ? round[i].length : p.round[i];
      if (gross) totals[pIdx] += gross;
      return gross || '';
    });
    tableLines.push([i + 1, par, ...scores].join('\t'));
  }
  tableLines.push(['Total', parTotal || '', ...totals.map(t => t || '')].join('\t'));

  const text = (header ? `${header}\n\n${rows}` : rows) + `\n\n${tableLines.join('\n')}`;
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
  // A course with only a 9-hole entry offers 18 by playing that nine twice
  if (set.has(9) && !set.has(18)) set.add(18);
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

// Returns true if 18 holes for this course means playing its nine twice, because the
// course has a 9-hole entry and no 18-hole one. The duplication is the same one the
// "add another nine" button applies mid-round — withSecondRound repeats the hole list
// and leaves par/ratingPar/sss/slope at the course's rating values.
function eighteenIsDoubledNine(course) {
  const entries = Object.keys(COURSES).filter(k =>
    k.replace(/\s*-\s*\d+\s*Hole$/i, '') === course
  );
  return entries.some(k => COURSES[k].holes.length === 9)
      && !entries.some(k => COURSES[k].holes.length === 18);
}

// The hole count the lobby is showing as picked. selectedHoles is always one lap, so a
// doubled nine is stored as 9 + lobbySecondRound rather than as selectedHoles = 18.
function lobbyHoleChoice() {
  return selectedHoles * (lobbySecondRound ? 2 : 1);
}

// Returns true when the course has an 18-hole entry (so front/back start matters)
function hasFullRound(course) {
  return Object.keys(COURSES).some(k =>
    k.replace(/\s*-\s*\d+\s*Hole$/i, '') === course && COURSES[k].holes.length === 18
  );
}

// The COURSES entry this round draws its ratings from. Deliberately does NOT go through
// buildCourseData: that needs selectedNine to resolve a nine sliced out of an 18-hole
// card, and falls back to the custom-course shape until one is picked. The tee and
// category pickers are built before the front/back choice exists, so going through it
// made a rated course look unrated and silently discarded the chosen tee.
function courseEntry() {
  const explicit = Object.values(COURSES).find(c =>
    courseBaseName(c) === selectedCourse && c.holes.length === selectedHoles
  );
  if (explicit) return explicit;
  // A nine derived from an 18-hole entry is rated off that entry, whichever nine it is
  if (selectedHoles === 9) {
    return Object.values(COURSES).find(c =>
      courseBaseName(c) === selectedCourse && c.holes.length === 18
    ) || null;
  }
  return null;
}

// Tee colours and categories follow the hole count: St Genis lists seven colours for its
// nine, but its 5-hole compact entry lists only its own. Both are empty for a course with
// no `tees`, which is how the pickers know to stay hidden.
function teeColoursFor() {
  const c = courseEntry();
  return c && c.tees ? [...new Set(c.tees.map(t => t.colour))] : [];
}

function categoriesFor() {
  const c = courseEntry();
  return c && c.tees ? [...new Set(c.tees.filter(t => t.players).map(t => t.players))] : [];
}

// The single detailed player — 'You'. Everyone else is a simple-mode partner.
function mainPlayer() {
  return players.find(p => p.mode === 'detailed') || players[0];
}

// Only worth showing when there is a choice to make: one tee, or none listed, needs no
// picker, and the resolver falls back to the course's defaultTee anyway.
function buildTeeOpts() {
  const wrap    = document.getElementById('teeOpts');
  const section = document.getElementById('teeSection');
  const colours = teeColoursFor();
  wrap.innerHTML = '';
  if (colours.length < 2) {
    // Drop a tee left over from another course or hole count
    if (!colours.includes(selectedTee)) selectedTee = null;
    section.style.display = 'none';
    return;
  }
  const course = courseEntry();
  if (!colours.includes(selectedTee)) selectedTee = (course && course.defaultTee) || colours[0];
  // A course can carry seven or more tees — far too many to sit as pills in one row
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
    buildPlayerLobby();   // partner rows show this tee as their "default" option
    updateLobbyStartBtn();
  });
  wrap.appendChild(sel);
  section.style.display = '';
}

// Category for the detailed player, defaulting to DEFAULT_CATEGORY. Acts as a radio:
// there is always exactly one selected, so clicking the current one is a no-op.
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
// Clubs vs score-only, asked once at the first tee rather than taking a box in the
// lobby. Both modes write the same token array per hole, so the choice only changes
// what the pad logs and how it is displayed — never how anything is scored.
// The pair of mode buttons, shared by the first-tee sheet and the settings overlay so
// the two can never drift. `afterPick` is what the host does once the choice is stored.
function trackOptionButtons(afterPick) {
  return [
    { label: '⛳ Clubs & Shots', val: true,  sub: 'A club for every shot' },
    { label: '🔢 Score Only',   val: false, sub: 'Just a total per hole' }
  ].map(({ label, val, sub }) => {
    const btn = document.createElement('button');
    // The current choice is highlighted, so dismissing the sheet keeps it
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
  // The choice is held as one lap plus a repeat flag, but 18 means "the nine twice" on
  // some courses and a real 18-hole card on others — so re-express it for this course
  // before validating, or switching courses leaves a doubled nine on an 18-hole entry.
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
      // 18 on a 9-hole course is that nine played twice, so keep selectedHoles at one
      // lap and flag the repeat — same shape as the mid-round "add another nine".
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
      buildPlayerLobby();   // partner tee/category rows follow the new hole count
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

function buildPlayerLobby() {
  const wrap = document.getElementById('playersLobby');
  wrap.innerHTML = '<div class="lobby-label">Playing Partners (optional)</div>';

  const cats    = categoriesFor();
  const colours = teeColoursFor();
  const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
  getSimplePlayers().forEach((p, i) => {
    // A tee left over from another course or hole count is no longer selectable
    if (p.tee && !colours.includes(p.tee)) p.tee = null;
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
    buildPlayerLobby();
  });
  wrap.appendChild(addBtn);

  // Bind inputs — the category picker is a <select>, so match on the attribute not the tag
  wrap.querySelectorAll('[data-field]').forEach(inp => {
    inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      const p = getSimplePlayers()[inp.dataset.pidx];
      if (inp.dataset.field === 'name')     p.name = inp.value;
      if (inp.dataset.field === 'hcp')      p.hcp = Math.min(54, Math.max(0, parseInt(inp.value) || 0));
      if (inp.dataset.field === 'category') p.category = inp.value || DEFAULT_CATEGORY;
      if (inp.dataset.field === 'tee')      p.tee = inp.value || null;
      saveState();
    });
  });

  // Bind remove
  wrap.querySelectorAll('.pill-x[data-pidx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const simpleIdx = parseInt(btn.dataset.pidx);
      const globalIdx = players.indexOf(getSimplePlayers()[simpleIdx]);
      players.splice(globalIdx, 1);
      saveState();
      buildPlayerLobby();
    });
  });
}

function openLobby() {
  // A round already doubling its nine should show 18 selected, not 9
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

  // Hole buttons — built based on current course
  buildHoleOpts(selectedCourse);

  // HCP input
  const hcpInput = document.getElementById('hcpInput');
  hcpInput.value = hcp;
  hcpInput.oninput = () => {
    const v = parseInt(hcpInput.value, 10);
    // Blank box falls back to the maximum, not to anyone's actual handicap — a real one
    // is only ever remembered from what was entered last time, via gct_hcp.
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
  const hcpInput = document.getElementById('hcpInput');
  const v = parseInt(hcpInput.value, 10);
  hcp = isNaN(v) ? DEFAULT_HCP : Math.min(54, Math.max(0, v));
  // A doubled nine starts already in its second round, exactly as if the nine had been
  // played and "add another nine" pressed at the turn.
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
  // Asked at the first tee, where you actually know what kind of round this is.
  // The pad behind it is already showing last round's mode, highlighted in the sheet.
  openTrackSheet();
});

// ── SETTINGS ──
function buildSettingsUI() {
  const scroll = document.getElementById('settingsScroll');
  scroll.innerHTML = '';

  // Tracking mode, switchable at any point in the round: both modes store the same
  // token array per hole, so flipping it never loses a score already logged.
  const trackGroup = document.createElement('div');
  trackGroup.className = 'settings-group';
  trackGroup.innerHTML = `<div class="settings-group-title">Tracking</div>`;
  const trackRow = document.createElement('div');
  trackRow.style.cssText = 'display:flex;gap:10px';
  // Re-rendering moves the highlight; closeSettings is what applies it to the pad
  trackOptionButtons(buildSettingsUI).forEach(btn => trackRow.appendChild(btn));
  trackGroup.appendChild(trackRow);
  scroll.appendChild(trackGroup);

  if (!trackClubs) {
    const modeNote = document.createElement('div');
    modeNote.className = 'settings-putter-note';
    modeNote.innerHTML = `<span>🔢</span> Your bag isn't used while scoring by total`;
    scroll.appendChild(modeNote);
  }

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
  // No active round — show lobby
  buildStrip();
  buildClubButtons();
  render();
  openLobby();
}
