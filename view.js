// Read-only view of a round shared from the app. Refreshes while the page is open.
// Everything in the round comes from the database, so it is escaped before display.
const REFRESH_MS = 30000;
const PLAYER_COLORS = ['#c9a84c', '#5fb0c9', '#e0973c', '#8fbf5f', '#d1637a', '#8a7fd6'];

let code = normaliseCode(new URLSearchParams(location.search).get('code') || '');
let round = null, updatedAt = null, playerIdx = 0, refreshTimer = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const sum = arr => arr.reduce((n, x) => n + x, 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function setStatus(text) {
  document.getElementById('viewStatus').textContent = text;
}

function ago(date) {
  const s = Math.round((Date.now() - date) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Cleans one player from the stored round into plain numbers and strings
function readPlayer(p) {
  const holes = (Array.isArray(p.holes) ? p.holes : []).map((h, i) => {
    const shots = Array.isArray(h.shots) ? h.shots.map(String) : null;
    return {
      i, shots,
      par: num(h.par),
      gross: num(h.gross) || 0,
      pts: num(h.pts),
      putts: shots ? shots.filter(c => c === 'Putter').length : 0
    };
  });
  const played = holes.filter(h => h.gross);
  const scored = holes.filter(h => h.pts !== null);
  return {
    name: String(p.name ?? 'Player'), hcp: num(p.hcp), ph: num(p.ph), holes, played,
    total: sum(played.map(h => h.gross)),
    sf: scored.length ? sum(scored.map(h => h.pts)) : null,
    putts: sum(holes.map(h => h.putts))
  };
}

async function load() {
  clearTimeout(refreshTimer);
  if (!shareEnabled()) { setStatus('Live sharing is not set up yet.'); return; }
  if (!code) { setStatus('Enter the code shown in the round summary on the phone.'); return; }
  if (!round) setStatus('Loading…');
  try {
    const res = await supabaseRpc('get_round', { p_code: code });
    if (!res || !res.data) {
      round = null;
      render();
      setStatus(`No round found for ${formatCode(code)}. Codes stop working 30 days after the last update.`);
      return;
    }
    round = res.data;
    updatedAt = new Date(res.updated_at);
    setStatus('');
    render();
  } catch (e) {
    setStatus("Couldn't load the round. Retrying…");
  }
  refreshTimer = setTimeout(load, REFRESH_MS);
}

function tileClass(h) {
  if (!h.gross) return 'empty';
  if (h.par === null) return 'nopar';
  const d = h.gross - h.par;
  return d < 0 ? 'under' : d === 0 ? 'even' : d === 1 ? 'over1' : 'over2';
}

function render() {
  const out = document.getElementById('viewRound');
  if (!round) { out.innerHTML = ''; return; }
  const players = (Array.isArray(round.players) ? round.players : []).map(readPlayer);
  if (!players.length) { out.innerHTML = ''; return; }
  if (playerIdx >= players.length) playerIdx = 0;
  const p = players[playerIdx];
  const holeCount = Math.max(...players.map(x => x.holes.length));
  const current = num(round.hole);

  const tabs = players.length < 2 ? '' : `<div class="ov-player-switch">${players.map((x, i) =>
    `<div class="player-tab${i === playerIdx ? ' sel' : ''}" data-player="${i}" style="--player-color:${PLAYER_COLORS[i % PLAYER_COLORS.length]}">
      <span class="player-tab-dot"></span>${esc(x.name)}</div>`).join('')}</div>`;

  const grid = p.holes.map(h => `<div class="hole-tile ${tileClass(h)}" data-hole="${h.i}">
      <div class="ht-num">${h.i + 1}</div>
      <div class="ht-gross">${h.gross || '–'}</div>
      <div class="ht-sub">${h.pts !== null ? plural(h.pts, 'pt') : h.par !== null ? 'Par ' + h.par : ''}</div>
    </div>`).join('');

  const stat = (val, lbl) => `<div class="stat-box view-stat"><div class="stat-val">${val}</div><div class="stat-lbl">${lbl}</div></div>`;
  const stats = stat(p.total, 'Gross Shots')
    + stat(p.sf ?? '—', 'Stableford')
    + stat(`${p.played.length}/${p.holes.length}`, 'Holes Logged')
    + (p.putts ? stat(p.putts, 'Putts') : '')
    + (p.ph !== null ? stat(p.ph, 'Playing HCP') : '');

  // Scorecard: shots and points for everyone
  const head = `<tr><th>Hole</th><th>Par</th>${players.map(x =>
    `<th>${esc(x.name)}</th><th class="pts">Pts</th>`).join('')}</tr>`;
  const rows = Array.from({ length: holeCount }, (_, i) => {
    const par = players[0].holes[i] ? players[0].holes[i].par : null;
    return `<tr${current === i + 1 ? ' class="now"' : ''}><td>${i + 1}</td><td>${par ?? ''}</td>${players.map(x => {
      const h = x.holes[i];
      return `<td>${h && h.gross ? h.gross : ''}</td><td class="pts">${h && h.pts !== null ? h.pts : ''}</td>`;
    }).join('')}</tr>`;
  }).join('');
  const parTotal = sum(players[0].holes.filter(h => h.par !== null).map(h => h.par));
  const totals = `<tr class="total"><td>Total</td><td>${parTotal || ''}</td>${players.map(x =>
    `<td>${x.total || ''}</td><td class="pts">${x.sf ?? ''}</td>`).join('')}</tr>`;

  const log = p.holes.map(h => {
    const pills = !h.gross
      ? '<span class="sum-none">No shots</span>'
      : h.shots && h.shots.some(c => !['Putter', 'Penalty', 'Shot'].includes(c))
        ? h.shots.map((c, j) => `<span class="sum-pill">#${j + 1} ${esc(c)}</span>`).join('')
        : `<span class="sum-pill">${plural(h.gross, 'shot')}</span>` + (h.putts ? `<span class="sum-pill">${plural(h.putts, 'putt')}</span>` : '');
    return `<div class="sum-row" id="hole-${h.i}">
      <div class="sum-left"><div class="sum-hnum">${h.i + 1}</div><div class="sum-shots-count">${h.gross ? h.gross + 'sh' : ''}</div></div>
      <div class="sum-pills">${pills}</div>
      <div class="sum-sf"><div class="sum-sf-pts">${h.pts ?? '—'}</div><div class="sum-sf-lbl">${h.par !== null ? 'Par ' + h.par : ''}</div></div>
    </div>`;
  }).join('');

  out.innerHTML = `
    <div class="view-head">
      <div class="ov-title">${esc(round.course || 'Round')}</div>
      <div class="view-meta"><span class="view-live"></span>${formatCode(code)} · ${holeCount} holes${current ? ` · on hole ${current}` : ''} · updated ${ago(updatedAt)}</div>
    </div>
    ${tabs}
    <div class="sum-section">
      <div class="sum-sec-head"><span class="lobby-label">⛳ ${esc(p.name)}${p.hcp !== null ? ` · HCP ${p.hcp}` : ''}</span><span class="sum-sec-hint">tap a hole for clubs</span></div>
      <div class="hole-grid">${grid}</div>
    </div>
    <div class="sum-section"><div class="ov-stats">${stats}</div></div>
    <div class="sum-section">
      <div class="sum-sec-head"><span class="lobby-label">📋 Scorecard</span></div>
      <div class="view-table-wrap"><table class="view-table">${head}${rows}${totals}</table></div>
    </div>
    <div class="sum-section">
      <div class="sum-sec-head"><span class="lobby-label">🏌️ Hole by Hole · ${esc(p.name)}</span></div>
      ${log}
    </div>`;
}

document.getElementById('viewRound').addEventListener('click', e => {
  const tab = e.target.closest('[data-player]');
  if (tab) { playerIdx = +tab.dataset.player; render(); return; }
  const tile = e.target.closest('[data-hole]');
  if (tile) {
    const row = document.getElementById('hole-' + tile.dataset.hole);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

document.getElementById('codeForm').addEventListener('submit', e => {
  e.preventDefault();
  const next = normaliseCode(document.getElementById('codeInput').value);
  if (next.length !== 6) { setStatus('A code has 6 characters, e.g. GX7-42K.'); return; }
  code = next;
  round = null;
  playerIdx = 0;
  history.replaceState(null, '', `?code=${formatCode(code)}`);
  load();
});

if (code) document.getElementById('codeInput').value = formatCode(code);
load();
