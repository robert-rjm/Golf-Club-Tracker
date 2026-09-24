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

  const friendsGroup = document.createElement('div');
  friendsGroup.className = 'settings-group';
  friendsGroup.innerHTML = `<div class="settings-group-title">Friends</div>
    <button class="lobby-opt friends-open">👥 Saved friends (${friends.length}) ›</button>`;
  friendsGroup.querySelector('button').addEventListener('click', () => {
    renderFriends();
    showOverlay('friendsOverlay');
  });
  scroll.appendChild(friendsGroup);

  if (shareEnabled()) {
    // Your own round stays saved on the phone while you watch another
    const liveGroup = document.createElement('div');
    liveGroup.className = 'settings-group';
    liveGroup.innerHTML = `<div class="settings-group-title">Live</div>
      <a class="follow-btn" href="view.html?app=1">📡 Follow another round</a>`;
    scroll.appendChild(liveGroup);
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
