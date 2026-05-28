import type { PlaneSpawnPayload } from '../main/types';

const lanesEl = document.getElementById('lanes')!;
const planes: HTMLElement[] = [];

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]!));
}

function spawnPlane(p: PlaneSpawnPayload): void {
  const el = document.createElement('div');
  el.className = 'plane';
  el.style.top = `calc(var(--lane-top) + ${p.lane} * var(--lane-spacing))`;
  el.style.setProperty('--color', p.color);

  const glyph = document.createElement('span');
  glyph.className = 'glyph';
  glyph.textContent = '✈️';

  const banner = document.createElement('span');
  banner.className = 'banner';
  banner.innerHTML = `${formatTime(p.startMs)} — ${escapeHtml(p.title)}<span class="acct">${escapeHtml(p.accountEmail)}</span>`;

  const close = document.createElement('span');
  close.className = 'close';
  close.textContent = '×';
  close.setAttribute('role', 'button');
  close.setAttribute('aria-label', 'Dismiss');

  el.append(glyph, banner, close);

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    clearTimeout(safetyTimer);
    el.remove();
    const idx = planes.indexOf(el);
    if (idx >= 0) planes.splice(idx, 1);
    window.overlay.releaseLane(p.lane);
  };

  const openEvent = () => {
    if (p.htmlLink) window.overlay.openExternal(p.htmlLink);
    remove();
  };

  glyph.addEventListener('click', (e) => { e.stopPropagation(); openEvent(); });
  banner.addEventListener('click', (e) => { e.stopPropagation(); openEvent(); });
  close.addEventListener('click', (e) => { e.stopPropagation(); remove(); });

  el.addEventListener('animationend', remove);

  // Safety: even if the CSS animation never fires animationend (paused tab,
  // weird repaint), force-remove after dismissMs.
  const safetyTimer = setTimeout(remove, p.dismissMs);

  lanesEl.appendChild(el);
  planes.push(el);
}

// Hit-testing: capture mouse only when over a plane.
let captured = false;
window.addEventListener('mousemove', (e) => {
  const overPlane = planes.some((el) => {
    const r = el.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  });
  if (overPlane !== captured) {
    captured = overPlane;
    window.overlay.setMouseCapture(captured);
  }
});

window.overlay.onPlaneSpawn(spawnPlane);
