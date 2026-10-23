// Reine Rechenlogik (kein DOM, kein State) – wird auch von den Node-Tests genutzt.
import { daysBetween, addDays, round } from './util.js';
import { L } from './i18n.js';

// Faustregel: 1 kg Körpergewicht ≈ 7700 kcal. Für Fett exakter als für "Waage-Gewicht",
// deshalb nutzt die adaptive Anpassung immer den Trend über mehrere Wochen.
export const KCAL_PER_KG = 7700;

export const ACTIVITY_LEVELS = [
  { value: 1.2, get label() { return L('Kaum aktiv', 'Sedentary'); }, get hint() { return L('Bürojob, kaum Bewegung, kein Sport', 'Desk job, little movement, no exercise'); } },
  { value: 1.375, get label() { return L('Leicht aktiv', 'Lightly active'); }, get hint() { return L('1–3× Training/Woche oder viel Gehen', '1–3 workouts/week or lots of walking'); } },
  { value: 1.55, get label() { return L('Mäßig aktiv', 'Moderately active'); }, get hint() { return L('3–5× Training/Woche', '3–5 workouts/week'); } },
  { value: 1.725, get label() { return L('Sehr aktiv', 'Very active'); }, get hint() { return L('6–7× Training/Woche oder körperlicher Job', '6–7 workouts/week or physical job'); } },
  { value: 1.9, get label() { return L('Extrem aktiv', 'Extremely active'); }, get hint() { return L('Harter körperlicher Job + tägliches Training', 'Hard physical job + daily training'); } },
];

// ratePct = Ziel-Gewichtsänderung in % des Körpergewichts pro Woche
export const GOALS = {
  cut: {
    get label() { return L('Abnehmen, Muskeln erhalten', 'Lose fat, keep muscle'); },
    get short() { return L('Diät', 'Cut'); },
    get description() { return L('Moderates Defizit, viel Protein, schwer weitertrainieren.', 'Moderate deficit, high protein, keep training heavy.'); },
    defaultRate: -0.5,
    rates: [-0.25, -0.5, -0.75, -1.0],
    proteinPerKg: 2.2,
    fatPerKg: 0.8,
  },
  recomp: {
    get label() { return L('Rekomposition', 'Recomposition'); },
    get short() { return L('Recomp', 'Recomp'); },
    get description() { return L('Etwa Erhaltung: Fett runter, Muskeln rauf – langsam, aber ohne Diätphase.', 'Around maintenance: lose fat, gain muscle – slow, but without a dieting phase.'); },
    defaultRate: 0,
    rates: [0, -0.1, -0.25],
    proteinPerKg: 2.2,
    fatPerKg: 0.8,
  },
  maintain: {
    get label() { return L('Gewicht halten', 'Maintain weight'); },
    get short() { return L('Halten', 'Maintain'); },
    get description() { return L('Erhaltungskalorien.', 'Maintenance calories.'); },
    defaultRate: 0,
    rates: [0],
    proteinPerKg: 1.8,
    fatPerKg: 0.9,
  },
  bulk: {
    get label() { return L('Muskelaufbau (Lean Bulk)', 'Build muscle (lean bulk)'); },
    get short() { return L('Aufbau', 'Bulk'); },
    get description() { return L('Kleiner Überschuss, damit möglichst wenig Fett dazukommt.', 'Small surplus to keep fat gain to a minimum.'); },
    defaultRate: 0.25,
    rates: [0.1, 0.25, 0.5],
    proteinPerKg: 1.8,
    fatPerKg: 0.9,
  },
};

export function bmr({ sex, age, heightCm, weightKg, bodyFat }) {
  if (!weightKg) return null;
  if (bodyFat && bodyFat > 3 && bodyFat < 60) {
    const lbm = weightKg * (1 - bodyFat / 100);
    return { value: 370 + 21.6 * lbm, method: L('Katch-McArdle (mit KFA)', 'Katch-McArdle (with body fat)') };
  }
  if (!age || !heightCm) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return { value: base + (sex === 'f' ? -161 : 5), method: 'Mifflin-St Jeor' };
}

export function formulaTdee(profile, weightKg) {
  const b = bmr({ ...profile, weightKg });
  if (!b) return null;
  return { bmr: b.value, method: b.method, tdee: b.value * (profile.activity || 1.55) };
}

// kcal pro Tag, die für die gewünschte Wochenrate nötig sind (negativ = Defizit)
export function dailyDelta(weightKg, ratePct) {
  return ((ratePct / 100) * weightKg * KCAL_PER_KG) / 7;
}

export function computeTargets(profile, goal, weightKg) {
  const f = formulaTdee(profile, weightKg);
  if (!f) return null;
  const adaptive = Number.isFinite(goal.adaptiveTdee) && goal.adaptiveTdee > 0;
  const tdee = adaptive ? goal.adaptiveTdee : f.tdee;
  const delta = dailyDelta(weightKg, goal.ratePct);
  let kcal = tdee + delta;
  const warnings = [];

  const floor = profile.sex === 'f' ? 1200 : 1500;
  if (kcal < floor) {
    warnings.push(L(`Unter ${floor} kcal wird es schwer, genug Nährstoffe und Protein unterzubringen – Ziel wurde auf ${floor} kcal begrenzt. Lieber eine langsamere Rate wählen.`, `Below ${floor} kcal it is hard to get enough nutrients and protein – target was capped at ${floor} kcal. Consider a slower rate.`));
    kcal = floor;
  }
  if (kcal < f.bmr && goal.ratePct < 0) {
    warnings.push(L('Das Ziel liegt unter deinem Grundumsatz. Das ist möglich, aber auf Dauer hart – Muskelerhalt leidet bei zu großem Defizit.', 'The target is below your BMR. Possible, but hard to sustain – muscle retention suffers with too large a deficit.'));
  }
  if (goal.ratePct <= -1) {
    warnings.push(L('1 % pro Woche ist aggressiv. Für Muskelerhalt sind 0,5–0,75 % meist der bessere Kompromiss.', '1% per week is aggressive. For keeping muscle, 0.5–0.75% is usually the better trade-off.'));
  }
  if (goal.ratePct >= 0.5) {
    warnings.push(L('Mehr als ~0,25–0,5 % pro Woche bringt bei Fortgeschrittenen vor allem mehr Fett, nicht mehr Muskeln.', 'More than ~0.25–0.5% per week mostly adds fat, not muscle, for experienced lifters.'));
  }

  kcal = round(kcal / 10) * 10;
  const protein = round(weightKg * goal.proteinPerKg);
  let fat = round(weightKg * goal.fatPerKg);
  // Fett nicht unter ~20 % der Kalorien (Hormonhaushalt)
  const minFat = round((kcal * 0.2) / 9);
  if (fat < minFat) fat = minFat;
  const carbs = Math.max(0, round((kcal - protein * 4 - fat * 9) / 4));
  if (kcal - protein * 4 - fat * 9 < 0) {
    warnings.push(L('Protein und Fett füllen das Kalorienziel schon komplett aus – Protein- oder Fett-Faktor senken.', 'Protein and fat already fill the whole calorie target – lower the protein or fat factor.'));
  }

  return {
    bmr: f.bmr,
    bmrMethod: f.method,
    formulaTdee: f.tdee,
    tdee,
    adaptive,
    delta,
    kcal,
    protein,
    fat,
    carbs,
    warnings,
  };
}

// --- Gewichtstrend ---

export function linearRegression(points) {
  // points: [{x, y}]
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) {
    sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

// Gleitender Durchschnitt über die letzten `days` Kalendertage (nicht Einträge)
export function movingAverage(weights, days = 7) {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((w) => {
    const from = addDays(w.date, -(days - 1));
    const win = sorted.filter((x) => x.date >= from && x.date <= w.date);
    return { date: w.date, kg: win.reduce((s, x) => s + x.kg, 0) / win.length };
  });
}

export function weightTrend(weights, endDate, windowDays) {
  const start = addDays(endDate, -(windowDays - 1));
  const ws = weights.filter((w) => w.date >= start && w.date <= endDate).sort((a, b) => a.date.localeCompare(b.date));
  if (ws.length < 2) return null;
  const reg = linearRegression(ws.map((w) => ({ x: daysBetween(start, w.date), y: w.kg })));
  if (!reg) return null;
  const mean = ws.reduce((s, w) => s + w.kg, 0) / ws.length;
  return {
    kgPerDay: reg.slope,
    kgPerWeek: reg.slope * 7,
    pctPerWeek: ((reg.slope * 7) / mean) * 100,
    mean,
    count: ws.length,
    spanDays: daysBetween(ws[0].date, ws[ws.length - 1].date),
  };
}

// --- Adaptive Anpassung ---
//
// Idee: Was du tatsächlich isst und wie sich dein Gewicht tatsächlich entwickelt, verrät
// deinen echten Verbrauch – unabhängig davon, wie gut die Formel auf dich passt.
//   echter Verbrauch = Ø Kalorien − (Gewichtsänderung pro Tag × 7700)
// Daraus wird das neue Ziel berechnet. Die Änderung pro Check-in ist begrenzt, damit
// Messrauschen (Wasser, Salz, Verdauung) nicht zu wilden Sprüngen führt.

export const ADAPT_MAX_STEP = 300;
export const ADAPT_MIN_STEP = 50;

export function analyzeAdaptive({ weights, intakeByDay, endDate, windowDays, currentTdee, ratePct }) {
  const start = addDays(endDate, -(windowDays - 1));
  const trend = weightTrend(weights, endDate, windowDays);
  const days = Object.entries(intakeByDay).filter(([d, kcal]) => d >= start && d <= endDate && kcal > 0);
  const loggedDays = days.length;
  const avgIntake = loggedDays ? days.reduce((s, [, k]) => s + k, 0) / loggedDays : null;

  const minLogged = Math.ceil(windowDays * 0.6);
  const issues = [];
  if (!trend || trend.count < 6) {
    const n = trend ? trend.count : weights.filter((w) => w.date >= start).length;
    issues.push(L(`Mindestens 6 Wiegungen im Zeitraum nötig (aktuell ${n}).`, `At least 6 weigh-ins needed in this period (currently ${n}).`));
  }
  else if (trend.spanDays < Math.min(13, windowDays - 1)) issues.push(L(`Die Wiegungen müssen mindestens 2 Wochen abdecken (aktuell ${trend.spanDays} Tage).`, `Weigh-ins must cover at least 2 weeks (currently ${trend.spanDays} days).`));
  if (loggedDays < minLogged) issues.push(L(`Mindestens ${minLogged} vollständig geloggte Ernährungstage nötig (aktuell ${loggedDays}).`, `At least ${minLogged} fully logged food days needed (currently ${loggedDays}).`));

  const base = { windowDays, start, endDate, trend, loggedDays, avgIntake, minLogged };
  if (issues.length) return { ...base, ok: false, issues };

  const observedTdee = avgIntake - trend.kgPerDay * KCAL_PER_KG;
  if (observedTdee < 1000 || observedTdee > 6000) {
    return {
      ...base,
      ok: false,
      observedTdee,
      issues: [L(`Errechneter Verbrauch von ${round(observedTdee)} kcal ist unplausibel – wahrscheinlich fehlen Einträge im Food-Log.`, `Calculated expenditure of ${round(observedTdee)} kcal is implausible – food log entries are probably missing.`)],
    };
  }

  const diff = observedTdee - currentTdee;
  const step = Math.max(-ADAPT_MAX_STEP, Math.min(ADAPT_MAX_STEP, diff));
  const suggestedTdee = round((currentTdee + step) / 10) * 10;
  const meanWeight = trend.mean;
  const targetKgPerWeek = (ratePct / 100) * meanWeight;

  return {
    ...base,
    ok: true,
    issues: [],
    observedTdee,
    currentTdee,
    suggestedTdee,
    change: suggestedTdee - currentTdee,
    capped: Math.abs(diff) > ADAPT_MAX_STEP,
    worthChanging: Math.abs(suggestedTdee - currentTdee) >= ADAPT_MIN_STEP,
    targetKgPerWeek,
    actualKgPerWeek: trend.kgPerWeek,
  };
}

// --- Training ---

// Epley-Formel für geschätztes 1RM
export function e1rm(weight, reps) {
  if (!weight || !reps || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function sessionVolume(session) {
  let v = 0;
  for (const ex of session.exercises) {
    for (const s of ex.sets) if (s.done) v += (s.weight || 0) * (s.reps || 0);
  }
  return v;
}

// Doppelte Progression: erst alle Sätze bis zum oberen Ende der Wdh-Spanne,
// dann Gewicht erhöhen und wieder unten in der Spanne starten.
export function suggestNext(planEx, lastSets, increment = 2.5) {
  const repMin = planEx.repMin || planEx.repMax || 8;
  const repMax = planEx.repMax || repMin;
  const targetSets = planEx.sets || 3;
  const done = (lastSets || []).filter((s) => s.done && s.reps > 0);
  if (!done.length) {
    return { weight: planEx.weight ?? null, reps: planEx.repMax ?? planEx.repMin ?? null, kind: 'start' };
  }
  const top = Math.max(...done.map((s) => s.weight || 0));
  const atTop = done.filter((s) => (s.weight || 0) === top);
  const allHit = atTop.length >= targetSets && atTop.every((s) => s.reps >= repMax);
  if (allHit && top > 0) {
    return { weight: round(top + increment, 2), reps: repMin, kind: 'increase' };
  }
  if (allHit && top === 0) {
    return { weight: 0, reps: repMax + 1, kind: 'more-reps' };
  }
  return { weight: top, reps: null, kind: 'repeat' };
}
