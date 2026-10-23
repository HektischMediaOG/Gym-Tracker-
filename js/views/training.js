import { state, findDay, lastPerformance, newDay, newExercise, myPlanDays } from '../store.js';
import { suggestNext, e1rm, sessionVolume } from '../calc.js';
import { esc, uid, today, addDays, parseNum, fmtNum, fmtDate, fmtDateRelative, isoWeekday, weekdayShort, normName, round, fmtInput } from '../util.js';
import { L, locale } from '../i18n.js';
import { exName, canonicalExName, noteText, canonicalNote } from '../names.js';
import { lineChart } from '../chart.js';
import { navigate, toast, startRestTimer } from '../app.js';

function subnav(active) {
  return `<nav class="subnav">
    <a href="#/training" class="${active === 'plan' ? 'active' : ''}">Plan</a>
    <a href="#/history" class="${active === 'history' ? 'active' : ''}">${L('Verlauf', 'History')}</a>
  </nav>`;
}

function activeBanner() {
  const s = state.activeSession;
  if (!s) return '';
  const done = s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
  return `<a class="banner" href="#/workout">
    <strong>${L('Training läuft', 'Workout in progress')}: ${esc(s.dayName)}</strong>
    <span>${done} ${L('Sätze erledigt · fortsetzen →', 'sets done · continue →')}</span>
  </a>`;
}

function repRange(ex) {
  if (!ex.repMin && !ex.repMax) return '';
  if (!ex.repMax || ex.repMin === ex.repMax) return `${ex.repMin || ex.repMax}`;
  return `${ex.repMin || '?'}–${ex.repMax}`;
}

function setsLabel(ex) {
  const range = repRange(ex);
  return range ? `${ex.sets || '?'} × ${range}` : `${ex.sets || '?'} ${L('Sätze', 'sets')}`;
}

function fmtRest(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function setsSummary(sets) {
  return sets
    .filter((s) => s.done)
    .map((s) => (s.weight ? `${fmtNum(s.weight, 2)}×${s.reps ?? '?'}` : `${s.reps ?? '?'} ${L('Wdh', 'reps')}`))
    .join(' · ');
}

// Tage aus der Vorlage, die (nach Name) noch nicht im Plan sind
function missingPlanDays() {
  const have = new Set(state.plan.days.map((d) => normName(d.name)));
  return myPlanDays().filter((d) => !have.has(normName(d.name)));
}

export function todaysDays(date = today()) {
  const wd = isoWeekday(date);
  return state.plan.days.filter((d) => d.weekdays.includes(wd));
}

// --- Plan ---

export function renderPlan() {
  const days = state.plan.days;
  const list = days.length
    ? days
        .map((d) => {
          const wd = d.weekdays.length ? [...d.weekdays].sort().map((w) => weekdayShort(w - 1)).join(', ') : L('kein fester Tag', 'no fixed day');
          const exList = d.exercises.length
            ? `<ul class="ex-mini">${d.exercises
                .map((e) => `<li><span>${esc(exName(e.name) || L('Ohne Namen', 'Unnamed'))}</span><span class="muted">${setsLabel(e)}${e.weight ? ` · ${fmtNum(e.weight, 2)} kg` : ''}</span></li>`)
                .join('')}</ul>`
            : `<p class="muted">${L('Noch keine Übungen.', 'No exercises yet.')}</p>`;
          return `<section class="card">
            <div class="card-head">
              <div><h3>${esc(d.name)}</h3><p class="muted small">${wd}</p></div>
              <a class="btn ghost small" href="#/plan/${d.id}">${L('Bearbeiten', 'Edit')}</a>
            </div>
            ${exList}
            <button class="btn primary block" data-action="startWorkout" data-day="${d.id}" ${d.exercises.length ? '' : 'disabled'}>${L('Training starten', 'Start workout')}</button>
          </section>`;
        })
        .join('')
    : `<section class="card empty">
        <h3>${L('Noch kein Trainingsplan', 'No training plan yet')}</h3>
        <p>${L('Leg für jeden Trainingstag die Übungen mit Sätzen, Wiederholungs-Spanne und Startgewicht an. Beim Training werden dann die Werte vom letzten Mal vorausgefüllt.', 'Add the exercises for each training day with sets, rep range and starting weight. During a workout, last session’s numbers are pre-filled.')}</p>
        <button class="btn ghost block" data-action="loadMyPlan">${L('Meinen Plan laden (Chest, Back, Leg Day)', 'Load my plan (Chest, Back, Leg Day)')}</button>
      </section>`;

  return `${subnav('plan')}${activeBanner()}
    ${list}
    <div class="row gap">
      <button class="btn block" data-action="addDay">+ ${L('Trainingstag', 'Training day')}</button>
      <button class="btn ghost block" data-action="startWorkout" data-day="">${L('Freies Training', 'Free workout')}</button>
    </div>
    ${days.length && missingPlanDays().length ? `<button class="btn ghost small block mt" data-action="loadMyPlan">${L('Fehlende Tage aus meinem Plan hinzufügen', 'Add missing days from my plan')} (${missingPlanDays().map((d) => esc(d.name)).join(', ')})</button>` : ''}`;
}

export function renderDayEditor(id) {
  const d = findDay(id);
  if (!d) return `<p>${L('Trainingstag nicht gefunden.', 'Training day not found.')}</p><a href="#/training">${L('Zurück', 'Back')}</a>`;
  const wdButtons = [0, 1, 2, 3, 4, 5, 6].map(
    (i) => `<button class="chip ${d.weekdays.includes(i + 1) ? 'on' : ''}" data-action="toggleWeekday" data-day="${d.id}" data-wd="${i + 1}">${weekdayShort(i)}</button>`
  ).join('');

  const exCards = d.exercises
    .map((e, i) => {
      const shown = { name: exName(e.name), notes: noteText(e.notes) };
      const f = (field, label, attrs = '', value = field in shown ? shown[field] : e[field]) =>
        `<label class="field"><span>${label}</span><input id="ex-${e.id}-${field}" ${attrs} value="${esc(fmtInput(value))}" data-input="exField" data-day="${d.id}" data-ex="${e.id}" data-field="${field}"></label>`;
      return `<section class="card ex-edit">
        <div class="card-head">
          <strong class="muted">#${i + 1}</strong>
          <div class="row">
            <button class="icon-btn" data-action="moveEx" data-day="${d.id}" data-ex="${e.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="${L('Nach oben', 'Move up')}">↑</button>
            <button class="icon-btn" data-action="moveEx" data-day="${d.id}" data-ex="${e.id}" data-dir="1" ${i === d.exercises.length - 1 ? 'disabled' : ''} aria-label="${L('Nach unten', 'Move down')}">↓</button>
            <button class="icon-btn danger" data-action="deleteEx" data-day="${d.id}" data-ex="${e.id}" aria-label="${L('Löschen', 'Delete')}">✕</button>
          </div>
        </div>
        ${f('name', L('Übung', 'Exercise'), `type="text" placeholder="${L('z. B. Kniebeugen', 'e.g. Squats')}" autocomplete="off"`)}
        <div class="grid4">
          ${f('sets', L('Sätze', 'Sets'), 'inputmode="numeric"')}
          ${f('repMin', L('Wdh von', 'Reps min'), 'inputmode="numeric"')}
          ${f('repMax', L('Wdh bis', 'Reps max'), 'inputmode="numeric"')}
          ${f('weight', 'kg', 'inputmode="decimal" placeholder="–"')}
        </div>
        <div class="grid2">
          ${f('rest', L('Pause (Sek., 0 = Supersatz)', 'Rest (sec, 0 = superset)'), 'inputmode="numeric"')}
          ${f('notes', L('Notiz', 'Note'), `type="text" placeholder="${L('z. B. Sitz Stufe 4', 'e.g. seat level 4')}"`)}
        </div>
      </section>`;
    })
    .join('');

  return `<a class="back" href="#/training">← Plan</a>
    <section class="card">
      <label class="field"><span>${L('Name des Trainingstags', 'Training day name')}</span>
        <input id="day-name" type="text" value="${esc(d.name)}" data-input="dayName" data-day="${d.id}" placeholder="${L('z. B. Leg Day', 'e.g. Leg Day')}">
      </label>
      <p class="label">${L('Wochentage', 'Weekdays')}</p>
      <div class="chips">${wdButtons}</div>
    </section>
    ${exCards || `<p class="muted center">${L('Noch keine Übungen – füge die erste hinzu.', 'No exercises yet – add the first one.')}</p>`}
    <button class="btn block" data-action="addEx" data-day="${d.id}">+ ${L('Übung hinzufügen', 'Add exercise')}</button>
    <div class="row gap mt">
      <button class="btn ghost danger block" data-action="deleteDay" data-day="${d.id}">${L('Tag löschen', 'Delete day')}</button>
      <a class="btn primary block" href="#/training">${L('Fertig', 'Done')}</a>
    </div>`;
}

// --- Aktives Training ---

function buildSessionExercise(planEx) {
  const last = lastPerformance(planEx.id, planEx.name);
  const sug = suggestNext(planEx, last?.exercise.sets, state.settings.increment);
  const lastDone = last ? last.exercise.sets.filter((s) => s.done) : [];
  const n = planEx.sets || 3;
  const sets = Array.from({ length: n }, (_, i) => ({
    weight: sug.weight ?? planEx.weight ?? null,
    reps: sug.kind === 'repeat' ? lastDone[i]?.reps ?? lastDone[lastDone.length - 1]?.reps ?? planEx.repMin : sug.reps,
    done: false,
  }));
  return {
    exerciseId: planEx.id,
    name: planEx.name,
    target: { sets: n, repMin: planEx.repMin, repMax: planEx.repMax, rest: planEx.rest, notes: planEx.notes },
    hint: sug.kind,
    hintWeight: sug.weight,
    last: last ? { date: last.session.date, summary: setsSummary(last.exercise.sets) } : null,
    sets,
  };
}

export function renderWorkout() {
  const s = state.activeSession;
  if (!s) {
    return `${subnav('plan')}<section class="card empty"><h3>${L('Kein laufendes Training', 'No workout in progress')}</h3><p>${L('Starte ein Training über deinen Plan.', 'Start a workout from your plan.')}</p><a class="btn primary block" href="#/training">${L('Zum Plan', 'Go to plan')}</a></section>`;
  }
  const mins = Math.round((Date.now() - new Date(s.startedAt).getTime()) / 60000);
  const cards = s.exercises
    .map((ex, xi) => {
      const t = ex.target || {};
      const hint = {
        increase: `<p class="hint up">↑ ${L(`Letztes Mal alle Sätze geschafft – heute ${fmtNum(ex.hintWeight, 2)} kg`, `Hit all sets last time – today ${fmtNum(ex.hintWeight, 2)} kg`)}</p>`,
        repeat: `<p class="hint">${L('Gleiches Gewicht – versuch mindestens 1 Wdh mehr als letztes Mal', 'Same weight – aim for at least 1 more rep than last time')}</p>`,
        'more-reps': `<p class="hint up">↑ ${L('Alle Sätze geschafft – heute mehr Wiederholungen oder Zusatzgewicht', 'Hit all sets – today more reps or added weight')}</p>`,
      }[ex.hint] || '';
      const rows = ex.sets
        .map(
          (set, si) => `<div class="set-row ${set.done ? 'done' : ''}">
            <span class="set-no">${si + 1}</span>
            <label class="set-field"><input id="w-${xi}-${si}" inputmode="decimal" value="${esc(fmtInput(set.weight))}" placeholder="kg" data-input="setField" data-x="${xi}" data-s="${si}" data-field="weight"><span>kg</span></label>
            <label class="set-field"><input id="r-${xi}-${si}" inputmode="numeric" value="${esc(set.reps ?? '')}" placeholder="${L('Wdh', 'reps')}" data-input="setField" data-x="${xi}" data-s="${si}" data-field="reps"><span>${L('Wdh', 'reps')}</span></label>
            <button class="check ${set.done ? 'on' : ''}" data-action="toggleSet" data-x="${xi}" data-s="${si}" aria-label="${L('Satz erledigt', 'Set done')}">✓</button>
          </div>`
        )
        .join('');
      const meta = [t.sets && setsLabel(t), t.rest === 0 ? L('Supersatz → direkt weiter', 'Superset → go straight on') : t.rest && `${L('Pause', 'Rest')} ${fmtRest(t.rest)}`].filter(Boolean).join(' · ');
      return `<section class="card">
        <div class="card-head">
          <div>
            <h3><a href="#/exercise/${encodeURIComponent(ex.name)}">${esc(exName(ex.name))}</a></h3>
            ${meta ? `<p class="muted small">${meta}</p>` : ''}
          </div>
          <button class="icon-btn danger" data-action="removeSessionEx" data-x="${xi}" aria-label="${L('Übung entfernen', 'Remove exercise')}">✕</button>
        </div>
        ${ex.last ? `<p class="small muted">${L('Letztes Mal', 'Last time')} (${fmtDateRelative(ex.last.date)}): ${esc(ex.last.summary)}</p>` : `<p class="small muted">${ex.sets.some((x) => x.weight) ? L('Erstes Mal – Werte aus deinem Plan.', 'First time – numbers from your plan.') : L('Erstes Mal – Startgewicht eintragen.', 'First time – enter a starting weight.')}</p>`}
        ${hint}
        ${t.notes ? `<p class="small note">${esc(noteText(t.notes))}</p>` : ''}
        <div class="sets">${rows}</div>
        <div class="row gap">
          <button class="btn ghost small" data-action="addSet" data-x="${xi}">+ ${L('Satz', 'Set')}</button>
          <button class="btn ghost small" data-action="removeSet" data-x="${xi}" ${ex.sets.length ? '' : 'disabled'}>− ${L('Satz', 'Set')}</button>
        </div>
      </section>`;
    })
    .join('');

  return `<div class="workout-head">
      <div><h2>${esc(s.dayName)}</h2><p class="muted small">${fmtDate(s.date)} · ${L(`seit ${mins} Min.`, `${mins} min`)}</p></div>
    </div>
    ${cards}
    <form class="card row gap" data-form="addSessionEx">
      <input id="add-ex-name" name="name" type="text" placeholder="${L('Übung hinzufügen', 'Add exercise')}" autocomplete="off" list="exercise-names">
      <button class="btn">+</button>
    </form>
    <datalist id="exercise-names">${allExerciseNames().map((n) => `<option value="${esc(exName(n))}">`).join('')}</datalist>
    <section class="card">
      <label class="field"><span>${L('Notizen zum Training', 'Workout notes')}</span>
        <textarea id="session-notes" rows="2" data-input="sessionNotes" placeholder="${L('Wie lief’s? Schlaf, Energie, Schmerzen …', 'How did it go? Sleep, energy, pain …')}">${esc(s.notes || '')}</textarea>
      </label>
    </section>
    <div class="row gap">
      <button class="btn ghost danger block" data-action="discardWorkout">${L('Verwerfen', 'Discard')}</button>
      <button class="btn primary block" data-action="finishWorkout">${L('Training beenden', 'Finish workout')}</button>
    </div>`;
}

function allExerciseNames() {
  const names = new Map();
  for (const d of state.plan.days) for (const e of d.exercises) if (e.name) names.set(normName(e.name), e.name);
  for (const s of state.sessions) for (const e of s.exercises) if (e.name) names.set(normName(e.name), e.name);
  return [...names.values()].sort((a, b) => a.localeCompare(b, locale()));
}

// --- Verlauf ---

export function renderHistory() {
  const sessions = [...state.sessions].sort((a, b) => (b.date + b.startedAt).localeCompare(a.date + a.startedAt));
  const list = sessions.length
    ? sessions
        .map((s) => {
          const sets = s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
          const dur = s.finishedAt ? Math.round((new Date(s.finishedAt) - new Date(s.startedAt)) / 60000) : null;
          return `<a class="list-item" href="#/session/${s.id}">
            <div><strong>${esc(s.dayName)}</strong><span class="muted small">${fmtDate(s.date, { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' })}</span></div>
            <div class="right small muted">${sets} ${L('Sätze', 'sets')}${dur ? ` · ${dur} min` : ''}<br>${fmtNum(sessionVolume(s) / 1000, 1)} t ${L('Volumen', 'volume')}</div>
          </a>`;
        })
        .join('')
    : `<p class="muted center">${L('Noch keine Trainings abgeschlossen.', 'No workouts completed yet.')}</p>`;

  const names = allExerciseNames().filter((n) => state.sessions.some((s) => s.exercises.some((e) => normName(e.name) === normName(n))));
  const exList = names.length
    ? `<section class="card"><h3>${L('Übungen', 'Exercises')}</h3><div class="chips">${names
        .map((n) => `<a class="chip" href="#/exercise/${encodeURIComponent(n)}">${esc(exName(n))}</a>`)
        .join('')}</div></section>`
    : '';

  const weekAgo = addDays(today(), -6);
  const thisWeek = state.sessions.filter((s) => s.date >= weekAgo).length;

  return `${subnav('history')}${activeBanner()}
    <div class="stats">
      <div class="stat"><span class="stat-value">${state.sessions.length}</span><span class="stat-label">${L('Trainings gesamt', 'Total workouts')}</span></div>
      <div class="stat"><span class="stat-value">${thisWeek}</span><span class="stat-label">${L('letzte 7 Tage', 'last 7 days')}</span></div>
    </div>
    ${exList}
    <div class="list">${list}</div>`;
}

export function renderSession(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return `<a class="back" href="#/history">← ${L('Verlauf', 'History')}</a><p>${L('Training nicht gefunden.', 'Workout not found.')}</p>`;
  const rows = s.exercises
    .filter((e) => e.sets.some((x) => x.done))
    .map((e) => {
      const best = Math.max(...e.sets.filter((x) => x.done).map((x) => e1rm(x.weight, x.reps)));
      return `<section class="card">
        <h3><a href="#/exercise/${encodeURIComponent(e.name)}">${esc(exName(e.name))}</a></h3>
        <table class="table"><tbody>
          ${e.sets.filter((x) => x.done).map((x, i) => `<tr><td class="muted">${i + 1}</td><td>${x.weight ? `${fmtNum(x.weight, 2)} kg` : L('Körpergewicht', 'Bodyweight')}</td><td>${x.reps ?? '?'} ${L('Wdh', 'reps')}</td></tr>`).join('')}
        </tbody></table>
        ${best ? `<p class="small muted">${L('Geschätztes 1RM', 'Estimated 1RM')}: ${fmtNum(best, 1)} kg</p>` : ''}
      </section>`;
    })
    .join('');
  return `<a class="back" href="#/history">← ${L('Verlauf', 'History')}</a>
    <h2>${esc(s.dayName)}</h2>
    <p class="muted">${fmtDate(s.date, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} · ${fmtNum(sessionVolume(s), 0)} kg ${L('Volumen', 'volume')}</p>
    ${s.notes ? `<section class="card"><p>${esc(s.notes)}</p></section>` : ''}
    ${rows}
    <button class="btn ghost danger block" data-action="deleteSession" data-id="${s.id}">${L('Training löschen', 'Delete workout')}</button>`;
}

export function renderExercise(name) {
  const key = normName(canonicalExName(name));
  const entries = state.sessions
    .map((s) => ({ s, e: s.exercises.find((e) => normName(e.name) === key) }))
    .filter((x) => x.e && x.e.sets.some((st) => st.done))
    .sort((a, b) => a.s.date.localeCompare(b.s.date));

  if (!entries.length) {
    return `<a class="back" href="#/history">← ${L('Verlauf', 'History')}</a><h2>${esc(exName(name))}</h2><p class="muted">${L('Noch keine Daten zu dieser Übung.', 'No data for this exercise yet.')}</p>`;
  }

  const points = entries.map(({ s, e }) => {
    const done = e.sets.filter((x) => x.done);
    return {
      date: s.date,
      e1rm: Math.max(...done.map((x) => e1rm(x.weight, x.reps))),
      top: Math.max(...done.map((x) => x.weight || 0)),
      reps: Math.max(...done.map((x) => x.reps || 0)),
      summary: setsSummary(e.sets),
      sessionId: s.id,
    };
  });
  const bodyweight = points.every((p) => p.top === 0);
  const best = Math.max(...points.map((p) => (bodyweight ? p.reps : p.e1rm)));
  const chart = bodyweight
    ? lineChart([{ points: points.map((p) => ({ date: p.date, y: p.reps })), cls: 'line-main', dots: true }], { unit: L('Wdh', 'reps'), digits: 0 })
    : lineChart(
        [
          { points: points.map((p) => ({ date: p.date, y: p.e1rm })), cls: 'line-main', dots: true },
          { points: points.map((p) => ({ date: p.date, y: p.top })), cls: 'line-soft', dots: true },
        ],
        { unit: 'kg' }
      );

  return `<a class="back" href="#/history">← ${L('Verlauf', 'History')}</a>
    <h2>${esc(exName(entries[entries.length - 1].e.name))}</h2>
    <section class="card">
      ${chart}
      ${bodyweight ? `<p class="legend"><span class="key main"></span>${L('Max. Wiederholungen', 'Max reps')}</p>` : `<p class="legend"><span class="key main"></span>${L('Geschätztes 1RM', 'Estimated 1RM')} <span class="key soft"></span>${L('Schwerstes Gewicht', 'Heaviest weight')}</p>`}
    </section>
    <div class="stats">
      <div class="stat"><span class="stat-value">${fmtNum(best, 1)}</span><span class="stat-label">${bodyweight ? L('Bestwert Wdh', 'Best reps') : L('Bestes 1RM (kg)', 'Best 1RM (kg)')}</span></div>
      <div class="stat"><span class="stat-value">${entries.length}</span><span class="stat-label">${L('Einheiten', 'Sessions')}</span></div>
    </div>
    <div class="list">
      ${[...points]
        .reverse()
        .map(
          (p) => `<a class="list-item" href="#/session/${p.sessionId}"><div><strong>${fmtDate(p.date)}</strong><span class="small muted">${esc(p.summary)}</span></div>
          <div class="right small">${bodyweight ? '' : `${fmtNum(p.e1rm, 1)} kg 1RM`}${(bodyweight ? p.reps : round(p.e1rm, 1)) === round(best, 1) ? ' <span class="pr">PR</span>' : ''}</div></a>`
        )
        .join('')}
    </div>`;
}

// --- Aktionen ---

function dayOf(el) {
  return findDay(el.dataset.day);
}

export const actions = {
  addDay() {
    const d = newDay({ exercises: [newExercise()] });
    state.plan.days.push(d);
    navigate(`#/plan/${d.id}`);
  },
  loadMyPlan() {
    const missing = missingPlanDays();
    state.plan.days.push(...missing);
    toast(L(`${missing.length} Trainingstage hinzugefügt`, `${missing.length} training days added`));
  },
  deleteDay(el) {
    const d = dayOf(el);
    if (!d || !confirm(L(`„${d.name}“ wirklich löschen? Bereits geloggte Trainings bleiben erhalten.`, `Really delete “${d.name}”? Logged workouts are kept.`))) return false;
    state.plan.days = state.plan.days.filter((x) => x.id !== d.id);
    navigate('#/training');
  },
  dayName(el) {
    const d = dayOf(el);
    if (d) d.name = el.value;
  },
  toggleWeekday(el) {
    const d = dayOf(el);
    const wd = Number(el.dataset.wd);
    d.weekdays = d.weekdays.includes(wd) ? d.weekdays.filter((x) => x !== wd) : [...d.weekdays, wd];
  },
  addEx(el) {
    const d = dayOf(el);
    d.exercises.push(newExercise());
    setTimeout(() => document.getElementById(`ex-${d.exercises[d.exercises.length - 1].id}-name`)?.focus(), 30);
  },
  deleteEx(el) {
    const d = dayOf(el);
    const ex = d.exercises.find((e) => e.id === el.dataset.ex);
    if (ex?.name && !confirm(L(`„${exName(ex.name)}“ aus dem Plan entfernen?`, `Remove “${exName(ex.name)}” from the plan?`))) return false;
    d.exercises = d.exercises.filter((e) => e.id !== el.dataset.ex);
  },
  moveEx(el) {
    const d = dayOf(el);
    const i = d.exercises.findIndex((e) => e.id === el.dataset.ex);
    const j = i + Number(el.dataset.dir);
    if (j < 0 || j >= d.exercises.length) return false;
    [d.exercises[i], d.exercises[j]] = [d.exercises[j], d.exercises[i]];
  },
  exField(el) {
    const d = dayOf(el);
    const ex = d?.exercises.find((e) => e.id === el.dataset.ex);
    if (!ex) return;
    const f = el.dataset.field;
    if (f === 'name') ex.name = canonicalExName(el.value);
    else if (f === 'notes') ex.notes = canonicalNote(el.value);
    else ex[f] = parseNum(el.value);
  },

  startWorkout(el) {
    if (state.activeSession && !confirm(L('Es läuft schon ein Training. Verwerfen und neu starten?', 'A workout is already in progress. Discard it and start a new one?'))) {
      navigate('#/workout');
      return false;
    }
    const day = el.dataset.day ? findDay(el.dataset.day) : null;
    state.activeSession = {
      id: uid(),
      date: today(),
      startedAt: new Date().toISOString(),
      dayId: day?.id ?? null,
      dayName: day?.name ?? L('Freies Training', 'Free workout'),
      exercises: day ? day.exercises.filter((e) => e.name).map(buildSessionExercise) : [],
      notes: '',
    };
    navigate('#/workout');
  },
  setField(el) {
    const set = state.activeSession?.exercises[el.dataset.x]?.sets[el.dataset.s];
    if (set) set[el.dataset.field] = parseNum(el.value);
  },
  toggleSet(el) {
    const ex = state.activeSession.exercises[el.dataset.x];
    const set = ex.sets[el.dataset.s];
    set.done = !set.done;
    if (set.done) {
      if (set.reps === null || set.reps === undefined) set.reps = ex.target?.repMin ?? null;
      const isLast = ex.sets.every((s) => s.done);
      // Pause 0 = Supersatz: kein Timer
      startRestTimer(ex.target?.rest ?? 90, isLast ? `${exName(ex.name)} ${L('fertig', 'done')}` : `${exName(ex.name)} · ${L('Satz', 'Set')} ${Number(el.dataset.s) + 2}`);
    }
  },
  addSet(el) {
    const ex = state.activeSession.exercises[el.dataset.x];
    const prev = ex.sets[ex.sets.length - 1];
    ex.sets.push({ weight: prev?.weight ?? null, reps: prev?.reps ?? ex.target?.repMin ?? null, done: false });
  },
  removeSet(el) {
    state.activeSession.exercises[el.dataset.x].sets.pop();
  },
  removeSessionEx(el) {
    const ex = state.activeSession.exercises[el.dataset.x];
    if (ex.sets.some((s) => s.done) && !confirm(L(`„${exName(ex.name)}“ samt erledigter Sätze entfernen?`, `Remove “${exName(ex.name)}” including completed sets?`))) return false;
    state.activeSession.exercises.splice(Number(el.dataset.x), 1);
  },
  addSessionEx(form) {
    // Übersetzte Namen wieder auf die gespeicherte Form bringen, damit der Verlauf zusammenbleibt
    const name = canonicalExName(form.elements.name.value.trim());
    if (!name) return false;
    // Falls die Übung im Plan existiert, Zielwerte übernehmen
    const planEx = state.plan.days.flatMap((d) => d.exercises).find((e) => normName(e.name) === normName(name));
    state.activeSession.exercises.push(buildSessionExercise(planEx || newExercise({ id: null, name })));
  },
  sessionNotes(el) {
    if (state.activeSession) state.activeSession.notes = el.value;
  },
  discardWorkout() {
    if (!confirm(L('Training verwerfen? Die Sätze werden nicht gespeichert.', 'Discard workout? The sets will not be saved.'))) return false;
    state.activeSession = null;
    navigate('#/training');
  },
  finishWorkout() {
    const s = state.activeSession;
    const doneSets = s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
    const openSets = s.exercises.reduce((n, e) => n + e.sets.filter((x) => !x.done).length, 0);
    if (!doneSets) {
      alert(L('Noch kein Satz abgehakt. Hake erledigte Sätze mit ✓ ab oder verwirf das Training.', 'No set checked off yet. Tick completed sets with ✓ or discard the workout.'));
      return false;
    }
    if (openSets && !confirm(L(`${openSets} Sätze sind nicht abgehakt und werden nicht gespeichert. Trotzdem beenden?`, `${openSets} sets are not checked off and won't be saved. Finish anyway?`))) return false;
    const finished = {
      id: s.id,
      date: s.date,
      startedAt: s.startedAt,
      finishedAt: new Date().toISOString(),
      dayId: s.dayId,
      dayName: s.dayName,
      notes: s.notes,
      exercises: s.exercises
        .map((e) => ({ exerciseId: e.exerciseId, name: e.name, sets: e.sets.filter((x) => x.done) }))
        .filter((e) => e.sets.length),
    };
    state.sessions.push(finished);
    state.activeSession = null;
    toast(L(`Stark! ${doneSets} Sätze gespeichert 💪`, `Nice! ${doneSets} sets saved 💪`));
    navigate(`#/session/${finished.id}`);
  },
  deleteSession(el) {
    if (!confirm(L('Dieses Training endgültig löschen?', 'Permanently delete this workout?'))) return false;
    state.sessions = state.sessions.filter((s) => s.id !== el.dataset.id);
    navigate('#/history');
  },
};
