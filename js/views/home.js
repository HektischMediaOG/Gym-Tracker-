import { state, totalsFor, latestWeight } from '../store.js';
import { movingAverage, weightTrend, GOALS } from '../calc.js';
import { esc, today, addDays, fmtNum, fmtSigned, fmtDate, fmtDateRelative, isoWeekday, weekdayLong } from '../util.js';
import { L } from '../i18n.js';
import { bar } from '../chart.js';
import { todaysDays } from './training.js';
import { currentTargets } from './food.js';
import { adaptiveAnalysis, lastAdjustment } from './goals.js';
import { daysBetween, normName } from '../util.js';
import { unseenCount } from './news.js';

export function render() {
  const d = today();
  const days = todaysDays(d);
  const target = currentTargets();
  const t = totalsFor(d);
  const lw = latestWeight();
  const avg = movingAverage(state.weights, 7);
  const trend = weightTrend(state.weights, d, 21);
  const doneToday = state.sessions.filter((s) => s.date === d);

  // Training heute
  let trainingCard;
  if (state.activeSession) {
    trainingCard = `<a class="card hero" href="#/workout"><p class="label">${L('Training läuft', 'Workout in progress')}</p><h2>${esc(state.activeSession.dayName)}</h2><span class="btn primary">${L('Fortsetzen', 'Continue')}</span></a>`;
  } else if (doneToday.length) {
    trainingCard = `<a class="card hero done" href="#/session/${doneToday[0].id}"><p class="label">${L('Heute erledigt ✓', 'Done today ✓')}</p><h2>${esc(doneToday.map((s) => s.dayName).join(' + '))}</h2><span class="muted small">${L('Ansehen →', 'View →')}</span></a>`;
  } else if (days.length) {
    trainingCard = days
      .map((day) => `<section class="card hero"><p class="label">${L('Heute dran', 'Today')} · ${weekdayLong(isoWeekday(d) - 1)}</p><h2>${esc(day.name)}</h2>
        <p class="muted small">${day.exercises.filter((e) => e.name).map((e) => esc(e.name)).join(' · ') || L('Keine Übungen', 'No exercises')}</p>
        <button class="btn primary block" data-action="startWorkout" data-day="${day.id}" ${day.exercises.length ? '' : 'disabled'}>${L('Training starten', 'Start workout')}</button></section>`)
      .join('');
  } else if (!state.plan.days.some((x) => x.weekdays.length)) {
    // Ohne feste Wochentage nicht "Ruhetag" behaupten, sondern Auswahl anbieten
    trainingCard = state.plan.days.length
      ? `<section class="card hero"><p class="label">${L('Heute', 'Today')}</p><h2>${L('Welches Training?', 'Which workout?')}</h2>
          <div class="pick-list">${state.plan.days.map((day) => startButton(day, esc(day.name))).join('')}</div>
          <p class="small muted">${L('Tipp: Unter Training → Bearbeiten Wochentage eintragen, dann steht hier automatisch das Training des Tages.', 'Tip: set weekdays under Training → Edit and today’s workout shows up here automatically.')}</p></section>`
      : `<a class="card hero" href="#/training"><p class="label">${L('Los geht’s', 'Let’s go')}</p><h2>${L('Trainingsplan anlegen', 'Create training plan')}</h2><span class="muted small">${L('Übungen, Sätze, Wiederholungen, Gewichte →', 'Exercises, sets, reps, weights →')}</span></a>`;
  } else {
    const next = nextTrainingDay(d);
    trainingCard = `<section class="card hero rest"><p class="label">${L('Heute', 'Today')}</p><h2>${L('Ruhetag', 'Rest day')}</h2>
      ${next ? `<p class="muted small">${L('Nächstes Training', 'Next workout')}: ${esc(next.day.name)} (${fmtDateRelative(next.date)})</p>` : ''}
      <a class="btn ghost small" href="#/training">${L('Trotzdem trainieren', 'Train anyway')}</a></section>`;
  }

  // Verpasste Trainings dieser Woche (Mo bis gestern) zum Nachholen anbieten
  const missed = state.activeSession ? [] : missedThisWeek(d);
  const missedCard = missed.length
    ? `<section class="card"><h3>${L('Diese Woche noch offen', 'Still open this week')}</h3>
        <div class="pick-list">${missed.map(({ day, date }) => startButton(day, `${L(`${esc(day.name)} nachholen`, `Make up ${esc(day.name)}`)} <span class="muted small">(${weekdayLong(isoWeekday(date) - 1)})</span>`, 'ghost')).join('')}</div>
      </section>`
    : '';

  // Ernährung heute
  const foodCard = `<a class="card" href="#/food">
    <div class="card-head"><h3>${L('Ernährung heute', 'Nutrition today')}</h3><span class="muted small">${L('Eintragen →', 'Log →')}</span></div>
    ${target
      ? `<div class="kcal-big"><div><span class="big">${fmtNum(t.kcal, 0)}</span><span class="muted"> / ${fmtNum(target.kcal, 0)} kcal</span></div></div>
         ${bar(t.kcal, target.kcal, 'kcal')}
         <div class="mini-macros">
           <span>Protein ${fmtNum(t.protein, 0)}/${target.protein} g</span>
           <span>${L('KH', 'Carbs')} ${fmtNum(t.carbs, 0)}/${target.carbs} g</span>
           <span>${L('Fett', 'Fat')} ${fmtNum(t.fat, 0)}/${target.fat} g</span>
         </div>`
      : `<p class="muted small">${L('Profil unter „Ziele“ ausfüllen, um dein Kalorienziel zu sehen.', 'Fill in your profile under “Goals” to see your calorie target.')}</p>`}
  </a>`;

  // Gewicht
  const weighedToday = lw?.date === d;
  const weightCard = `<a class="card" href="#/weight">
    <div class="card-head"><h3>${L('Gewicht', 'Weight')}</h3><span class="muted small">${weighedToday ? L('heute gewogen ✓', 'weighed today ✓') : L('Heute wiegen →', 'Weigh in →')}</span></div>
    ${lw
      ? `<div class="stats inline">
          <div class="stat"><span class="stat-value">${fmtNum(lw.kg, 1)}</span><span class="stat-label">${L('zuletzt', 'latest')} (${fmtDateRelative(lw.date)})</span></div>
          <div class="stat"><span class="stat-value">${fmtNum(avg[avg.length - 1].kg, 1)}</span><span class="stat-label">${L('Ø 7 Tage', '7-day avg')}</span></div>
          <div class="stat"><span class="stat-value">${trend && trend.count >= 4 ? fmtSigned(trend.kgPerWeek, 2) : '–'}</span><span class="stat-label">${L('kg/Woche', 'kg/week')}</span></div>
        </div>`
      : `<p class="muted small">${L('Noch kein Eintrag.', 'No entry yet.')}</p>`}
  </a>`;

  // Check-in
  let checkin = '';
  if (target) {
    const a = adaptiveAnalysis(target);
    const last = lastAdjustment();
    const due = !last || daysBetween(last.date, d) >= 7;
    if (a?.ok && a.worthChanging && due) {
      checkin = `<a class="card alert" href="#/goals"><h3>${L('Wöchentlicher Check-in', 'Weekly check-in')}</h3>
        <p>${L(`Deine Daten der letzten ${a.windowDays} Tage zeigen: Dein Verbrauch liegt eher bei ${fmtNum(a.observedTdee, 0)} kcal. Vorschlag ansehen →`, `Your data from the last ${a.windowDays} days shows your expenditure is closer to ${fmtNum(a.observedTdee, 0)} kcal. See suggestion →`)}</p></a>`;
    }
  }

  const fresh = unseenCount();
  const newsCard = `<a class="card news-teaser" href="#/news">
    <div class="card-head"><h3>${L('Neue Studien', 'New research')}</h3>${fresh ? `<span class="badge new">${fresh} ${L('neu', 'new')}</span>` : `<span class="muted small">${L('Ansehen →', 'View →')}</span>`}</div>
    <p class="muted small">${L('Krafttraining, Ernährung und Regeneration – Meta-Analysen, Reviews und RCTs.', 'Strength training, nutrition and recovery – meta-analyses, reviews and RCTs.')}</p>
  </a>`;

  const goalLine = `<p class="muted small center">${L('Ziel', 'Goal')}: ${esc(GOALS[state.goal.type].label)}${state.goal.ratePct ? ` · ${fmtSigned(state.goal.ratePct, 2)} ${L('%/Woche', '%/week')}` : ''}</p>`;

  return `<h1 class="page-title">${fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
    ${trainingCard}${missedCard}${checkin}${foodCard}${weightCard}${newsCard}${goalLine}`;
}

function startButton(day, label, style = 'primary') {
  return `<button class="btn ${style} block" data-action="startWorkout" data-day="${day.id}" ${day.exercises.length ? '' : 'disabled'}>${label}</button>`;
}

export function missedThisWeek(date) {
  const weekStart = addDays(date, -(isoWeekday(date) - 1));
  const weekSessions = state.sessions.filter((s) => s.date >= weekStart && s.date <= date);
  const out = [];
  for (const day of state.plan.days) {
    const done = weekSessions.some((s) => s.dayId === day.id || normName(s.dayName) === normName(day.name));
    if (done) continue;
    const planned = [...day.weekdays].sort().map((wd) => addDays(weekStart, wd - 1)).filter((x) => x < date);
    if (planned.length) out.push({ day, date: planned[0] });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function nextTrainingDay(from) {
  for (let i = 1; i <= 7; i++) {
    const date = addDays(from, i);
    const day = todaysDays(date)[0];
    if (day) return { date, day };
  }
  return null;
}

export const actions = {};
