import { state } from '../store.js';
import { movingAverage, weightTrend } from '../calc.js';
import { esc, fmtInput, today, addDays, parseNum, fmtNum, fmtSigned, fmtDate, daysBetween } from '../util.js';
import { lineChart } from '../chart.js';
import { toast } from '../app.js';
import { L } from '../i18n.js';

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

  const ranges = [[30, L('30 T', '30 d')], [90, L('90 T', '90 d')], [365, L('1 J', '1 y')], [0, L('Alles', 'All')]]
    .map(([r, l]) => `<button class="chip ${range === r ? 'on' : ''}" data-action="weightRange" data-range="${r}">${l}</button>`)
    .join('');

  return `<form class="card" data-form="addWeight">
      <h3>${L('Wiegen', 'Weigh-in')}</h3>
      <p class="small muted">${L('Am besten morgens nach dem Klo, vor dem Essen – immer gleich. Einzelwerte schwanken um 1–2 kg, entscheidend ist der Trend.', 'Best in the morning after the bathroom, before eating – always the same way. Single readings swing by 1–2 kg; the trend is what counts.')}</p>
      <div class="grid2">
        <label class="field"><span>${L('Gewicht (kg)', 'Weight (kg)')}</span><input id="weight-kg" name="kg" inputmode="decimal" required placeholder="${last ? fmtNum(last.kg, 1) : L('z. B. 82,4', 'e.g. 82.4')}" value="${todayEntry ? esc(fmtInput(todayEntry.kg)) : ''}"></label>
        <label class="field"><span>${L('Datum', 'Date')}</span><input id="weight-date" name="date" type="date" value="${end}" max="${end}"></label>
      </div>
      <button class="btn primary block">${todayEntry ? L('Aktualisieren', 'Update') : L('Speichern', 'Save')}</button>
    </form>

    <div class="stats">
      <div class="stat"><span class="stat-value">${last ? fmtNum(last.kg, 1) : '–'}</span><span class="stat-label">${L('zuletzt (kg)', 'latest (kg)')}</span></div>
      <div class="stat"><span class="stat-value">${lastAvg ? fmtNum(lastAvg.kg, 1) : '–'}</span><span class="stat-label">${L('Ø 7 Tage', '7-day avg')}</span></div>
      <div class="stat"><span class="stat-value">${trend && trend.count >= 4 ? fmtSigned(trend.kgPerWeek, 2) : '–'}</span><span class="stat-label">${L('kg/Woche (Trend 3 W.)', 'kg/week (3-wk trend)')}</span></div>
    </div>
    <div class="stats">
      <div class="stat"><span class="stat-value">${a7 && lastAvg ? fmtSigned(lastAvg.kg - a7.kg, 1) : '–'}</span><span class="stat-label">${L('vs. vor 7 Tagen', 'vs. 7 days ago')}</span></div>
      <div class="stat"><span class="stat-value">${a30 && lastAvg ? fmtSigned(lastAvg.kg - a30.kg, 1) : '–'}</span><span class="stat-label">${L('vs. vor 30 Tagen', 'vs. 30 days ago')}</span></div>
    </div>

    <section class="card">
      <div class="chips">${ranges}</div>
      ${lineChart(
        [
          { points: visible.map((w) => ({ date: w.date, y: w.kg })), cls: 'line-soft', dots: true },
          { points: visibleAvg.map((w) => ({ date: w.date, y: w.kg })), cls: 'line-main' },
        ],
        { unit: 'kg', emptyText: L('Ab zwei Einträgen siehst du hier deinen Verlauf', 'Your trend appears here after two entries') }
      )}
      <p class="legend"><span class="key soft"></span>${L('Messwerte', 'Readings')} <span class="key main"></span>${L('Ø 7 Tage', '7-day avg')}</p>
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
            <div class="row"><span class="small muted">${diff !== null ? `${fmtSigned(diff, 1)}${gap > 1 ? ` (${gap} ${L('T', 'd')})` : ''}` : ''}</span>
            <button class="icon-btn danger" data-action="deleteWeight" data-date="${w.date}" aria-label="${L('Löschen', 'Delete')}">✕</button></div>
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
      alert(L('Bitte ein gültiges Gewicht in kg eintragen.', 'Please enter a valid weight in kg.'));
      return false;
    }
    const existing = state.weights.find((w) => w.date === date);
    if (existing) existing.kg = kg;
    else state.weights.push({ date, kg });
    toast(L(`${fmtNum(kg, 1)} kg gespeichert`, `${fmtNum(kg, 1)} kg saved`));
  },
  deleteWeight(el) {
    if (!confirm(L('Eintrag löschen?', 'Delete entry?'))) return false;
    state.weights = state.weights.filter((w) => w.date !== el.dataset.date);
  },
  weightRange(el) {
    range = Number(el.dataset.range);
  },
};
