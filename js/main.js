// Loaded last, once every other file has run.

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

// Offline support (sw.js). Fails quietly from file://, where service workers can't run.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
