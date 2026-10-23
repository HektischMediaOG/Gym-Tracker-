import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bmr, computeTargets, analyzeAdaptive, suggestNext, weightTrend, e1rm, dailyDelta } from '../js/calc.js';
import { addDays, daysBetween } from '../js/util.js';

const profile = { sex: 'm', age: 30, heightCm: 180, activity: 1.55, bodyFat: null };
const cutGoal = { type: 'cut', ratePct: -0.5, proteinPerKg: 2.2, fatPerKg: 0.8, adaptiveTdee: null };

test('Mifflin-St Jeor für Männer', () => {
  // 10*80 + 6.25*180 - 5*30 + 5 = 1780
  assert.equal(bmr({ ...profile, weightKg: 80 }).value, 1780);
});

test('Katch-McArdle, wenn Körperfett bekannt', () => {
  const r = bmr({ ...profile, weightKg: 80, bodyFat: 20 });
  assert.equal(r.method.startsWith('Katch'), true);
  assert.equal(Math.round(r.value), Math.round(370 + 21.6 * 64));
});

test('Diät-Ziel: Defizit für 0,5 %/Woche und Makros', () => {
  const t = computeTargets(profile, cutGoal, 80);
  // TDEE 1780*1.55 = 2759; 0,4 kg/Woche ≈ 440 kcal/Tag
  assert.equal(Math.round(t.formulaTdee), 2759);
  assert.equal(Math.round(t.delta), -440);
  assert.equal(t.kcal, 2320);
  assert.equal(t.protein, 176);
  assert.equal(t.fat, 64);
  assert.equal(t.protein * 4 + t.fat * 9 + t.carbs * 4 <= t.kcal + 4, true);
});

test('Untergrenze greift bei zu aggressivem Ziel', () => {
  const t = computeTargets({ ...profile, activity: 1.2, age: 50, heightCm: 160 }, { ...cutGoal, ratePct: -1 }, 60);
  assert.equal(t.kcal, 1500);
  assert.ok(t.warnings.length > 0);
});

test('Adaptiver Verbrauch ersetzt Formel', () => {
  const t = computeTargets(profile, { ...cutGoal, adaptiveTdee: 2500 }, 80);
  assert.equal(t.tdee, 2500);
  assert.equal(t.kcal, 2060);
});

function simulate({ days = 21, startKg = 80, kgPerWeek, intake, end = '2026-03-21', noise = 0 }) {
  const weights = [];
  const intakeByDay = {};
  for (let i = 0; i < days; i++) {
    const date = addDays(end, -(days - 1) + i);
    const wiggle = noise ? Math.sin(i * 1.7) * noise : 0;
    weights.push({ date, kg: startKg + (kgPerWeek / 7) * i + wiggle });
    intakeByDay[date] = intake;
  }
  return { weights, intakeByDay, end };
}

test('Anpassung: Gewicht steht trotz Defizit-Ziel → Ziel sinkt', () => {
  // Formel sagt 2759, User isst 2320, Gewicht bleibt gleich → echter Verbrauch ≈ 2320
  const sim = simulate({ kgPerWeek: 0, intake: 2320 });
  const a = analyzeAdaptive({ weights: sim.weights, intakeByDay: sim.intakeByDay, endDate: sim.end, windowDays: 21, currentTdee: 2759, ratePct: -0.5 });
  assert.equal(a.ok, true);
  assert.equal(Math.round(a.observedTdee), 2320);
  assert.equal(a.capped, true); // Abweichung > 300 → gedeckelt
  assert.equal(a.suggestedTdee, 2460);
  assert.equal(a.worthChanging, true);
});

test('Anpassung: alles nach Plan → keine Änderung', () => {
  const sim = simulate({ kgPerWeek: -0.4, intake: 2320, noise: 0.3 });
  const tdee = 2320 + (0.4 / 7) * 7700; // 2760
  const a = analyzeAdaptive({ weights: sim.weights, intakeByDay: sim.intakeByDay, endDate: sim.end, windowDays: 21, currentTdee: tdee, ratePct: -0.5 });
  assert.equal(a.ok, true);
  assert.ok(Math.abs(a.observedTdee - tdee) < 150, `observed ${a.observedTdee}`);
});

test('Anpassung: Lean Bulk, nimmt zu schnell zu → Verbrauch niedriger', () => {
  const sim = simulate({ kgPerWeek: 0.6, intake: 3000 });
  const a = analyzeAdaptive({ weights: sim.weights, intakeByDay: sim.intakeByDay, endDate: sim.end, windowDays: 21, currentTdee: 2800, ratePct: 0.25 });
  assert.equal(a.ok, true);
  assert.equal(Math.round(a.observedTdee), 2340);
  assert.equal(a.change, -300);
});

test('Anpassung verweigert bei zu wenig Daten', () => {
  const sim = simulate({ days: 8, kgPerWeek: 0, intake: 2300 });
  const a = analyzeAdaptive({ weights: sim.weights, intakeByDay: sim.intakeByDay, endDate: sim.end, windowDays: 21, currentTdee: 2700, ratePct: -0.5 });
  assert.equal(a.ok, false);
  assert.ok(a.issues.length >= 1);
});

test('Gewichtstrend per Regression', () => {
  const sim = simulate({ kgPerWeek: -0.7, intake: 2000 });
  const t = weightTrend(sim.weights, sim.end, 21);
  assert.ok(Math.abs(t.kgPerWeek + 0.7) < 1e-9);
  assert.equal(t.spanDays, 20);
});

test('Doppelte Progression', () => {
  const ex = { sets: 3, repMin: 8, repMax: 12, weight: 60 };
  assert.deepEqual(suggestNext(ex, [], 2.5), { weight: 60, reps: 12, kind: 'start' });
  const hit = [12, 12, 12].map((r) => ({ weight: 60, reps: r, done: true }));
  assert.deepEqual(suggestNext(ex, hit, 2.5), { weight: 62.5, reps: 8, kind: 'increase' });
  const miss = [12, 11, 9].map((r) => ({ weight: 60, reps: r, done: true }));
  assert.equal(suggestNext(ex, miss, 2.5).kind, 'repeat');
  assert.equal(suggestNext(ex, miss, 2.5).weight, 60);
  const bw = [10, 10, 10].map((r) => ({ weight: 0, reps: r, done: true }));
  assert.equal(suggestNext({ sets: 3, repMin: 6, repMax: 10 }, bw).kind, 'more-reps');
});

test('Hilfsfunktionen', () => {
  assert.equal(Math.round(e1rm(100, 5)), 117);
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2); // über Zeitumstellung
  assert.equal(Math.round(dailyDelta(80, -0.5)), -440);
});
