import { state, findDay, lastPerformance, newDay, newExercise, exampleDays } from '../store.js';
import { suggestNext, e1rm, sessionVolume } from '../calc.js';
import { esc, uid, today, addDays, parseNum, fmtNum, fmtDate, fmtDateRelative, isoWeekday, WEEKDAYS_SHORT, normName, round, fmtInput } from '../util.js';
import { lineChart } from '../chart.js';
import { navigate, toast, startRestTimer } from '../app.js';

function subnav(active) {
  return `<nav class="subnav">
    <a href="#/training" class="${active === 'plan' ? 'active' : ''}">Plan</a>
    <a href="#/history" class="${active === 'history' ? 'active' : ''}">Verlauf</a>
  </nav>`;
}

function activeBanner() {
  const s = state.activeSession;
  if (!s) return '';
  const done = s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
  return `<a class="banner" href="#/workout">
    <strong>Training läuft: ${esc(s.dayName)}</strong>
    <span>${done} Sätze erledigt · fortsetzen →</span>
  </a>`;
}

function repRange(ex) {
  if (!ex.repMin && !ex.repMax) return '';
  if (!ex.repMax || ex.repMin === ex.repMax) return `${ex.repMin || ex.repMax}`;
  return `${ex.repMin || '?'}–${ex.repMax}`;
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
    .map((s) => (s.weight ? `${fmtNum(s.weight, 2)}×${s.reps ?? '?'}` : `${s.reps ?? '?'} Wdh`))
    .join(' · ');
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
          const wd = d.weekdays.length ? [...d.weekdays].sort().map((w) => WEEKDAYS_SHORT[w - 1]).join(', ') : 'kein fester Tag';
          const exList = d.exercises.length
            ? `<ul class="ex-mini">${d.exercises
                .map((e) => `<li><span>${esc(e.name || 'Ohne Namen')}</span><span class="muted">${e.sets || '?'} × ${repRange(e)}${e.weight ? ` · ${fmtNum(e.weight, 2)} kg` : ''}</span></li>`)
                .join('')}</ul>`
            : '<p class="muted">Noch keine Übungen.</p>';
          return `<section class="card">
            <div class="card-head">
              <div><h3>${esc(d.name)}</h3><p class="muted small">${wd}</p></div>
              <a class="btn ghost small" href="#/plan/${d.id}">Bearbeiten</a>
            </div>
            ${exList}
            <button class="btn primary block" data-action="startWorkout" data-day="${d.id}" ${d.exercises.length ? '' : 'disabled'}>Training starten</button>
          </section>`;
        })
        .join('')
    : `<section class="card empty">
        <h3>Noch kein Trainingsplan</h3>
        <p>Leg für jeden Trainingstag die Übungen mit Sätzen, Wiederholungs-Spanne und Startgewicht an. Beim Training werden dann die Werte vom letzten Mal vorausgefüllt.</p>
        <button class="btn ghost block" data-action="loadExample">Beispiel laden (Push/Pull zum Anpassen)</button>
      </section>`;

  return `${subnav('plan')}${activeBanner()}
    ${list}
    <div class="row gap">
      <button class="btn block" data-action="addDay">+ Trainingstag</button>
      <button class="btn ghost block" data-action="startWorkout" data-day="">Freies Training</button>
    </div>`;
}

export function renderDayEditor(id) {
  const d = findDay(id);
  if (!d) return `<p>Trainingstag nicht gefunden.</p><a href="#/training">Zurück</a>`;
  const wdButtons = WEEKDAYS_SHORT.map(
    (w, i) => `<button class="chip ${d.weekdays.includes(i + 1) ? 'on' : ''}" data-action="toggleWeekday" data-day="${d.id}" data-wd="${i + 1}">${w}</button>`
  ).join('');

  const exCards = d.exercises
    .map((e, i) => {
      const f = (field, label, attrs = '', value = e[field]) =>
        `<label class="field"><span>${label}</span><input id="ex-${e.id}-${field}" ${attrs} value="${esc(fmtInput(value))}" data-input="exField" data-day="${d.id}" data-ex="${e.id}" data-field="${field}"></label>`;
      return `<section class="card ex-edit">
        <div class="card-head">
          <strong class="muted">#${i + 1}</strong>
          <div class="row">
            <button class="icon-btn" data-action="moveEx" data-day="${d.id}" data-ex="${e.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">↑</button>
            <button class="icon-btn" data-action="moveEx" data-day="${d.id}" data-ex="${e.id}" data-dir="1" ${i === d.exercises.length - 1 ? 'disabled' : ''} aria-label="Nach unten">↓</button>
            <button class="icon-btn danger" data-action="deleteEx" data-day="${d.id}" data-ex="${e.id}" aria-label="Löschen">✕</button>
          </div>
        </div>
        ${f('name', 'Übung', 'type="text" placeholder="z. B. Kniebeugen" autocomplete="off"')}
        <div class="grid4">
          ${f('sets', 'Sätze', 'inputmode="numeric"')}
          ${f('repMin', 'Wdh von', 'inputmode="numeric"')}
          ${f('repMax', 'Wdh bis', 'inputmode="numeric"')}
          ${f('weight', 'kg', 'inputmode="decimal" placeholder="–"')}
        </div>
        <div class="grid2">
          ${f('rest', 'Pause (Sek.)', 'inputmode="numeric"')}
          ${f('notes', 'Notiz', 'type="text" placeholder="z. B. Sitz Stufe 4"')}
        </div>
      </section>`;
    })
    .join('');

  return `<a class="back" href="#/training">← Plan</a>
    <section class="card">
      <label class="field"><span>Name des Trainingstags</span>
        <input id="day-name" type="text" value="${esc(d.name)}" data-input="dayName" data-day="${d.id}" placeholder="z. B. Leg Day">
      </label>
      <p class="label">Wochentage</p>
      <div class="chips">${wdButtons}</div>
    </section>
    ${exCards || '<p class="muted center">Noch keine Übungen – füge die erste hinzu.</p>'}
    <button class="btn block" data-action="addEx" data-day="${d.id}">+ Übung hinzufügen</button>
    <div class="row gap mt">
      <button class="btn ghost danger block" data-action="deleteDay" data-day="${d.id}">Tag löschen</button>
      <a class="btn primary block" href="#/training">Fertig</a>
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
    return `${subnav('plan')}<section class="card empty"><h3>Kein laufendes Training</h3><p>Starte ein Training über deinen Plan.</p><a class="btn primary block" href="#/training">Zum Plan</a></section>`;
  }
  const mins = Math.round((Date.now() - new Date(s.startedAt).getTime()) / 60000);
  const cards = s.exercises
    .map((ex, xi) => {
      const t = ex.target || {};
      const hint = {
        increase: `<p class="hint up">↑ Letztes Mal alle Sätze geschafft – heute ${fmtNum(ex.hintWeight, 2)} kg</p>`,
        repeat: '<p class="hint">Gleiches Gewicht – versuch mindestens 1 Wdh mehr als letztes Mal</p>',
        'more-reps': '<p class="hint up">↑ Alle Sätze geschafft – heute mehr Wiederholungen oder Zusatzgewicht</p>',
      }[ex.hint] || '';
      const rows = ex.sets
        .map(
          (set, si) => `<div class="set-row ${set.done ? 'done' : ''}">
            <span class="set-no">${si + 1}</span>
            <label class="set-field"><input id="w-${xi}-${si}" inputmode="decimal" value="${esc(fmtInput(set.weight))}" placeholder="kg" data-input="setField" data-x="${xi}" data-s="${si}" data-field="weight"><span>kg</span></label>
            <label class="set-field"><input id="r-${xi}-${si}" inputmode="numeric" value="${esc(set.reps ?? '')}" placeholder="Wdh" data-input="setField" data-x="${xi}" data-s="${si}" data-field="reps"><span>Wdh</span></label>
            <button class="check ${set.done ? 'on' : ''}" data-action="toggleSet" data-x="${xi}" data-s="${si}" aria-label="Satz erledigt">✓</button>
          </div>`
        )
        .join('');
      const meta = [t.sets && `${t.sets} × ${repRange(t)}`, t.rest && `Pause ${fmtRest(t.rest)}`].filter(Boolean).join(' · ');
      return `<section class="card">
        <div class="card-head">
          <div>
            <h3><a href="#/exercise/${encodeURIComponent(ex.name)}">${esc(ex.name)}</a></h3>
            ${meta ? `<p class="muted small">${meta}</p>` : ''}
          </div>
          <button class="icon-btn danger" data-action="removeSessionEx" data-x="${xi}" aria-label="Übung entfernen">✕</button>
        </div>
        ${ex.last ? `<p class="small muted">Letztes Mal (${fmtDateRelative(ex.last.date)}): ${esc(ex.last.summary)}</p>` : '<p class="small muted">Erstes Mal – Startgewicht eintragen.</p>'}
        ${hint}
        ${t.notes ? `<p class="small note">${esc(t.notes)}</p>` : ''}
        <div class="sets">${rows}</div>
        <div class="row gap">
          <button class="btn ghost small" data-action="addSet" data-x="${xi}">+ Satz</button>
          <button class="btn ghost small" data-action="removeSet" data-x="${xi}" ${ex.sets.length ? '' : 'disabled'}>− Satz</button>
        </div>
      </section>`;
    })
    .join('');

  return `<div class="workout-head">
      <div><h2>${esc(s.dayName)}</h2><p class="muted small">${fmtDate(s.date)} · seit ${mins} Min.</p></div>
    </div>
    ${cards}
    <form class="card row gap" data-form="addSessionEx">
      <input id="add-ex-name" name="name" type="text" placeholder="Übung hinzufügen" autocomplete="off" list="exercise-names">
      <button class="btn">+</button>
    </form>
    <datalist id="exercise-names">${allExerciseNames().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <section class="card">
      <label class="field"><span>Notizen zum Training</span>
        <textarea id="session-notes" rows="2" data-input="sessionNotes" placeholder="Wie lief’s? Schlaf, Energie, Schmerzen …">${esc(s.notes || '')}</textarea>
      </label>
    </section>
    <div class="row gap">
      <button class="btn ghost danger block" data-action="discardWorkout">Verwerfen</button>
      <button class="btn primary block" data-action="finishWorkout">Training beenden</button>
    </div>`;
}

function allExerciseNames() {
  const names = new Map();
  for (const d of state.plan.days) for (const e of d.exercises) if (e.name) names.set(normName(e.name), e.name);
  for (const s of state.sessions) for (const e of s.exercises) if (e.name) names.set(normName(e.name), e.name);
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'de'));
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
            <div class="right small muted">${sets} Sätze${dur ? ` · ${dur} Min.` : ''}<br>${fmtNum(sessionVolume(s) / 1000, 1)} t Volumen</div>
          </a>`;
        })
        .join('')
    : '<p class="muted center">Noch keine Trainings abgeschlossen.</p>';

  const names = allExerciseNames().filter((n) => state.sessions.some((s) => s.exercises.some((e) => normName(e.name) === normName(n))));
  const exList = names.length
    ? `<section class="card"><h3>Übungen</h3><div class="chips">${names
        .map((n) => `<a class="chip" href="#/exercise/${encodeURIComponent(n)}">${esc(n)}</a>`)
        .join('')}</div></section>`
    : '';

  const weekAgo = addDays(today(), -6);
  const thisWeek = state.sessions.filter((s) => s.date >= weekAgo).length;

  return `${subnav('history')}${activeBanner()}
    <div class="stats">
      <div class="stat"><span class="stat-value">${state.sessions.length}</span><span class="stat-label">Trainings gesamt</span></div>
      <div class="stat"><span class="stat-value">${thisWeek}</span><span class="stat-label">letzte 7 Tage</span></div>
    </div>
    ${exList}
    <div class="list">${list}</div>`;
}

export function renderSession(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return `<a class="back" href="#/history">← Verlauf</a><p>Training nicht gefunden.</p>`;
  const rows = s.exercises
    .filter((e) => e.sets.some((x) => x.done))
    .map((e) => {
      const best = Math.max(...e.sets.filter((x) => x.done).map((x) => e1rm(x.weight, x.reps)));
      return `<section class="card">
        <h3><a href="#/exercise/${encodeURIComponent(e.name)}">${esc(e.name)}</a></h3>
        <table class="table"><tbody>
          ${e.sets.filter((x) => x.done).map((x, i) => `<tr><td class="muted">${i + 1}</td><td>${x.weight ? `${fmtNum(x.weight, 2)} kg` : 'Körpergewicht'}</td><td>${x.reps ?? '?'} Wdh</td></tr>`).join('')}
        </tbody></table>
        ${best ? `<p class="small muted">Geschätztes 1RM: ${fmtNum(best, 1)} kg</p>` : ''}
      </section>`;
    })
    .join('');
  return `<a class="back" href="#/history">← Verlauf</a>
    <h2>${esc(s.dayName)}</h2>
    <p class="muted">${fmtDate(s.date, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} · ${fmtNum(sessionVolume(s), 0)} kg Volumen</p>
    ${s.notes ? `<section class="card"><p>${esc(s.notes)}</p></section>` : ''}
    ${rows}
    <button class="btn ghost danger block" data-action="deleteSession" data-id="${s.id}">Training löschen</button>`;
}

export function renderExercise(name) {
  const key = normName(name);
  const entries = state.sessions
    .map((s) => ({ s, e: s.exercises.find((e) => normName(e.name) === key) }))
    .filter((x) => x.e && x.e.sets.some((st) => st.done))
    .sort((a, b) => a.s.date.localeCompare(b.s.date));

  if (!entries.length) {
    return `<a class="back" href="#/history">← Verlauf</a><h2>${esc(name)}</h2><p class="muted">Noch keine Daten zu dieser Übung.</p>`;
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
    ? lineChart([{ points: points.map((p) => ({ date: p.date, y: p.reps })), cls: 'line-main', dots: true }], { unit: 'Wdh', digits: 0 })
    : lineChart(
        [
          { points: points.map((p) => ({ date: p.date, y: p.e1rm })), cls: 'line-main', dots: true },
          { points: points.map((p) => ({ date: p.date, y: p.top })), cls: 'line-soft', dots: true },
        ],
        { unit: 'kg' }
      );

  return `<a class="back" href="#/history">← Verlauf</a>
    <h2>${esc(entries[entries.length - 1].e.name)}</h2>
    <section class="card">
      ${chart}
      ${bodyweight ? '<p class="legend"><span class="key main"></span>Max. Wiederholungen</p>' : '<p class="legend"><span class="key main"></span>Geschätztes 1RM <span class="key soft"></span>Schwerstes Gewicht</p>'}
    </section>
    <div class="stats">
      <div class="stat"><span class="stat-value">${fmtNum(best, 1)}</span><span class="stat-label">${bodyweight ? 'Bestwert Wdh' : 'Bestes 1RM (kg)'}</span></div>
      <div class="stat"><span class="stat-value">${entries.length}</span><span class="stat-label">Einheiten</span></div>
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
  loadExample() {
    state.plan.days.push(...exampleDays());
    toast('Beispielplan geladen – Gewichte und Übungen anpassen');
  },
  deleteDay(el) {
    const d = dayOf(el);
    if (!d || !confirm(`„${d.name}“ wirklich löschen? Bereits geloggte Trainings bleiben erhalten.`)) return false;
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
    if (ex?.name && !confirm(`„${ex.name}“ aus dem Plan entfernen?`)) return false;
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
    ex[f] = f === 'name' || f === 'notes' ? el.value : parseNum(el.value);
  },

  startWorkout(el) {
    if (state.activeSession && !confirm('Es läuft schon ein Training. Verwerfen und neu starten?')) {
      navigate('#/workout');
      return false;
    }
    const day = el.dataset.day ? findDay(el.dataset.day) : null;
    state.activeSession = {
      id: uid(),
      date: today(),
      startedAt: new Date().toISOString(),
      dayId: day?.id ?? null,
      dayName: day?.name ?? 'Freies Training',
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
      startRestTimer(ex.target?.rest || 90, isLast ? `${ex.name} fertig` : `${ex.name} · Satz ${Number(el.dataset.s) + 2}`);
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
    if (ex.sets.some((s) => s.done) && !confirm(`„${ex.name}“ samt erledigter Sätze entfernen?`)) return false;
    state.activeSession.exercises.splice(Number(el.dataset.x), 1);
  },
  addSessionEx(form) {
    const name = form.elements.name.value.trim();
    if (!name) return false;
    // Falls die Übung im Plan existiert, Zielwerte übernehmen
    const planEx = state.plan.days.flatMap((d) => d.exercises).find((e) => normName(e.name) === normName(name));
    state.activeSession.exercises.push(buildSessionExercise(planEx || newExercise({ id: null, name })));
  },
  sessionNotes(el) {
    if (state.activeSession) state.activeSession.notes = el.value;
  },
  discardWorkout() {
    if (!confirm('Training verwerfen? Die Sätze werden nicht gespeichert.')) return false;
    state.activeSession = null;
    navigate('#/training');
  },
  finishWorkout() {
    const s = state.activeSession;
    const doneSets = s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
    const openSets = s.exercises.reduce((n, e) => n + e.sets.filter((x) => !x.done).length, 0);
    if (!doneSets) {
      alert('Noch kein Satz abgehakt. Hake erledigte Sätze mit ✓ ab oder verwirf das Training.');
      return false;
    }
    if (openSets && !confirm(`${openSets} Sätze sind nicht abgehakt und werden nicht gespeichert. Trotzdem beenden?`)) return false;
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
    toast(`Stark! ${doneSets} Sätze gespeichert 💪`);
    navigate(`#/session/${finished.id}`);
  },
  deleteSession(el) {
    if (!confirm('Dieses Training endgültig löschen?')) return false;
    state.sessions = state.sessions.filter((s) => s.id !== el.dataset.id);
    navigate('#/history');
  },
};
