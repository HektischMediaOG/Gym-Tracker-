// Minimales SVG-Liniendiagramm, damit die App ohne externe Bibliotheken offline läuft.
import { daysBetween, fmtDate, fmtNum, esc } from './util.js';

// series: [{ points: [{date, y}], cls: 'line-main' | 'line-soft', dots: bool }]
export function lineChart(series, { height = 180, unit = '', digits = 1, emptyText = 'Noch keine Daten' } = {}) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return `<div class="chart-empty">${esc(emptyText)}</div>`;

  const W = 340;
  const H = height;
  const padL = 36, padR = 8, padT = 10, padB = 22;
  const dates = all.map((p) => p.date).sort();
  const d0 = dates[0];
  const d1 = dates[dates.length - 1];
  const span = Math.max(1, daysBetween(d0, d1));
  let yMin = Math.min(...all.map((p) => p.y));
  let yMax = Math.max(...all.map((p) => p.y));
  if (yMax - yMin < 1) { yMin -= 0.5; yMax += 0.5; }
  const pad = (yMax - yMin) * 0.08;
  yMin -= pad; yMax += pad;

  const x = (date) => padL + (daysBetween(d0, date) / span) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);

  const ticks = [yMin + pad, (yMin + yMax) / 2, yMax - pad];
  const grid = ticks
    .map((t) => `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/>
      <text class="axis" x="${padL - 4}" y="${y(t) + 3}" text-anchor="end">${fmtNum(t, digits)}</text>`)
    .join('');

  const lines = series
    .map((s) => {
      const pts = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
      const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
      const dots = s.dots
        ? pts.map((p) => `<circle class="${s.cls}-dot" cx="${x(p.date).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="2.6"><title>${fmtDate(p.date)}: ${fmtNum(p.y, digits)} ${esc(unit)}</title></circle>`).join('')
        : '';
      return `<path class="${s.cls}" d="${path}"/>${dots}`;
    })
    .join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">
    ${grid}${lines}
    <text class="axis" x="${padL}" y="${H - 6}">${fmtDate(d0, { day: '2-digit', month: '2-digit' })}</text>
    <text class="axis" x="${W - padR}" y="${H - 6}" text-anchor="end">${fmtDate(d1, { day: '2-digit', month: '2-digit' })}</text>
  </svg>`;
}

export function bar(value, target, cls = '') {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = target > 0 && value > target * 1.05;
  return `<div class="bar ${cls} ${over ? 'over' : ''}"><span style="width:${pct.toFixed(1)}%"></span></div>`;
}
