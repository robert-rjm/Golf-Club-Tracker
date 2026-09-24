// Round summary, detail sheets, copy to clipboard and New Round.

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
