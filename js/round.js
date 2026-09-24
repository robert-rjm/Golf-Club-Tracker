// The hole screen: strip, club buttons, score-only pad, partner scores, undo.

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

// ── TRACKING SHEET ──
// Clubs vs score-only, asked at the first tee.
// Mode buttons are shared with the settings overlay.
function trackOptionButtons(afterPick) {
  return [
    { label: '<img class="logo-icon" src="Logo.png" alt="">Clubs & Shots', val: true,  sub: 'A club for every shot' },
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
