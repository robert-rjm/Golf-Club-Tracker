// Shared state: the bag, the round, lobby choices and players, kept in localStorage.
// Loaded first. The other files read and write these globals.

// ── ALL AVAILABLE CLUBS ──
const ALL_CLUBS = {
  'Woods & Hybrid': ['D', '3W', '5W', '7W', '2H', '3H', '4H', '5H', '6H'],
  'Irons':          ['2i', '3i', '4i', '5i', '6i', '7i', '8i', '9i'],
  'Wedges':         ['PW', 'PA', 'GW', 'AW', 'SW', 'LW']
};

// Logged as strokes but not clubs. 'Shot' is the score-only placeholder.
const NOT_A_CLUB = ['Putter', 'Penalty', 'Shot'];

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
  // live-share.js loads later, so a save made while the files are still loading skips the push
  if (typeof scheduleShareSync === 'function') scheduleShareSync();
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

// ── OVERLAY HELPERS (inline style avoids Safari flex bugs) ──
function showOverlay(id) {
  var el = document.getElementById(id);
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
}
function hideOverlay(id) {
  document.getElementById(id).style.display = 'none';
}

const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
