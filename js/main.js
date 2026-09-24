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
