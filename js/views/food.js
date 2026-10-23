import { state, foodsOn, totalsFor, currentWeightKg } from '../store.js';
import { computeTargets } from '../calc.js';
import { esc, uid, today, addDays, parseNum, fmtNum, fmtDate, fmtDateRelative, round, normName } from '../util.js';
import { bar } from '../chart.js';
import { navigate, toast } from '../app.js';
import { L } from '../i18n.js';

const meals = () => [
  ['breakfast', L('Frühstück', 'Breakfast')],
  ['lunch', L('Mittagessen', 'Lunch')],
  ['dinner', L('Abendessen', 'Dinner')],
  ['snack', L('Snacks', 'Snacks')],
];

function defaultMeal() {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

export function currentTargets() {
  const w = currentWeightKg();
  if (!w) return null;
  return computeTargets(state.profile, state.goal, w);
}

let selectedDate = null;

export function render(dateParam) {
  const date = dateParam || selectedDate || today();
  selectedDate = date;
  const t = totalsFor(date);
  const target = currentTargets();
  const entries = foodsOn(date);
  const incomplete = state.incompleteDays.includes(date);

  const macro = (label, val, tgt, unit, cls) => `<div class="macro">
      <div class="macro-head"><span>${label}</span><span><strong>${fmtNum(val, 0)}</strong>${tgt ? ` / ${fmtNum(tgt, 0)}` : ''} ${unit}</span></div>
      ${tgt ? bar(val, tgt, cls) : ''}
    </div>`;

  const remaining = target ? target.kcal - t.kcal : null;
  const summary = `<section class="card">
    <div class="kcal-big">
      <div><span class="big">${fmtNum(t.kcal, 0)}</span><span class="muted"> ${L('kcal gegessen', 'kcal eaten')}</span></div>
      ${target ? `<div class="right"><span class="big ${remaining < 0 ? 'neg' : ''}">${fmtNum(Math.abs(remaining), 0)}</span><span class="muted"> ${remaining < 0 ? L('drüber', 'over') : L('übrig', 'left')}</span></div>` : ''}
    </div>
    ${target ? bar(t.kcal, target.kcal, 'kcal') : `<p class="small muted">${L('Trag unter <a href="#/goals">Ziele</a> dein Profil ein, dann siehst du hier dein Tagesziel.', 'Fill in your profile under <a href="#/goals">Goals</a> to see your daily target here.')}</p>`}
    ${macro('Protein', t.protein, target?.protein, 'g', 'p')}
    ${macro(L('Kohlenhydrate', 'Carbs'), t.carbs, target?.carbs, 'g', 'c')}
    ${macro(L('Fett', 'Fat'), t.fat, target?.fat, 'g', 'f')}
  </section>`;

  const groups = meals().map(([key, label]) => {
    const items = entries.filter((e) => e.meal === key);
    if (!items.length) return '';
    const kcal = items.reduce((s, e) => s + (e.kcal || 0), 0);
    return `<section class="card">
      <div class="card-head"><h3>${label}</h3><span class="muted small">${fmtNum(kcal, 0)} kcal</span></div>
      ${items
        .map(
          (e) => `<div class="food-item">
            <div><strong>${esc(e.name)}</strong><span class="small muted">${e.amount ? `${fmtNum(e.amount, 0)} g · ` : ''}P ${fmtNum(e.protein, 0)} · ${L('K', 'C')} ${fmtNum(e.carbs, 0)} · F ${fmtNum(e.fat, 0)}</span></div>
            <div class="row"><span>${fmtNum(e.kcal, 0)}</span><button class="icon-btn danger" data-action="deleteFood" data-id="${e.id}" aria-label="${L('Löschen', 'Delete')}">✕</button></div>
          </div>`
        )
        .join('')}
    </section>`;
  }).join('');

  const lib = [...state.foodLibrary].sort((a, b) => (b.usedAt || '').localeCompare(a.usedAt || '')).slice(0, 18);
  const meal = defaultMeal();

  const form = `<form class="card" data-form="addFood" id="food-form">
    <h3>${L('Eintrag hinzufügen', 'Add entry')}</h3>
    ${lib.length ? `<p class="label">${L('Gespeicherte Lebensmittel (antippen, dann Menge eintragen)', 'Saved foods (tap, then enter amount)')}</p>
      <div class="chips scroll">${lib.map((f) => `<button type="button" class="chip" data-action="pickFood" data-id="${f.id}">${esc(f.name)}</button>`).join('')}</div>` : ''}
    <label class="field"><span>${L('Was?', 'What?')}</span><input id="food-name" name="name" type="text" required autocomplete="off" placeholder="${L('z. B. Skyr, Hähnchen mit Reis', 'e.g. skyr, chicken with rice')}"></label>
    <div class="grid2">
      <label class="field"><span>${L('Mahlzeit', 'Meal')}</span><select id="food-meal" name="meal">${meals().map(([k, l]) => `<option value="${k}" ${k === meal ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>${L('Menge (g)', 'Amount (g)')}</span><input id="food-amount" name="amount" inputmode="decimal" placeholder="optional"></label>
    </div>
    <label class="field"><span>${L('Nährwerte gelten für', 'Nutrition values are for')}</span>
      <select id="food-basis" name="basis">
        <option value="portion">${L('die eingetragene Portion', 'the portion entered')}</option>
        <option value="100">${L('100 g (wird auf die Menge umgerechnet)', '100 g (scaled to the amount)')}</option>
      </select>
    </label>
    <div class="grid4">
      <label class="field"><span>kcal</span><input id="food-kcal" name="kcal" inputmode="decimal" required></label>
      <label class="field"><span>Protein</span><input id="food-protein" name="protein" inputmode="decimal" placeholder="g"></label>
      <label class="field"><span>${L('KH', 'Carbs')}</span><input id="food-carbs" name="carbs" inputmode="decimal" placeholder="g"></label>
      <label class="field"><span>${L('Fett', 'Fat')}</span><input id="food-fat" name="fat" inputmode="decimal" placeholder="g"></label>
    </div>
    <label class="check-label"><input type="checkbox" name="saveLib" id="food-save"> ${L('Als Lebensmittel speichern (für schnelles Eintragen)', 'Save as food (for quick entry)')}</label>
    <button class="btn primary block">${L('Hinzufügen', 'Add')}</button>
  </form>`;

  return `<div class="date-nav">
      <button class="icon-btn" data-action="foodDate" data-date="${addDays(date, -1)}" aria-label="${L('Vorheriger Tag', 'Previous day')}">‹</button>
      <strong>${fmtDateRelative(date)}</strong><span class="muted small">${fmtDate(date, { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
      <button class="icon-btn" data-action="foodDate" data-date="${addDays(date, 1)}" ${date >= today() ? 'disabled' : ''} aria-label="${L('Nächster Tag', 'Next day')}">›</button>
    </div>
    ${summary}
    ${groups || `<p class="muted center">${L('Noch nichts eingetragen.', 'Nothing logged yet.')}</p>`}
    ${form}
    <div class="row gap">
      <button class="btn ghost block" data-action="copyYesterday" data-date="${date}">${L('Vortag kopieren', 'Copy previous day')}</button>
    </div>
    <label class="check-label card">
      <input type="checkbox" id="incomplete" data-change="toggleIncomplete" data-date="${date}" ${incomplete ? 'checked' : ''}>
      <span>${L('Tag unvollständig geloggt – nicht für die automatische Kalorienanpassung verwenden', 'Day not fully logged – exclude from automatic calorie adjustment')}</span>
    </label>`;
}

function setField(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = v ?? '';
}

export const actions = {
  foodDate(el) {
    selectedDate = el.dataset.date;
    navigate(`#/food/${selectedDate}`);
  },
  pickFood(el) {
    const f = state.foodLibrary.find((x) => x.id === el.dataset.id);
    if (!f) return false;
    setField('food-name', f.name);
    setField('food-basis', '100');
    setField('food-kcal', f.kcal);
    setField('food-protein', f.protein);
    setField('food-carbs', f.carbs);
    setField('food-fat', f.fat);
    setField('food-amount', f.lastAmount ?? 100);
    const amount = document.getElementById('food-amount');
    amount.focus();
    amount.select();
    return false;
  },
  addFood(form) {
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    const amount = parseNum(fd.get('amount'));
    const per100 = fd.get('basis') === '100';
    const raw = {
      kcal: parseNum(fd.get('kcal')) ?? 0,
      protein: parseNum(fd.get('protein')) ?? 0,
      carbs: parseNum(fd.get('carbs')) ?? 0,
      fat: parseNum(fd.get('fat')) ?? 0,
    };
    if (!name) return false;
    if (per100 && !amount) {
      alert(L('Bei Nährwerten pro 100 g bitte die Menge in Gramm eintragen.', 'For values per 100 g, please enter the amount in grams.'));
      return false;
    }
    const factor = per100 ? amount / 100 : 1;
    const entry = {
      id: uid(),
      date: selectedDate || today(),
      meal: fd.get('meal'),
      name,
      amount,
      kcal: round(raw.kcal * factor),
      protein: round(raw.protein * factor, 1),
      carbs: round(raw.carbs * factor, 1),
      fat: round(raw.fat * factor, 1),
    };
    state.foods.push(entry);

    const existing = state.foodLibrary.find((f) => normName(f.name) === normName(name));
    if (fd.get('saveLib') || existing) {
      // Bibliothek speichert immer pro 100 g; ohne Mengenangabe die Portion als "100 g"-Äquivalent
      const toPer100 = per100 ? 1 : amount ? 100 / amount : 1;
      const item = existing || { id: uid(), name };
      if (fd.get('saveLib') || !existing) {
        Object.assign(item, {
          kcal: round(raw.kcal * toPer100),
          protein: round(raw.protein * toPer100, 1),
          carbs: round(raw.carbs * toPer100, 1),
          fat: round(raw.fat * toPer100, 1),
        });
      }
      item.usedAt = new Date().toISOString();
      item.lastAmount = amount ?? 100;
      if (!existing) state.foodLibrary.push(item);
    }
    toast(L(`${name} eingetragen`, `${name} added`));
  },
  deleteFood(el) {
    state.foods = state.foods.filter((f) => f.id !== el.dataset.id);
  },
  copyYesterday(el) {
    const date = el.dataset.date;
    const prev = foodsOn(addDays(date, -1));
    if (!prev.length) {
      toast(L('Am Vortag ist nichts eingetragen', 'Nothing logged on the previous day'));
      return false;
    }
    if (!confirm(L(`${prev.length} Einträge vom Vortag übernehmen?`, `Copy ${prev.length} entries from the previous day?`))) return false;
    state.foods.push(...prev.map((f) => ({ ...f, id: uid(), date })));
  },
  toggleIncomplete(el) {
    const d = el.dataset.date;
    state.incompleteDays = el.checked ? [...new Set([...state.incompleteDays, d])] : state.incompleteDays.filter((x) => x !== d);
  },
};
