import { state, currentWeightKg, latestWeight, intakeByDay } from '../store.js';
import { ACTIVITY_LEVELS, GOALS, computeTargets, analyzeAdaptive } from '../calc.js';
import { esc, today, addDays, parseNum, fmtNum, fmtSigned, fmtDate, daysBetween, round, fmtInput } from '../util.js';
import { toast } from '../app.js';

// Heute ist meist noch nicht fertig geloggt → Analyse endet gestern.
export function adaptiveAnalysis(targets) {
  if (!targets) return null;
  return analyzeAdaptive({
    weights: state.weights,
    intakeByDay: intakeByDay(),
    endDate: addDays(today(), -1),
    windowDays: state.settings.adaptiveWindow,
    currentTdee: targets.tdee,
    ratePct: state.goal.ratePct,
  });
}

export function lastAdjustment() {
  const a = state.goal.adjustments;
  return a.length ? a[a.length - 1] : null;
}

function rateLabel(r) {
  if (r === 0) return 'Gewicht halten (0 %)';
  return `${fmtSigned(r, 2)} % pro Woche`;
}

export function render() {
  const p = state.profile;
  const g = state.goal;
  const w = currentWeightKg();
  const lw = latestWeight();
  const targets = w ? computeTargets(p, g, w) : null;
  const goalDef = GOALS[g.type];

  const num = (id, field, label, attrs, value) => `<label class="field"><span>${label}</span>
    <input id="${id}" ${attrs} value="${esc(fmtInput(value))}" data-change="profileField" data-field="${field}"></label>`;

  const profile = `<section class="card">
    <h3>Profil</h3>
    <div class="seg">
      <button class="${p.sex === 'm' ? 'on' : ''}" data-action="setSex" data-sex="m">Männlich</button>
      <button class="${p.sex === 'f' ? 'on' : ''}" data-action="setSex" data-sex="f">Weiblich</button>
    </div>
    <div class="grid3">
      ${num('p-age', 'age', 'Alter', 'inputmode="numeric"', p.age)}
      ${num('p-height', 'heightCm', 'Größe (cm)', 'inputmode="numeric"', p.heightCm)}
      ${lw ? `<label class="field"><span>Gewicht</span><input value="${fmtNum(lw.kg, 1)} kg" disabled></label>` : num('p-weight', 'weightKg', 'Gewicht (kg)', 'inputmode="decimal"', p.weightKg)}
    </div>
    ${lw ? `<p class="small muted">Gewicht kommt automatisch aus deinem letzten Eintrag (${fmtDate(lw.date)}).</p>` : ''}
    ${num('p-bf', 'bodyFat', 'Körperfett % (optional – genauer, wenn bekannt)', 'inputmode="decimal" placeholder="z. B. 18"', p.bodyFat)}
    <label class="field"><span>Aktivität (inkl. Training)</span>
      <select id="p-activity" data-change="profileField" data-field="activity">
        ${ACTIVITY_LEVELS.map((a) => `<option value="${a.value}" ${a.value === p.activity ? 'selected' : ''}>${a.label} – ${a.hint}</option>`).join('')}
      </select>
    </label>
  </section>`;

  const goalCards = Object.entries(GOALS)
    .map(([key, def]) => `<button class="goal-card ${g.type === key ? 'on' : ''}" data-action="setGoal" data-goal="${key}">
        <strong>${def.label}</strong><span>${def.description}</span>
      </button>`)
    .join('');

  const rates = [...new Set([...goalDef.rates, g.ratePct])].sort((a, b) => a - b);
  const kgWeek = w ? (g.ratePct / 100) * w : null;
  const goalSection = `<section class="card">
    <h3>Ziel</h3>
    <div class="goal-cards">${goalCards}</div>
    ${goalDef.rates.length > 1 ? `<label class="field"><span>Tempo</span>
      <select id="g-rate" data-change="goalField" data-field="ratePct">
        ${rates.map((r) => `<option value="${r}" ${r === g.ratePct ? 'selected' : ''}>${rateLabel(r)}${w && r ? ` ≈ ${fmtSigned((r / 100) * w, 2)} kg` : ''}</option>`).join('')}
      </select></label>` : ''}
    <div class="grid2">
      <label class="field"><span>Protein (g pro kg)</span><input id="g-protein" inputmode="decimal" value="${esc(fmtInput(g.proteinPerKg))}" data-change="goalField" data-field="proteinPerKg"></label>
      <label class="field"><span>Fett (g pro kg)</span><input id="g-fat" inputmode="decimal" value="${esc(fmtInput(g.fatPerKg))}" data-change="goalField" data-field="fatPerKg"></label>
    </div>
    ${g.type === 'cut' ? '<p class="small muted">Für Muskelerhalt in der Diät zählen vor allem: genug Protein (1,8–2,4 g/kg), weiter schwer trainieren und das Defizit nicht übertreiben.</p>' : ''}
    ${g.type === 'bulk' ? '<p class="small muted">Wenn du schneller zunimmst als geplant, ist das meist Fett – die Anpassung unten senkt dann die Kalorien.</p>' : ''}
  </section>`;

  let result;
  if (!targets) {
    result = `<section class="card empty"><h3>Bedarf berechnen</h3><p>Trag Alter, Größe und Gewicht ein (oder wieg dich unter „Gewicht“), dann wird dein Kalorien- und Makroziel berechnet.</p></section>`;
  } else {
    result = `<section class="card result">
      <h3>Dein Tagesziel</h3>
      <div class="kcal-target"><span class="big">${fmtNum(targets.kcal, 0)}</span> kcal</div>
      <div class="macro-pills">
        <span class="pill p">${targets.protein} g Protein</span>
        <span class="pill c">${targets.carbs} g KH</span>
        <span class="pill f">${targets.fat} g Fett</span>
      </div>
      <table class="table small">
        <tr><td>Grundumsatz (${esc(targets.bmrMethod)})</td><td class="right">${fmtNum(targets.bmr, 0)} kcal</td></tr>
        <tr><td>Verbrauch laut Formel</td><td class="right">${fmtNum(targets.formulaTdee, 0)} kcal</td></tr>
        ${targets.adaptive ? `<tr><td><strong>Verbrauch laut deinen Daten</strong></td><td class="right"><strong>${fmtNum(targets.tdee, 0)} kcal</strong></td></tr>` : ''}
        <tr><td>${targets.delta < 0 ? 'Defizit' : targets.delta > 0 ? 'Überschuss' : 'Differenz'} für ${fmtSigned(kgWeek, 2)} kg/Woche</td><td class="right">${fmtSigned(targets.delta, 0)} kcal</td></tr>
      </table>
      ${targets.warnings.map((x) => `<p class="warn">${esc(x)}</p>`).join('')}
    </section>`;
  }

  return profile + goalSection + result + (targets ? renderAdaptive(targets) : '');
}

function renderAdaptive(targets) {
  const a = adaptiveAnalysis(targets);
  const g = state.goal;
  const last = lastAdjustment();
  const sinceLast = last ? daysBetween(last.date, today()) : null;

  let body;
  if (!a.ok) {
    body = `<p>Damit die App deinen <em>echten</em> Verbrauch berechnen kann, braucht sie Daten aus den letzten ${a.windowDays} Tagen:</p>
      <ul class="issues">${a.issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      <p class="small muted">Bis dahin gilt der Formelwert. Formeln liegen bei vielen Menschen 10–15 % daneben – deshalb lohnt sich das Loggen.</p>`;
  } else {
    const newKcal = computeTargets(state.profile, { ...g, adaptiveTdee: a.suggestedTdee }, currentWeightKg()).kcal;
    const behind = a.actualKgPerWeek - a.targetKgPerWeek; // >0: nimmt mehr zu / weniger ab als geplant
    let verdict;
    if (!a.worthChanging) verdict = '<p class="ok">Passt – dein Gewicht entwickelt sich wie geplant. Keine Anpassung nötig.</p>';
    else if (behind > 0) verdict = `<p class="warn">Du ${g.ratePct < 0 ? 'nimmst langsamer ab' : g.ratePct > 0 ? 'nimmst schneller zu' : 'nimmst zu'} als geplant – dein tatsächlicher Verbrauch ist niedriger als angenommen.</p>`;
    else verdict = `<p class="warn">Du ${g.ratePct > 0 ? 'nimmst langsamer zu' : g.ratePct < 0 ? 'nimmst schneller ab' : 'nimmst ab'} als geplant – dein tatsächlicher Verbrauch ist höher als angenommen.</p>`;

    body = `<table class="table small">
        <tr><td>Ø gegessen (${a.loggedDays} Tage geloggt)</td><td class="right">${fmtNum(a.avgIntake, 0)} kcal</td></tr>
        <tr><td>Gewichtstrend (${a.trend.count} Wiegungen)</td><td class="right">${fmtSigned(a.actualKgPerWeek, 2)} kg/Woche</td></tr>
        <tr><td>Geplant</td><td class="right">${fmtSigned(a.targetKgPerWeek, 2)} kg/Woche</td></tr>
        <tr><td>Echter Verbrauch (errechnet)</td><td class="right">${fmtNum(a.observedTdee, 0)} kcal</td></tr>
        <tr><td>Aktuell angenommen</td><td class="right">${fmtNum(a.currentTdee, 0)} kcal</td></tr>
      </table>
      ${verdict}
      ${a.worthChanging ? `<div class="suggest">
          <p>Neues Tagesziel: <strong>${fmtNum(newKcal, 0)} kcal</strong> (${fmtSigned(newKcal - targets.kcal, 0)} kcal)</p>
          ${a.capped ? `<p class="small muted">Die Änderung ist auf ±300 kcal pro Check-in begrenzt, damit Wasserschwankungen nicht zu Überreaktionen führen. Bleibt die Abweichung, korrigiert der nächste Check-in weiter.</p>` : ''}
          ${sinceLast !== null && sinceLast < 7 ? `<p class="small muted">Letzte Anpassung vor ${sinceLast} Tagen – ideal ist etwa 1× pro Woche, damit die neuen Kalorien wirken können.</p>` : ''}
          <button class="btn primary block" data-action="applyAdaptive" data-tdee="${a.suggestedTdee}" data-observed="${round(a.observedTdee)}">Anpassung übernehmen</button>
        </div>` : ''}
      ${g.startDate && daysBetween(g.startDate, today()) < 14 && g.ratePct < 0 ? '<p class="small muted">Hinweis: In den ersten 1–2 Diätwochen verliert man oft viel Wasser (weniger Kohlenhydrate/Salz). Der Trend kann deshalb anfangs zu schnell aussehen.</p>' : ''}`;
  }

  const history = g.adjustments.length
    ? `<details><summary>Bisherige Anpassungen (${g.adjustments.length})</summary>
        <table class="table small">${[...g.adjustments]
          .reverse()
          .map((x) => `<tr><td>${fmtDate(x.date)}</td><td class="right">${fmtNum(x.from, 0)} → ${fmtNum(x.to, 0)} kcal Verbrauch</td></tr>`)
          .join('')}</table>
      </details>`
    : '';

  return `<section class="card">
    <h3>Automatische Anpassung</h3>
    <p class="small muted">Vergleicht, was du gegessen hast, mit deinem Gewichtstrend der letzten ${a.windowDays} Tage. Isst du z. B. dein Ziel, aber das Gewicht bewegt sich nicht, wird dein Ziel nach unten korrigiert.</p>
    ${body}
    ${targets.adaptive ? '<button class="btn ghost small" data-action="resetAdaptive">Auf Formelwert zurücksetzen</button>' : ''}
    ${history}
  </section>`;
}

export const actions = {
  setSex(el) {
    state.profile.sex = el.dataset.sex;
  },
  profileField(el) {
    const f = el.dataset.field;
    const v = parseNum(el.value);
    state.profile[f] = v;
  },
  setGoal(el) {
    const key = el.dataset.goal;
    const def = GOALS[key];
    if (state.goal.type === key) return false;
    Object.assign(state.goal, {
      type: key,
      ratePct: def.defaultRate,
      proteinPerKg: def.proteinPerKg,
      fatPerKg: def.fatPerKg,
      startDate: today(),
    });
  },
  goalField(el) {
    const v = parseNum(el.value);
    if (v === null) return;
    state.goal[el.dataset.field] = v;
  },
  applyAdaptive(el) {
    const to = Number(el.dataset.tdee);
    const targets = computeTargets(state.profile, state.goal, currentWeightKg());
    state.goal.adjustments.push({ date: today(), from: round(targets.tdee), to, observed: Number(el.dataset.observed) });
    state.goal.adaptiveTdee = to;
    toast('Kalorienziel angepasst');
  },
  resetAdaptive() {
    if (!confirm('Den aus deinen Daten errechneten Verbrauch verwerfen und wieder die Formel nutzen?')) return false;
    state.goal.adaptiveTdee = null;
  },
};
