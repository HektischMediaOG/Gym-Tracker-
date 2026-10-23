import { state, currentWeightKg, latestWeight, intakeByDay } from '../store.js';
import { ACTIVITY_LEVELS, GOALS, computeTargets, analyzeAdaptive } from '../calc.js';
import { esc, today, addDays, parseNum, fmtNum, fmtSigned, fmtDate, daysBetween, round, fmtInput } from '../util.js';
import { toast } from '../app.js';
import { L } from '../i18n.js';

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
  if (r === 0) return L('Gewicht halten (0 %)', 'Maintain weight (0%)');
  return L(`${fmtSigned(r, 2)} % pro Woche`, `${fmtSigned(r, 2)}% per week`);
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
    <h3>${L('Profil', 'Profile')}</h3>
    <div class="seg">
      <button class="${p.sex === 'm' ? 'on' : ''}" data-action="setSex" data-sex="m">${L('Männlich', 'Male')}</button>
      <button class="${p.sex === 'f' ? 'on' : ''}" data-action="setSex" data-sex="f">${L('Weiblich', 'Female')}</button>
    </div>
    <div class="grid3">
      ${num('p-age', 'age', L('Alter', 'Age'), 'inputmode="numeric"', p.age)}
      ${num('p-height', 'heightCm', L('Größe (cm)', 'Height (cm)'), 'inputmode="numeric"', p.heightCm)}
      ${lw ? `<label class="field"><span>${L('Gewicht', 'Weight')}</span><input value="${fmtNum(lw.kg, 1)} kg" disabled></label>` : num('p-weight', 'weightKg', L('Gewicht (kg)', 'Weight (kg)'), 'inputmode="decimal"', p.weightKg)}
    </div>
    ${lw ? `<p class="small muted">${L(`Gewicht kommt automatisch aus deinem letzten Eintrag (${fmtDate(lw.date)}).`, `Weight is taken from your latest entry (${fmtDate(lw.date)}).`)}</p>` : ''}
    ${num('p-bf', 'bodyFat', L('Körperfett % (optional – genauer, wenn bekannt)', 'Body fat % (optional – more accurate if known)'), `inputmode="decimal" placeholder="${L('z. B. 18', 'e.g. 18')}"`, p.bodyFat)}
    <label class="field"><span>${L('Aktivität (inkl. Training)', 'Activity (incl. training)')}</span>
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
    <h3>${L('Ziel', 'Goal')}</h3>
    <div class="goal-cards">${goalCards}</div>
    ${goalDef.rates.length > 1 ? `<label class="field"><span>${L('Tempo', 'Pace')}</span>
      <select id="g-rate" data-change="goalField" data-field="ratePct">
        ${rates.map((r) => `<option value="${r}" ${r === g.ratePct ? 'selected' : ''}>${rateLabel(r)}${w && r ? ` ≈ ${fmtSigned((r / 100) * w, 2)} kg` : ''}</option>`).join('')}
      </select></label>` : ''}
    <div class="grid2">
      <label class="field"><span>${L('Protein (g pro kg)', 'Protein (g per kg)')}</span><input id="g-protein" inputmode="decimal" value="${esc(fmtInput(g.proteinPerKg))}" data-change="goalField" data-field="proteinPerKg"></label>
      <label class="field"><span>${L('Fett (g pro kg)', 'Fat (g per kg)')}</span><input id="g-fat" inputmode="decimal" value="${esc(fmtInput(g.fatPerKg))}" data-change="goalField" data-field="fatPerKg"></label>
    </div>
    ${g.type === 'cut' ? `<p class="small muted">${L('Für Muskelerhalt in der Diät zählen vor allem: genug Protein (1,8–2,4 g/kg), weiter schwer trainieren und das Defizit nicht übertreiben.', 'To keep muscle while cutting, what matters most: enough protein (1.8–2.4 g/kg), keep training heavy and don’t overdo the deficit.')}</p>` : ''}
    ${g.type === 'bulk' ? `<p class="small muted">${L('Wenn du schneller zunimmst als geplant, ist das meist Fett – die Anpassung unten senkt dann die Kalorien.', 'If you gain faster than planned, it is mostly fat – the adjustment below then lowers your calories.')}</p>` : ''}
  </section>`;

  let result;
  if (!targets) {
    result = `<section class="card empty"><h3>${L('Bedarf berechnen', 'Calculate your needs')}</h3><p>${L('Trag Alter, Größe und Gewicht ein (oder wieg dich unter „Gewicht“), dann wird dein Kalorien- und Makroziel berechnet.', 'Enter age, height and weight (or log a weigh-in under “Weight”) to calculate your calorie and macro targets.')}</p></section>`;
  } else {
    const deltaLabel = targets.delta < 0 ? L('Defizit', 'Deficit') : targets.delta > 0 ? L('Überschuss', 'Surplus') : L('Differenz', 'Difference');
    result = `<section class="card result">
      <h3>${L('Dein Tagesziel', 'Your daily target')}</h3>
      <div class="kcal-target"><span class="big">${fmtNum(targets.kcal, 0)}</span> kcal</div>
      <div class="macro-pills">
        <span class="pill p">${targets.protein} g Protein</span>
        <span class="pill c">${targets.carbs} g ${L('KH', 'carbs')}</span>
        <span class="pill f">${targets.fat} g ${L('Fett', 'fat')}</span>
      </div>
      <table class="table small">
        <tr><td>${L('Grundumsatz', 'BMR')} (${esc(targets.bmrMethod)})</td><td class="right">${fmtNum(targets.bmr, 0)} kcal</td></tr>
        <tr><td>${L('Verbrauch laut Formel', 'Expenditure (formula)')}</td><td class="right">${fmtNum(targets.formulaTdee, 0)} kcal</td></tr>
        ${targets.adaptive ? `<tr><td><strong>${L('Verbrauch laut deinen Daten', 'Expenditure (your data)')}</strong></td><td class="right"><strong>${fmtNum(targets.tdee, 0)} kcal</strong></td></tr>` : ''}
        <tr><td>${deltaLabel} ${L('für', 'for')} ${fmtSigned(kgWeek, 2)} ${L('kg/Woche', 'kg/week')}</td><td class="right">${fmtSigned(targets.delta, 0)} kcal</td></tr>
      </table>
      ${targets.warnings.map((x) => `<p class="warn">${esc(x)}</p>`).join('')}
    </section>`;
  }

  return profile + goalSection + result + (targets ? renderAdaptive(targets) : '');
}

function verdictText(g, behind) {
  if (behind > 0) {
    if (g.ratePct < 0) return L('Du nimmst langsamer ab als geplant', 'You are losing slower than planned');
    if (g.ratePct > 0) return L('Du nimmst schneller zu als geplant', 'You are gaining faster than planned');
    return L('Du nimmst zu, obwohl du halten willst', 'You are gaining although you want to maintain');
  }
  if (g.ratePct > 0) return L('Du nimmst langsamer zu als geplant', 'You are gaining slower than planned');
  if (g.ratePct < 0) return L('Du nimmst schneller ab als geplant', 'You are losing faster than planned');
  return L('Du nimmst ab, obwohl du halten willst', 'You are losing although you want to maintain');
}

function renderAdaptive(targets) {
  const a = adaptiveAnalysis(targets);
  const g = state.goal;
  const last = lastAdjustment();
  const sinceLast = last ? daysBetween(last.date, today()) : null;

  let body;
  if (!a.ok) {
    body = `<p>${L(`Damit die App deinen <em>echten</em> Verbrauch berechnen kann, braucht sie Daten aus den letzten ${a.windowDays} Tagen:`, `To calculate your <em>real</em> expenditure, the app needs data from the last ${a.windowDays} days:`)}</p>
      <ul class="issues">${a.issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      <p class="small muted">${L('Bis dahin gilt der Formelwert. Formeln liegen bei vielen Menschen 10–15 % daneben – deshalb lohnt sich das Loggen.', 'Until then the formula value applies. Formulas are off by 10–15% for many people – that’s why logging pays off.')}</p>`;
  } else {
    const newKcal = computeTargets(state.profile, { ...g, adaptiveTdee: a.suggestedTdee }, currentWeightKg()).kcal;
    const behind = a.actualKgPerWeek - a.targetKgPerWeek; // >0: nimmt mehr zu / weniger ab als geplant
    let verdict;
    if (!a.worthChanging) verdict = `<p class="ok">${L('Passt – dein Gewicht entwickelt sich wie geplant. Keine Anpassung nötig.', 'On track – your weight is moving as planned. No adjustment needed.')}</p>`;
    else if (behind > 0) verdict = `<p class="warn">${verdictText(g, behind)} – ${L('dein tatsächlicher Verbrauch ist niedriger als angenommen.', 'your actual expenditure is lower than assumed.')}</p>`;
    else verdict = `<p class="warn">${verdictText(g, behind)} – ${L('dein tatsächlicher Verbrauch ist höher als angenommen.', 'your actual expenditure is higher than assumed.')}</p>`;

    body = `<table class="table small">
        <tr><td>${L(`Ø gegessen (${a.loggedDays} Tage geloggt)`, `Avg. intake (${a.loggedDays} days logged)`)}</td><td class="right">${fmtNum(a.avgIntake, 0)} kcal</td></tr>
        <tr><td>${L(`Gewichtstrend (${a.trend.count} Wiegungen)`, `Weight trend (${a.trend.count} weigh-ins)`)}</td><td class="right">${fmtSigned(a.actualKgPerWeek, 2)} ${L('kg/Woche', 'kg/week')}</td></tr>
        <tr><td>${L('Geplant', 'Planned')}</td><td class="right">${fmtSigned(a.targetKgPerWeek, 2)} ${L('kg/Woche', 'kg/week')}</td></tr>
        <tr><td>${L('Echter Verbrauch (errechnet)', 'Real expenditure (calculated)')}</td><td class="right">${fmtNum(a.observedTdee, 0)} kcal</td></tr>
        <tr><td>${L('Aktuell angenommen', 'Currently assumed')}</td><td class="right">${fmtNum(a.currentTdee, 0)} kcal</td></tr>
      </table>
      ${verdict}
      ${a.worthChanging ? `<div class="suggest">
          <p>${L('Neues Tagesziel', 'New daily target')}: <strong>${fmtNum(newKcal, 0)} kcal</strong> (${fmtSigned(newKcal - targets.kcal, 0)} kcal)</p>
          ${a.capped ? `<p class="small muted">${L('Die Änderung ist auf ±300 kcal pro Check-in begrenzt, damit Wasserschwankungen nicht zu Überreaktionen führen. Bleibt die Abweichung, korrigiert der nächste Check-in weiter.', 'Changes are capped at ±300 kcal per check-in so water swings don’t cause overreactions. If the gap persists, the next check-in corrects further.')}</p>` : ''}
          ${sinceLast !== null && sinceLast < 7 ? `<p class="small muted">${L(`Letzte Anpassung vor ${sinceLast} Tagen – ideal ist etwa 1× pro Woche, damit die neuen Kalorien wirken können.`, `Last adjustment ${sinceLast} days ago – about once a week is ideal so the new calories can take effect.`)}</p>` : ''}
          <button class="btn primary block" data-action="applyAdaptive" data-tdee="${a.suggestedTdee}" data-observed="${round(a.observedTdee)}">${L('Anpassung übernehmen', 'Apply adjustment')}</button>
        </div>` : ''}
      ${g.startDate && daysBetween(g.startDate, today()) < 14 && g.ratePct < 0 ? `<p class="small muted">${L('Hinweis: In den ersten 1–2 Diätwochen verliert man oft viel Wasser (weniger Kohlenhydrate/Salz). Der Trend kann deshalb anfangs zu schnell aussehen.', 'Note: in the first 1–2 weeks of a cut you often lose a lot of water (fewer carbs/less salt), so the trend may look too fast at first.')}</p>` : ''}`;
  }

  const history = g.adjustments.length
    ? `<details><summary>${L('Bisherige Anpassungen', 'Previous adjustments')} (${g.adjustments.length})</summary>
        <table class="table small">${[...g.adjustments]
          .reverse()
          .map((x) => `<tr><td>${fmtDate(x.date)}</td><td class="right">${fmtNum(x.from, 0)} → ${fmtNum(x.to, 0)} kcal ${L('Verbrauch', 'expenditure')}</td></tr>`)
          .join('')}</table>
      </details>`
    : '';

  return `<section class="card">
    <h3>${L('Automatische Anpassung', 'Automatic adjustment')}</h3>
    <p class="small muted">${L(`Vergleicht, was du gegessen hast, mit deinem Gewichtstrend der letzten ${a.windowDays} Tage. Isst du z. B. dein Ziel, aber das Gewicht bewegt sich nicht, wird dein Ziel nach unten korrigiert.`, `Compares what you ate with your weight trend over the last ${a.windowDays} days. If you eat your target but your weight doesn’t move, the target is corrected downwards.`)}</p>
    ${body}
    ${targets.adaptive ? `<button class="btn ghost small" data-action="resetAdaptive">${L('Auf Formelwert zurücksetzen', 'Reset to formula value')}</button>` : ''}
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
    toast(L('Kalorienziel angepasst', 'Calorie target adjusted'));
  },
  resetAdaptive() {
    if (!confirm(L('Den aus deinen Daten errechneten Verbrauch verwerfen und wieder die Formel nutzen?', 'Discard the expenditure calculated from your data and use the formula again?'))) return false;
    state.goal.adaptiveTdee = null;
  },
};
