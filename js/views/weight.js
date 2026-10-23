import { state } from '../store.js';
import { movingAverage, weightTrend } from '../calc.js';
import { esc, fmtInput, today, addDays, parseNum, fmtNum, fmtSigned, fmtDate, daysBetween } from '../util.js';
import { lineChart } from '../chart.js';
import { toast } from '../app.js';

let range = 90;

export function render() {
  const sorted = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
  const end = today();
  const from = range ? addDays(end, -(range - 1)) : '0000';
  const avg = movingAverage(sorted, 7);
  const visible = sorted.filter((w) => w.date >= from);
  const visibleAvg = avg.filter((w) => w.date >= from);

  const last = sorted[sorted.length - 1];
  const lastAvg = avg[avg.length - 1];
  const trend = weightTrend(sorted, end, 21);
  const avgAt = (daysAgo) => {
    const target = addDays(lastAvg?.date || end, -daysAgo);
    const cands = avg.filter((a) => a.date <= target);
    return cands[cands.length - 1];
  };
  const a7 = avgAt(7);
  const a30 = avgAt(30);
  const todayEntry = state.weights.find((w) => w.date === end);

  const ranges = [[30, '30 T'], [90, '90 T'], [365, '1 J'], [0, 'Alles']]
    .map(([r, l]) => `<button class="chip ${range === r ? 'on' : ''}" data-action="weightRange" data-range="${r}">${l}</button>`)
    .join('');

  return `<form class="card" data-form="addWeight">
      <h3>Wiegen</h3>
      <p class="small muted">Am besten morgens nach dem Klo, vor dem Essen – immer gleich. Einzelwerte schwanken um 1–2 kg, entscheidend ist der Trend.</p>
      <div class="grid2">
        <label class="field"><span>Gewicht (kg)</span><input id="weight-kg" name="kg" inputmode="decimal" required placeholder="${last ? fmtNum(last.kg, 1) : 'z. B. 82,4'}" value="${todayEntry ? esc(fmtInput(todayEntry.kg)) : ''}"></label>
        <label class="field"><span>Datum</span><input id="weight-date" name="date" type="date" value="${end}" max="${end}"></label>
      </div>
      <button class="btn primary block">${todayEntry ? 'Aktualisieren' : 'Speichern'}</button>
    </form>

    <div class="stats">
      <div class="stat"><span class="stat-value">${last ? fmtNum(last.kg, 1) : '–'}</span><span class="stat-label">zuletzt (kg)</span></div>
      <div class="stat"><span class="stat-value">${lastAvg ? fmtNum(lastAvg.kg, 1) : '–'}</span><span class="stat-label">Ø 7 Tage</span></div>
      <div class="stat"><span class="stat-value">${trend && trend.count >= 4 ? fmtSigned(trend.kgPerWeek, 2) : '–'}</span><span class="stat-label">kg/Woche (Trend 3 W.)</span></div>
    </div>
    <div class="stats">
      <div class="stat"><span class="stat-value">${a7 && lastAvg ? fmtSigned(lastAvg.kg - a7.kg, 1) : '–'}</span><span class="stat-label">vs. vor 7 Tagen</span></div>
      <div class="stat"><span class="stat-value">${a30 && lastAvg ? fmtSigned(lastAvg.kg - a30.kg, 1) : '–'}</span><span class="stat-label">vs. vor 30 Tagen</span></div>
    </div>

    <section class="card">
      <div class="chips">${ranges}</div>
      ${lineChart(
        [
          { points: visible.map((w) => ({ date: w.date, y: w.kg })), cls: 'line-soft', dots: true },
          { points: visibleAvg.map((w) => ({ date: w.date, y: w.kg })), cls: 'line-main' },
        ],
        { unit: 'kg', emptyText: 'Ab zwei Einträgen siehst du hier deinen Verlauf' }
      )}
      <p class="legend"><span class="key soft"></span>Messwerte <span class="key main"></span>Ø 7 Tage</p>
    </section>

    <div class="list">
      ${[...sorted]
        .reverse()
        .slice(0, 60)
        .map((w, i, arr) => {
          const prev = arr[i + 1];
          const diff = prev ? w.kg - prev.kg : null;
          const gap = prev ? daysBetween(prev.date, w.date) : 0;
          return `<div class="list-item">
            <div><strong>${fmtNum(w.kg, 1)} kg</strong><span class="small muted">${fmtDate(w.date, { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' })}</span></div>
            <div class="row"><span class="small muted">${diff !== null ? `${fmtSigned(diff, 1)}${gap > 1 ? ` (${gap} T)` : ''}` : ''}</span>
            <button class="icon-btn danger" data-action="deleteWeight" data-date="${w.date}" aria-label="Löschen">✕</button></div>
          </div>`;
        })
        .join('')}
    </div>`;
}

export const actions = {
  addWeight(form) {
    const fd = new FormData(form);
    const kg = parseNum(fd.get('kg'));
    const date = fd.get('date') || today();
    if (!kg || kg < 25 || kg > 350) {
      alert('Bitte ein gültiges Gewicht in kg eintragen.');
      return false;
    }
    const existing = state.weights.find((w) => w.date === date);
    if (existing) existing.kg = kg;
    else state.weights.push({ date, kg });
    toast(`${fmtNum(kg, 1)} kg gespeichert`);
  },
  deleteWeight(el) {
    if (!confirm('Eintrag löschen?')) return false;
    state.weights = state.weights.filter((w) => w.date !== el.dataset.date);
  },
  weightRange(el) {
    range = Number(el.dataset.range);
  },
};
