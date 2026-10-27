// ---------- boot ----------
function boot() {
  loadSave();
  R.q = SV.settings.quality || 'high';
  initRender(); try { initGL(); } catch (e) { GL.ok = false; } try { initCarGL(); } catch (e) { CGL.ok = false; } UI.init(); bindTouch(); TILT.init();
  document.getElementById('rot-go').addEventListener('click', () => playSideways());
  document.getElementById('rot-flip').addEventListener('click', () => playSideways((TILT.gx || 0) > .3 ? 90 : 270));
  document.body.classList.toggle('no-tilt', !SV.settings.tilt);
  AUD.on = SV.settings.sound !== false; AUD.vol = SV.settings.vol || .7;
  document.getElementById('h-pause').addEventListener('click', () => togglePause());
  document.addEventListener('visibilitychange', () => { if (document.hidden && RACE && (RACE.st === 'run' || RACE.st === 'countdown')) togglePause(); });
  window.claude?.hot?.snapshot?.(() => ({ save: true }));
  UI.title();
  requestAnimationFrame(frame);
}
window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot();
