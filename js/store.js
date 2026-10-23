// App-State + Persistenz in localStorage. Alles bleibt lokal auf dem Gerät.
import { today, uid, normName } from './util.js';
import { GOALS } from './calc.js';
import { L } from './i18n.js';

const KEY = 'gymtracker.v1';
const SCHEMA_VERSION = 1;

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    profile: { sex: 'm', age: null, heightCm: null, weightKg: null, bodyFat: null, activity: 1.55 },
    goal: {
      type: 'cut',
      ratePct: GOALS.cut.defaultRate,
      proteinPerKg: GOALS.cut.proteinPerKg,
      fatPerKg: GOALS.cut.fatPerKg,
      adaptiveTdee: null,
      startDate: today(),
      adjustments: [], // {date, from, to, observed, note}
    },
    settings: { increment: 2.5, adaptiveWindow: 21, lang: 'en' },
    plan: { days: myPlanDays() },
    sessions: [],
    activeSession: null,
    weights: [], // {date, kg}
    foods: [], // {id, date, meal, name, amount, kcal, protein, carbs, fat}
    foodLibrary: [], // {id, name, kcal, protein, carbs, fat} je 100 g
    incompleteDays: [], // Tage, die nicht in die Anpassung einfließen sollen
    news: { seen: [] }, // IDs bereits angezeigter Studien
    migrations: { planWeekdays: true, planWeekdaysFix: true },
  };
}

function merge(base, loaded) {
  if (!loaded || typeof loaded !== 'object') return base;
  const out = { ...base };
  for (const k of Object.keys(loaded)) {
    const b = base[k];
    const l = loaded[k];
    if (b && typeof b === 'object' && !Array.isArray(b) && l && typeof l === 'object' && !Array.isArray(l)) {
      out[k] = merge(b, l);
    } else {
      out[k] = l;
    }
  }
  return out;
}

// Einmalige Korrekturen an bereits gespeicherten Daten
function migrate(s) {
  if (!s.migrations.planWeekdays) {
    // Plan-Vorlage hatte anfangs keine Wochentage → Mo–Fr nachtragen, wenn noch leer
    const template = new Map(myPlanDays().map((d) => [normName(d.name), d.weekdays]));
    for (const d of s.plan.days) {
      if (!d.weekdays.length && template.has(normName(d.name))) d.weekdays = [...template.get(normName(d.name))];
    }
    s.migrations.planWeekdays = true;
  }
  if (!s.migrations.planWeekdaysFix) {
    // Erste Zuordnung war falsch (Mo Chest 1 … Fr Leg). Nur Tage korrigieren, die noch
    // genau die alte Zuordnung haben – selbst geänderte Wochentage bleiben unangetastet.
    const wrong = { 'chest day 1': 1, 'back day 1': 2, 'chest day 2': 3, 'back day 2': 4, 'leg day': 5 };
    const template = new Map(myPlanDays().map((d) => [normName(d.name), d.weekdays]));
    for (const d of s.plan.days) {
      const key = normName(d.name);
      if (wrong[key] && d.weekdays.length === 1 && d.weekdays[0] === wrong[key]) d.weekdays = [...template.get(key)];
    }
    // Plan nach Wochentag sortieren (Tage ohne Wochentag ans Ende)
    const first = (d) => (d.weekdays.length ? Math.min(...d.weekdays) : 99);
    s.plan.days.sort((a, b) => first(a) - first(b));
    s.migrations.planWeekdaysFix = true;
  }
  return s;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const loaded = JSON.parse(raw);
    const merged = merge(defaultState(), loaded);
    // Nicht mit den Defaults mischen, sonst gelten alte Daten als schon migriert
    merged.migrations = { ...(loaded.migrations || {}) };
    return migrate(merged);
  } catch (e) {
    console.error('State konnte nicht geladen werden', e);
    return defaultState();
  }
}

export const state = loadState();

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 150);
}

export function saveNow() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Speichern fehlgeschlagen', e);
    alert(L('Speichern fehlgeschlagen – ist der Speicher voll? Bitte ein Backup exportieren.', 'Saving failed – is storage full? Please export a backup.'));
  }
}

export function replaceState(next) {
  const merged = merge(defaultState(), next);
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, merged);
  saveNow();
}

// --- Abfragen ---

export function latestWeight() {
  if (!state.weights.length) return null;
  return [...state.weights].sort((a, b) => b.date.localeCompare(a.date))[0];
}

// Gewicht für Berechnungen: letzter Eintrag, sonst Profilangabe
export function currentWeightKg() {
  return latestWeight()?.kg ?? state.profile.weightKg ?? null;
}

export function foodsOn(date) {
  return state.foods.filter((f) => f.date === date);
}

export function totalsFor(date) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const f of foodsOn(date)) {
    t.kcal += f.kcal || 0;
    t.protein += f.protein || 0;
    t.carbs += f.carbs || 0;
    t.fat += f.fat || 0;
  }
  return t;
}

// Kalorien je Tag, ohne als unvollständig markierte Tage
export function intakeByDay() {
  const skip = new Set(state.incompleteDays);
  const out = {};
  for (const f of state.foods) {
    if (skip.has(f.date)) continue;
    out[f.date] = (out[f.date] || 0) + (f.kcal || 0);
  }
  return out;
}

export function findDay(id) {
  return state.plan.days.find((d) => d.id === id);
}

// Letzte abgeschlossene Ausführung einer Übung (per ID, sonst per Name)
export function lastPerformance(exerciseId, name, beforeSessionId = null) {
  const key = normName(name);
  const sessions = [...state.sessions].sort((a, b) => (b.date + (b.startedAt || '')).localeCompare(a.date + (a.startedAt || '')));
  for (const s of sessions) {
    if (s.id === beforeSessionId) continue;
    const ex = s.exercises.find((e) => (exerciseId && e.exerciseId === exerciseId) || normName(e.name) === key);
    if (ex && ex.sets.some((x) => x.done)) return { session: s, exercise: ex };
  }
  return null;
}

export function myPlanDays() {
  return myPlanDaysUnsorted().sort((a, b) => a.weekdays[0] - b.weekdays[0]);
}

export function newExercise(partial = {}) {
  return { id: uid(), name: '', sets: 3, repMin: 8, repMax: 12, weight: null, rest: 120, notes: '', ...partial };
}

export function newDay(partial = {}) {
  return { id: uid(), name: L('Neuer Trainingstag', 'New training day'), weekdays: [], exercises: [], ...partial };
}

// Wdh-Spanne für die doppelte Progression: die notierte Wdh-Zahl ist das obere Ende,
// das untere liegt 2 darunter. Erst wenn alle Sätze oben ankommen, steigt das Gewicht.
function ex(name, sets, reps, weight, extra = {}) {
  return newExercise({
    name,
    sets,
    repMin: reps ? Math.max(reps - 2, 5) : null,
    repMax: reps || null,
    weight: weight ?? null,
    ...extra,
  });
}

function myPlanDaysUnsorted() {
  // Pause 0 = Supersatz: direkt weiter zur nächsten Übung, kein Pausen-Timer.
  // (Lokal statt Modul-Konstante, weil defaultState() schon beim Laden des Moduls läuft.)
  const SUPERSET = { rest: 0 };
  return [
    newDay({
      name: 'Chest Day 1',
      weekdays: [2],
      exercises: [
        ex('Dips', 2, null, 0, { notes: 'Körpergewicht, bis zum Versagen' }),
        ex('Kurzhantel Schrägbankdrücken', 2, 7, 30, { rest: 180, notes: 'Gewicht pro Hantel' }),
        ex('Butterfly Maschine', 2, 12, 60),
        ex('Kurzhantel Schulterdrücken', 2, 8, 24, { ...SUPERSET, notes: 'Supersatz mit Seitheben · Gewicht pro Hantel' }),
        ex('Seitheben', 2, 10, 8),
        ex('Trizepsdrücken', 3, 10, 65),
      ],
    }),
    newDay({
      name: 'Back Day 1',
      weekdays: [1],
      exercises: [
        ex('Kreuzheben', 2, 10, 120, { rest: 180 }),
        ex('Latzug', 2, 10, 72),
        ex('Face Pulls', 2, 15, 75, { ...SUPERSET, notes: 'Supersatz mit Seitheben' }),
        ex('Seitheben', 2, 10, 8),
        ex('Hammer Curls', 2, 8, 16, { notes: 'Gewicht pro Hantel' }),
        ex('Unterarm Curls', 2, 10, 75, { ...SUPERSET, notes: 'Supersatz mit dem Dreh-Gerät' }),
        ex('Unterarm Dreh-Gerät', 2, null, null, { notes: 'Name, Wdh und Gewicht bitte anpassen' }),
      ],
    }),
    newDay({
      name: 'Chest Day 2',
      weekdays: [5],
      exercises: [
        ex('Dips', 2, null, 0, { notes: 'Körpergewicht, bis zum Versagen' }),
        ex('Chest Press Uni', 2, 7, 101, { rest: 180 }),
        ex('Butterfly Maschine', 2, 10, 55),
        ex('Overhead Dumbbell Press', 2, 7, 24, { ...SUPERSET, notes: 'Supersatz mit Seitheben · Gewicht pro Hantel' }),
        ex('Seitheben', 2, 10, 10),
        ex('Overhead Trizepsdrücken', 3, 10, 57),
        ex('Crunch Maschine', 3, 8, null),
      ],
    }),
    newDay({
      name: 'Back Day 2',
      weekdays: [4],
      exercises: [
        ex('Latzug Maschine', 2, 10, 110),
        ex('Kabelrudern breit', 2, 10, 77),
        ex('Face Pulls', 2, 15, 80, { ...SUPERSET, notes: 'Supersatz mit Seitheben' }),
        ex('Seitheben', 2, 10, 8),
        ex('Preacher Curls', 3, 9, 50),
        ex('Reverse Grip Curls', 2, 10, 35),
      ],
    }),
    newDay({
      name: 'Leg Day',
      weekdays: [3],
      exercises: [
        ex('Beinbeuger', 2, 8, 80),
        ex('Kniebeugen', 2, 8, 75),
        ex('Beinstrecker', 2, 10, 100),
        ex('Wadenheben', 2, 8, 95),
        ex('Upright Rows', 2, 10, 55),
      ],
    }),
  ];
}
