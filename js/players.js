// Playing partners and saved friends.

// ── FRIENDS ──
// Partners with a real name are saved as friends: handicap, category and the tee they
// play off at each course. Managed under ⚙ → Friends.
let friends = [];
try { friends = JSON.parse(localStorage.getItem('gct_friends')) || []; } catch (e) {}
function saveFriends() {
  localStorage.setItem('gct_friends', JSON.stringify(friends));
}
const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
// Blank or the "Player 2" placeholder from + Add player
const isPlaceholderName = name => !String(name).trim() || /^player \d+$/i.test(String(name).trim());
function friendFor(p) {
  return isPlaceholderName(p.name) ? null : friends.find(f => sameName(f.name, p.name));
}

function rememberFriend(p) {
  if (isPlaceholderName(p.name)) return;
  let f = friendFor(p);
  if (!f) {
    f = { name: p.name.trim(), tees: {} };
    friends.push(f);
  }
  f.hcp = p.hcp;
  f.category = p.category;
  // Only touch the tee where there was a choice to make
  if (selectedCourse && teeColorsFor().length > 1) {
    if (p.tee) f.tees[selectedCourse] = p.tee;
    else delete f.tees[selectedCourse];
  }
  saveFriends();
}

// The tee is applied from f.tees when the rows are built
function applyFriend(p, f) {
  p.name = f.name;
  p.hcp = f.hcp;
  p.category = f.category || DEFAULT_CATEGORY;
}

function addFriendAsPartner(f) {
  const p = { mode: 'simple', tee: null, round: Array(HOLES || 18).fill(null) };
  applyFriend(p, f);
  players.push(p);
}

function buildPlayerLobby() {
  const wrap = document.getElementById('playersLobby');
  wrap.innerHTML = '<div class="lobby-label">Playing Partners (optional)</div>';
  buildPartnerRows(wrap, buildPlayerLobby);
}

// Partner rows with add/remove, used by the lobby and the settings overlay
function buildPartnerRows(wrap, rebuild) {
  const cats    = categoriesFor();
  const colors = teeColorsFor();
  const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
  getSimplePlayers().forEach((p, i) => {
    // A saved friend plays off their own tee for this course
    const friend = friendFor(p);
    if (friend) {
      const t = friend.tees[selectedCourse];
      p.tee = colors.includes(t) ? t : null;
    } else if (p.tee && !colors.includes(p.tee)) {
      p.tee = null; // tee from another course or hole count
    }
    if (!p.category) p.category = DEFAULT_CATEGORY;
    const teeField = colors.length < 2 ? '' : `
      <select class="lobby-custom-input" style="flex:1;padding:10px 30px 10px 10px" data-pidx="${i}" data-field="tee">
        <option value=""${p.tee ? '' : ' selected'}>Tee: ${selectedTee || 'default'}</option>
        ${colors.map(c => `<option value="${c}"${p.tee === c ? ' selected' : ''}>${c}</option>`).join('')}
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
        <input class="lobby-custom-input" style="flex:2;padding:10px" value="${escHtml(p.name)}" placeholder="Name" data-pidx="${i}" data-field="name">
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
      // Names are saved once typed out, see below
      if (inp.dataset.field !== 'name') rememberFriend(p);
      saveState();
    });
  });

  // A finished name either loads a saved friend or saves a new one
  wrap.querySelectorAll('[data-field="name"]').forEach(inp => {
    inp.addEventListener('change', () => {
      const p = getSimplePlayers()[inp.dataset.pidx];
      const f = friendFor(p);
      if (f) {
        applyFriend(p, f);
        saveState();
        rebuild();
      } else {
        rememberFriend(p);
      }
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

// ── FRIENDS SCREEN ──
// Preset courses that offer a choice of tee, with every color listed for them
function friendCourses() {
  return PRESET_COURSES.filter(name => name !== 'Others').map(name => {
    const entries = Object.values(COURSES).filter(c => courseBaseName(c) === name && c.tees);
    const colors = new Set();
    entries.forEach(c => {
      const own = [...new Set(c.tees.map(t => t.color))];
      if (own.length > 1) own.forEach(x => colors.add(x));
    });
    const defaultTee = (entries.find(c => c.defaultTee) || {}).defaultTee;
    return { name, colors: [...colors], defaultTee };
  }).filter(c => c.colors.length > 1);
}

function friendCategories() {
  const cats = new Set();
  Object.values(COURSES).forEach(c => (c.tees || []).forEach(t => t.players && cats.add(t.players)));
  return cats.size ? [...cats] : [DEFAULT_CATEGORY];
}

function renderFriends(focusIdx) {
  const scroll = document.getElementById('friendsScroll');
  const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
  const courses = friendCourses();
  const cats = friendCategories();
  // Alphabetical, so a friend still being added (no name yet) sits at the top
  const order = friends.map((f, i) => i)
    .sort((a, b) => friends[a].name.localeCompare(friends[b].name, undefined, { sensitivity: 'base' }));

  scroll.innerHTML = !friends.length
    ? `<div class="settings-putter-note"><span>👥</span> No friends yet. Partners you name in a round are saved here automatically.</div>`
    : order.map(i => {
      const f = friends[i];
      const tees = courses.map(c => `
        <span class="friend-lbl">${escHtml(c.name)}</span>
        <select class="lobby-custom-input" data-fidx="${i}" data-ffield="tee" data-course="${escHtml(c.name)}">
          <option value="">Default${c.defaultTee ? ` (${c.defaultTee})` : ''}</option>
          ${c.colors.map(x => `<option value="${x}"${f.tees[c.name] === x ? ' selected' : ''}>${x}</option>`).join('')}
        </select>`).join('');
      return `<div class="friend-card">
        <div style="display:flex;gap:8px;align-items:center">
          <input class="lobby-custom-input" style="flex:2;padding:10px" value="${escHtml(f.name)}" placeholder="Name" data-fidx="${i}" data-ffield="name">
          <input class="lobby-custom-input" style="flex:1;padding:10px" type="number" value="${f.hcp}" placeholder="HCP" data-fidx="${i}" data-ffield="hcp">
          <button class="pill-x" style="font-size:18px" data-fdel="${i}">✕</button>
        </div>
        <div class="friend-grid">
          <span class="friend-lbl">Rated as</span>
          <select class="lobby-custom-input" data-fidx="${i}" data-ffield="category">
            ${cats.map(c => `<option value="${c}"${f.category === c ? ' selected' : ''}>${cap(c)}</option>`).join('')}
          </select>
          ${tees}
        </div>
      </div>`;
    }).join('');

  if (focusIdx !== undefined) {
    const inp = scroll.querySelector(`[data-fidx="${focusIdx}"][data-ffield="name"]`);
    if (inp) inp.focus();
  }
}

// Partners in the current round follow their friend's details
function syncFriendToPartners(f, oldName) {
  getSimplePlayers().filter(p => sameName(p.name, oldName ?? f.name)).forEach(p => applyFriend(p, f));
  saveState();
}

function handleFriendEdit(e) {
  const el = e.target;
  if (!el.dataset || !el.dataset.ffield) return;
  const f = friends[+el.dataset.fidx];
  const field = el.dataset.ffield;
  if (field === 'name') {
    if (e.type !== 'change') return;
    const name = el.value.trim();
    const taken = friends.some(x => x !== f && sameName(x.name, name));
    if (!name || isPlaceholderName(name) || taken) {
      el.value = f.name;
      if (taken) alert(`${name} is already a friend.`);
      return;
    }
    const oldName = f.name;
    f.name = name;
    if (oldName) syncFriendToPartners(f, oldName);
  }
  if (field === 'hcp')      f.hcp = Math.min(54, Math.max(0, parseInt(el.value) || 0));
  if (field === 'category') f.category = el.value;
  if (field === 'tee') {
    if (el.value) f.tees[el.dataset.course] = el.value;
    else delete f.tees[el.dataset.course];
  }
  if (field === 'hcp' || field === 'category') syncFriendToPartners(f);
  saveFriends();
}

function closeFriends() {
  // Drop a friend that was added but never named
  friends = friends.filter(f => !isPlaceholderName(f.name));
  saveFriends();
  hideOverlay('friendsOverlay');
  buildSettingsUI();
}

document.getElementById('friendsScroll').addEventListener('input', handleFriendEdit);
document.getElementById('friendsScroll').addEventListener('change', handleFriendEdit);
document.getElementById('friendsScroll').addEventListener('click', e => {
  const del = e.target.closest('[data-fdel]');
  if (!del) return;
  const f = friends[+del.dataset.fdel];
  if (f.name && !confirm(`Delete ${f.name} from your friends?`)) return;
  friends.splice(+del.dataset.fdel, 1);
  saveFriends();
  renderFriends();
});
document.getElementById('friendsAddBtn').addEventListener('click', () => {
  friends.push({ name: '', hcp: 36, category: DEFAULT_CATEGORY, tees: {} });
  renderFriends(friends.length - 1);
});
document.getElementById('friendsClose').addEventListener('click', closeFriends);
