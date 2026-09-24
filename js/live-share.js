// ── LIVE SHARE ──
// While a code is active, every save is pushed to Supabase (see share.js, supabase.sql)
let shareTimer = null;
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
