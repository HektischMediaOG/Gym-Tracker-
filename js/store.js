// App-State + Persistenz in localStorage. Alles bleibt lokal auf dem Gerät.
import { today, uid, normName } from './util.js';
import { GOALS } from './calc.js';

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
    settings: { increment: 2.5, adaptiveWindow: 21 },
    plan: { days: [] },
    sessions: [],
    activeSession: null,
    weights: [], // {date, kg}
    foods: [], // {id, date, meal, name, amount, kcal, protein, carbs, fat}
    foodLibrary: [], // {id, name, kcal, protein, carbs, fat} je 100 g
    incompleteDays: [], // Tage, die nicht in die Anpassung einfließen sollen
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

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    return merge(defaultState(), JSON.parse(raw));
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
    alert('Speichern fehlgeschlagen – ist der Speicher voll? Bitte ein Backup exportieren.');
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

export function newExercise(partial = {}) {
  return { id: uid(), name: '', sets: 3, repMin: 8, repMax: 12, weight: null, rest: 120, notes: '', ...partial };
}

export function newDay(partial = {}) {
  return { id: uid(), name: 'Neuer Trainingstag', weekdays: [], exercises: [], ...partial };
}

export function exampleDays() {
  return [
    newDay({
      name: 'Push',
      weekdays: [1],
      exercises: [
        newExercise({ name: 'Bankdrücken', sets: 3, repMin: 6, repMax: 8, rest: 180 }),
        newExercise({ name: 'Schrägbankdrücken Kurzhantel', sets: 3, repMin: 8, repMax: 12 }),
        newExercise({ name: 'Schulterdrücken', sets: 3, repMin: 8, repMax: 10 }),
        newExercise({ name: 'Seitheben', sets: 3, repMin: 12, repMax: 15, rest: 90 }),
        newExercise({ name: 'Trizepsdrücken am Kabel', sets: 3, repMin: 10, repMax: 12, rest: 90 }),
      ],
    }),
    newDay({
      name: 'Pull',
      weekdays: [3],
      exercises: [
        newExercise({ name: 'Klimmzüge', sets: 3, repMin: 6, repMax: 10, weight: 0, rest: 180 }),
        newExercise({ name: 'Langhantelrudern', sets: 3, repMin: 8, repMax: 10 }),
        newExercise({ name: 'Latzug eng', sets: 3, repMin: 10, repMax: 12 }),
        newExercise({ name: 'Face Pulls', sets: 3, repMin: 12, repMax: 15, rest: 90 }),
        newExercise({ name: 'Bizepscurls', sets: 3, repMin: 10, repMax: 12, rest: 90 }),
      ],
    }),
  ];
}
