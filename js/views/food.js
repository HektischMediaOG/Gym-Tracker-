// Ernährung: Tagebuch, Hinzufügen (Suche, Barcode, KI-Schätzung, Schnell-Eintrag),
// Produktansicht, Einträge bearbeiten, Wasser, gespeicherte Mahlzeiten, Wochenüberblick.
import { state, foodsOn, totalsFor, currentWeightKg } from '../store.js';
import { computeTargets } from '../calc.js';
import { esc, uid, today, addDays, parseNum, fmtNum, fmtDate, fmtDateRelative, round, normName, fmtInput } from '../util.js';
import { bar } from '../chart.js';
import { navigate, toast, render as rerender } from '../app.js';
import { L } from '../i18n.js';
import { lookupBarcode, searchProducts } from '../off.js';
import { scannerSupported, startScanner, stopScanner } from '../scanner.js';
import { estimateNutrition, shrinkImage, getApiKey, AiError } from '../ai.js';

const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'salt'];

export const meals = () => [
  ['breakfast', L('Frühstück', 'Breakfast')],
  ['lunch', L('Mittagessen', 'Lunch')],
  ['dinner', L('Abendessen', 'Dinner')],
  ['snack', L('Snacks', 'Snacks')],
];
const mealLabel = (key) => (meals().find(([k]) => k === key) || [, key])[1];

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

// Nährwerte für eine Menge: per100 gilt pro 100 g bzw. pro Portion (unit 'portion')
function scaled(perUnit, amount, unit = 'g') {
  const f = unit === 'portion' ? amount : amount / 100;
  const out = {};
  for (const k of NUTRIENTS) out[k] = round((perUnit?.[k] || 0) * f, k === 'kcal' ? 0 : k === 'salt' ? 2 : 1);
  return out;
}

function amountLabel(amount, unit) {
  if (!amount) return '';
  return unit === 'portion' ? `${fmtNum(amount, 2)} ${L('Portion(en)', 'serving(s)')}` : `${fmtNum(amount, 0)} g`;
}

// --- Lebensmittel-Bibliothek ("Meine Lebensmittel") ---

function findLibrary({ libId, barcode, name, brand }) {
  if (libId) {
    const byId = state.foodLibrary.find((f) => f.id === libId);
    if (byId) return byId;
  }
  if (barcode) {
    const byCode = state.foodLibrary.find((f) => f.barcode === barcode);
    if (byCode) return byCode;
  }
  return state.foodLibrary.find((f) => normName(f.name) === normName(name) && normName(f.brand || '') === normName(brand || ''));
}

function upsertLibrary(item, amount) {
  const existing = findLibrary(item);
  const lib = existing || { id: uid() };
  Object.assign(lib, {
    name: item.name,
    brand: item.brand || '',
    barcode: item.barcode || lib.barcode || null,
    unit: item.unit || 'g',
    servingG: item.servingG ?? lib.servingG ?? null,
    servingLabel: item.servingLabel || lib.servingLabel || '',
    source: item.source || lib.source || 'manual',
    ...Object.fromEntries(NUTRIENTS.map((k) => [k, item.per100?.[k] ?? 0])),
    usedAt: new Date().toISOString(),
    useCount: (lib.useCount || 0) + 1,
    lastAmount: amount ?? lib.lastAmount ?? null,
  });
  if (!existing) state.foodLibrary.push(lib);
  return lib;
}

const libPer100 = (f) => Object.fromEntries(NUTRIENTS.map((k) => [k, f[k] || 0]));

function addEntry({ date, meal, item, amount }) {
  const unit = item.unit || 'g';
  const values = scaled(item.per100, amount, unit);
  const lib = upsertLibrary(item, amount);
  state.foods.push({ id: uid(), date, meal, name: item.name, brand: item.brand || '', amount, unit, per100: item.per100, libId: lib.id, ...values });
  return values;
}

// --- Tagebuch ---

let selectedDate = null;

function macroRow(label, val, tgt, unit, cls) {
  return `<div class="macro">
    <div class="macro-head"><span>${label}</span><span><strong>${fmtNum(val, 0)}</strong>${tgt ? ` / ${fmtNum(tgt, 0)}` : ''} ${unit}</span></div>
    ${tgt ? bar(val, tgt, cls) : ''}
  </div>`;
}

function weekChart(endDate, target) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(endDate, i - 6));
  const vals = days.map((d) => totalsFor(d).kcal);
  const max = Math.max(target?.kcal || 0, ...vals, 1) * 1.1;
  const logged = vals.filter((v) => v > 0);
  const avg = logged.length ? logged.reduce((s, v) => s + v, 0) / logged.length : 0;
  const W = 320, H = 120, bw = 30, gap = (W - 7 * bw) / 6;
  const bars = days
    .map((d, i) => {
      const h = (vals[i] / max) * (H - 20);
      const x = i * (bw + gap);
      const over = target && vals[i] > target.kcal * 1.05;
      return `<rect class="wbar ${over ? 'over' : ''} ${d === endDate ? 'sel' : ''}" x="${x}" y="${H - 16 - h}" width="${bw}" height="${Math.max(h, vals[i] ? 2 : 0)}" rx="4"/>
        <text class="axis" x="${x + bw / 2}" y="${H - 3}" text-anchor="middle">${fmtDate(d, { weekday: 'narrow' })}</text>`;
    })
    .join('');
  const ty = target ? H - 16 - (target.kcal / max) * (H - 20) : null;
  return `<section class="card">
    <div class="card-head"><h3>${L('Letzte 7 Tage', 'Last 7 days')}</h3><span class="muted small">Ø ${fmtNum(avg, 0)} kcal</span></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${bars}${ty !== null ? `<line class="target-line" x1="0" x2="${W}" y1="${ty}" y2="${ty}"/>` : ''}</svg>
    ${target ? `<p class="legend"><span class="key dash"></span>${L('Tagesziel', 'Daily target')} ${fmtNum(target.kcal, 0)} kcal</p>` : ''}
  </section>`;
}

export function render(dateParam) {
  stopScanner();
  const date = dateParam || selectedDate || today();
  selectedDate = date;
  const t = totalsFor(date);
  const target = currentTargets();
  const entries = foodsOn(date);
  const incomplete = state.incompleteDays.includes(date);
  const remaining = target ? target.kcal - t.kcal : null;

  const summary = `<section class="card">
    <div class="kcal-big">
      <div><span class="big">${fmtNum(t.kcal, 0)}</span><span class="muted"> ${L('kcal gegessen', 'kcal eaten')}</span></div>
      ${target ? `<div class="right"><span class="big ${remaining < 0 ? 'neg' : ''}">${fmtNum(Math.abs(remaining), 0)}</span><span class="muted"> ${remaining < 0 ? L('drüber', 'over') : L('übrig', 'left')}</span></div>` : ''}
    </div>
    ${target ? bar(t.kcal, target.kcal, 'kcal') : `<p class="small muted">${L('Trag unter <a href="#/goals">Ziele</a> dein Profil ein, dann siehst du hier dein Tagesziel.', 'Fill in your profile under <a href="#/goals">Goals</a> to see your daily target here.')}</p>`}
    ${macroRow('Protein', t.protein, target?.protein, 'g', 'p')}
    ${macroRow(L('Kohlenhydrate', 'Carbs'), t.carbs, target?.carbs, 'g', 'c')}
    ${macroRow(L('Fett', 'Fat'), t.fat, target?.fat, 'g', 'f')}
    <div class="micro-row">
      <span>${L('Ballaststoffe', 'Fiber')} <strong>${fmtNum(t.fiber, 0)} g</strong></span>
      <span>${L('Zucker', 'Sugar')} <strong>${fmtNum(t.sugar, 0)} g</strong></span>
      <span>${L('Salz', 'Salt')} <strong>${fmtNum(t.salt, 1)} g</strong></span>
    </div>
  </section>`;

  const water = state.water[date] || 0;
  const waterTarget = state.settings.waterTarget || 2500;
  const waterCard = `<section class="card">
    <div class="card-head"><h3>${L('Wasser', 'Water')}</h3><span class="muted small"><strong>${fmtNum(water / 1000, 2)}</strong> / ${fmtNum(waterTarget / 1000, 1)} l</span></div>
    ${bar(water, waterTarget, 'water')}
    <div class="row gap">
      <button class="btn ghost small" data-action="water" data-ml="-250" ${water ? '' : 'disabled'}>−250 ml</button>
      <button class="btn small block" data-action="water" data-ml="250">+250 ml</button>
      <button class="btn small block" data-action="water" data-ml="500">+500 ml</button>
    </div>
  </section>`;

  const groups = meals()
    .map(([key, label]) => {
      const items = entries.filter((e) => e.meal === key);
      const kcal = items.reduce((s, e) => s + (e.kcal || 0), 0);
      const p = items.reduce((s, e) => s + (e.protein || 0), 0);
      return `<section class="card meal">
        <div class="card-head"><h3>${label}</h3><span class="muted small">${items.length ? `${fmtNum(kcal, 0)} kcal · P ${fmtNum(p, 0)} g` : ''}</span></div>
        ${items
          .map(
            (e) => `<a class="food-item" href="#/entry/${e.id}">
              <div><strong>${esc(e.name)}</strong><span class="small muted">${[e.brand, amountLabel(e.amount, e.unit)].filter(Boolean).map(esc).join(' · ')}${e.brand || e.amount ? ' · ' : ''}P ${fmtNum(e.protein, 0)} · ${L('K', 'C')} ${fmtNum(e.carbs, 0)} · F ${fmtNum(e.fat, 0)}</span></div>
              <span class="kcal">${fmtNum(e.kcal, 0)}</span>
            </a>`
          )
          .join('')}
        <div class="row gap meal-actions">
          <a class="btn ghost small block" href="#/add/${key}/${date}">+ ${L('Hinzufügen', 'Add food')}</a>
          ${items.length ? `<button class="btn ghost small" data-action="saveMeal" data-meal="${key}" data-date="${date}">${L('Als Mahlzeit speichern', 'Save as meal')}</button>` : ''}
        </div>
      </section>`;
    })
    .join('');

  return `<div class="date-nav">
      <button class="icon-btn" data-action="foodDate" data-date="${addDays(date, -1)}" aria-label="${L('Vorheriger Tag', 'Previous day')}">‹</button>
      <strong>${fmtDateRelative(date)}</strong><span class="muted small">${fmtDate(date, { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
      <button class="icon-btn" data-action="foodDate" data-date="${addDays(date, 1)}" ${date >= today() ? 'disabled' : ''} aria-label="${L('Nächster Tag', 'Next day')}">›</button>
    </div>
    ${summary}
    ${groups}
    ${waterCard}
    ${weekChart(date, target)}
    <button class="btn ghost block" data-action="copyYesterday" data-date="${date}">${L('Vortag kopieren', 'Copy previous day')}</button>
    <label class="check-label card">
      <input type="checkbox" id="incomplete" data-change="toggleIncomplete" data-date="${date}" ${incomplete ? 'checked' : ''}>
      <span>${L('Tag unvollständig geloggt – nicht für die automatische Kalorienanpassung verwenden', 'Day not fully logged – exclude from automatic calorie adjustment')}</span>
    </label>`;
}

// --- Hinzufügen ---

const add = {
  tab: 'search',
  query: '',
  results: null, // Open-Food-Facts-Treffer
  loading: false,
  error: null,
  scanStatus: null, // null | 'looking' | {miss: code} | {error}
  manualCode: '',
  aiText: '',
  aiImage: null,
  aiLoading: false,
  aiError: null,
  aiResult: null, // {items, note}
  quickBarcode: null,
};

function addTarget() {
  const [, , meal = defaultMeal(), date = today()] = location.hash.split('/');
  return { meal, date };
}

function libraryList(query) {
  const q = normName(query);
  return state.foodLibrary
    .filter((f) => !q || normName(`${f.name} ${f.brand || ''}`).includes(q))
    .sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || (b.usedAt || '').localeCompare(a.usedAt || ''))
    .slice(0, q ? 30 : 15);
}

function productRow({ name, brand, kcal, unit, action, attrs, fav }) {
  return `<button class="list-item food-row" data-action="${action}" ${attrs}>
    <div><strong>${fav ? '★ ' : ''}${esc(name)}</strong><span class="small muted">${esc(brand || '')}</span></div>
    <span class="small muted nowrap">${fmtNum(kcal, 0)} kcal / ${unit === 'portion' ? L('Portion', 'serving') : '100 g'}</span>
  </button>`;
}

function renderSearchTab() {
  const lib = libraryList(add.query);
  const q = normName(add.query);
  const savedMeals = state.savedMeals.filter((m) => !q || normName(m.name).includes(q));
  return `<form class="search-row" data-form="searchFood">
      <input id="food-search" name="q" type="search" value="${esc(add.query)}" placeholder="${L('Lebensmittel oder Marke suchen', 'Search food or brand')}" autocomplete="off" data-input="searchQuery">
      <button class="btn primary">${L('Suchen', 'Search')}</button>
    </form>
    ${savedMeals.length ? `<p class="label">${L('Gespeicherte Mahlzeiten', 'Saved meals')}</p>
      <div class="list">${savedMeals
        .map((m) => {
          const kcal = m.items.reduce((s, i) => s + (i.kcal || 0), 0);
          return `<div class="list-item food-row">
            <button class="plain" data-action="addSavedMeal" data-id="${m.id}"><strong>${esc(m.name)}</strong><span class="small muted">${m.items.length} ${L('Lebensmittel', 'foods')} · ${fmtNum(kcal, 0)} kcal</span></button>
            <button class="icon-btn danger" data-action="deleteSavedMeal" data-id="${m.id}" aria-label="${L('Löschen', 'Delete')}">✕</button>
          </div>`;
        })
        .join('')}</div>` : ''}
    <p class="label">${add.query ? L('Meine Lebensmittel', 'My foods') : L('Zuletzt & Favoriten', 'Recent & favorites')}</p>
    ${lib.length ? `<div class="list">${lib.map((f) => productRow({ ...f, action: 'pickLibrary', attrs: `data-id="${f.id}"` })).join('')}</div>` : `<p class="small muted">${L('Noch keine eigenen Lebensmittel – alles, was du einträgst, landet hier.', 'No foods yet – everything you log ends up here.')}</p>`}
    ${add.loading ? `<p class="muted center">${L('Suche in Open Food Facts …', 'Searching Open Food Facts …')}</p>` : ''}
    ${add.error ? `<p class="warn small">${esc(add.error)}</p>` : ''}
    ${add.results ? `<p class="label">Open Food Facts</p>${add.results.length ? `<div class="list">${add.results.map((r, i) => productRow({ ...r.per100, name: r.name, brand: r.brand, action: 'pickResult', attrs: `data-i="${i}"` })).join('')}</div>` : `<p class="small muted">${L('Nichts gefunden. Versuch es mit der KI-Schätzung.', 'Nothing found. Try the AI estimate.')}</p>`}` : ''}`;
}

function renderScanTab() {
  const supported = scannerSupported();
  let status = '';
  if (add.scanStatus === 'looking') status = `<p class="muted center">${L('Suche Produkt …', 'Looking up product …')}</p>`;
  else if (add.scanStatus?.miss) {
    status = `<div class="card alert"><p><strong>${L('Produkt nicht gefunden', 'Product not found')}</strong> (${esc(add.scanStatus.miss)})</p>
      <p class="small">${L('Trag es einmal selbst ein – beim nächsten Scan kennt die App es.', 'Enter it once yourself – the app will know it next time you scan.')}</p>
      <div class="row gap"><button class="btn small block" data-action="addTab" data-tab="ai">${L('KI schätzen', 'AI estimate')}</button>
      <button class="btn small block" data-action="scanToQuick">${L('Selbst eintragen', 'Enter manually')}</button></div></div>`;
  } else if (add.scanStatus?.error) status = `<p class="warn small">${esc(add.scanStatus.error)}</p>`;

  if (supported && !add.scanStatus) setTimeout(attachScanner, 0);
  return `${supported
      ? `<div class="scanner"><video id="scan-video" playsinline muted></video><div class="scan-frame"></div></div>
         ${add.scanStatus ? `<button class="btn block" data-action="rescan">${L('Erneut scannen', 'Scan again')}</button>` : `<p class="small muted center">${L('Barcode ins Bild halten', 'Point the camera at a barcode')}</p>`}`
      : `<p class="small muted">${L('Dein Browser unterstützt keinen Kamera-Scan (z. B. Safari auf dem iPhone). Gib die Nummer unter dem Barcode ein.', 'Your browser does not support camera scanning (e.g. Safari on iPhone). Enter the number below the barcode.')}</p>`}
    ${status}
    <form class="search-row mt" data-form="manualBarcode">
      <input id="manual-code" name="code" inputmode="numeric" placeholder="${L('Barcode-Nummer', 'Barcode number')}" value="${esc(add.manualCode)}" autocomplete="off">
      <button class="btn">${L('Suchen', 'Look up')}</button>
    </form>`;
}

function renderAiTab() {
  if (!getApiKey()) {
    return `<section class="card empty"><h3>${L('KI-Schätzung einrichten', 'Set up AI estimates')}</h3>
      <p class="small">${L('Die Schätzung nutzt Claude mit deinem eigenen Anthropic-API-Schlüssel. Kosten: ca. 1 Cent pro Schätzung.', 'Estimates use Claude with your own Anthropic API key. Cost: about 1 cent per estimate.')}</p>
      <a class="btn primary block" href="#/settings">${L('Schlüssel eintragen', 'Add key')}</a></section>`;
  }
  const r = add.aiResult;
  const result = r
    ? `<section class="card">
        <h3>${L('Schätzung', 'Estimate')}</h3>
        ${r.note ? `<p class="small muted">${esc(r.note)}</p>` : ''}
        ${r.items
          .map(
            (it, i) => `<div class="ai-item">
              <div class="ai-head"><strong>${esc(it.name)}</strong>${it.confidence === 'low' ? `<span class="badge soft">${L('unsicher', 'uncertain')}</span>` : ''}
                <button class="icon-btn danger" data-action="aiRemove" data-i="${i}" aria-label="${L('Entfernen', 'Remove')}">✕</button></div>
              <div class="ai-row">
                <label class="set-field"><input id="ai-amt-${i}" inputmode="decimal" value="${esc(fmtInput(it.amount_g))}" data-input="aiAmount" data-i="${i}"><span>g</span></label>
                <span class="small" id="ai-vals-${i}">${aiValsText(it)}</span>
              </div>
            </div>`
          )
          .join('')}
        <button class="btn primary block mt" data-action="aiAddAll" ${r.items.length ? '' : 'disabled'}>${L('Alle hinzufügen', 'Add all')}</button>
        <p class="small muted">${L('Schätzungen können daneben liegen – Mengen vor dem Hinzufügen prüfen.', 'Estimates can be off – check amounts before adding.')}</p>
      </section>`
    : '';
  return `<form class="card" data-form="aiEstimate">
      <label class="field"><span>${L('Was hast du gegessen?', 'What did you eat?')}</span>
        <textarea id="ai-text" name="text" rows="3" data-input="aiText" placeholder="${L('z. B. 200 g Hähnchenbrust mit 150 g Reis und Brokkoli, etwas Öl', 'e.g. 200 g chicken breast with 150 g rice and broccoli, a little oil')}">${esc(add.aiText)}</textarea>
      </label>
      <label class="btn ghost block file-btn">${add.aiImage ? L('📷 Foto ändern', '📷 Change photo') : L('📷 Foto hinzufügen (optional)', '📷 Add photo (optional)')}<input type="file" accept="image/*" capture="environment" id="ai-photo" data-change="aiPhoto" hidden></label>
      ${add.aiImage ? `<div class="ai-photo"><img src="${add.aiImage}" alt=""><button type="button" class="icon-btn danger" data-action="aiClearPhoto" aria-label="${L('Foto entfernen', 'Remove photo')}">✕</button></div>` : ''}
      <button class="btn primary block mt" ${add.aiLoading ? 'disabled' : ''}>${add.aiLoading ? L('Schätze …', 'Estimating …') : L('Kalorien schätzen', 'Estimate calories')}</button>
      ${add.aiError ? `<p class="warn small">${esc(add.aiError)}</p>` : ''}
    </form>
    ${result}`;
}

function aiValsText(it) {
  return `${fmtNum(it.kcal, 0)} kcal · P ${fmtNum(it.protein, 0)} · ${L('K', 'C')} ${fmtNum(it.carbs, 0)} · F ${fmtNum(it.fat, 0)}`;
}

function renderQuickTab() {
  return `<form class="card" data-form="quickAdd" id="quick-form">
    ${add.quickBarcode ? `<p class="small muted">Barcode ${esc(add.quickBarcode)} – ${L('wird für den nächsten Scan gespeichert', 'saved for your next scan')}</p>` : ''}
    <label class="field"><span>${L('Name', 'Name')}</span><input id="q-name" name="name" type="text" required autocomplete="off" placeholder="${L('z. B. Skyr', 'e.g. skyr')}"></label>
    <div class="grid2">
      <label class="field"><span>${L('Werte gelten für', 'Values are for')}</span>
        <select id="q-basis" name="basis">
          <option value="100">100 g</option>
          <option value="portion">${L('1 Portion', '1 serving')}</option>
        </select></label>
      <label class="field"><span>${L('Gegessene Menge', 'Amount eaten')}</span><input id="q-amount" name="amount" inputmode="decimal" placeholder="${L('g bzw. Portionen', 'g or servings')}"></label>
    </div>
    <div class="grid4">
      <label class="field"><span>kcal</span><input id="q-kcal" name="kcal" inputmode="decimal" required></label>
      <label class="field"><span>Protein</span><input id="q-protein" name="protein" inputmode="decimal" placeholder="g"></label>
      <label class="field"><span>${L('KH', 'Carbs')}</span><input id="q-carbs" name="carbs" inputmode="decimal" placeholder="g"></label>
      <label class="field"><span>${L('Fett', 'Fat')}</span><input id="q-fat" name="fat" inputmode="decimal" placeholder="g"></label>
    </div>
    <details><summary>${L('Weitere Nährwerte', 'More nutrients')}</summary>
      <div class="grid3">
        <label class="field"><span>${L('Ballaststoffe', 'Fiber')}</span><input id="q-fiber" name="fiber" inputmode="decimal" placeholder="g"></label>
        <label class="field"><span>${L('Zucker', 'Sugar')}</span><input id="q-sugar" name="sugar" inputmode="decimal" placeholder="g"></label>
        <label class="field"><span>${L('Salz', 'Salt')}</span><input id="q-salt" name="salt" inputmode="decimal" placeholder="g"></label>
      </div>
    </details>
    <button class="btn primary block mt">${L('Hinzufügen', 'Add')}</button>
  </form>`;
}

export function renderAdd() {
  const { meal, date } = addTarget();
  if (add.tab !== 'scan') stopScanner();
  const tabs = [
    ['search', L('Suchen', 'Search')],
    ['scan', L('Scannen', 'Scan')],
    ['ai', L('KI', 'AI')],
    ['quick', L('Schnell', 'Quick')],
  ];
  const body = { search: renderSearchTab, scan: renderScanTab, ai: renderAiTab, quick: renderQuickTab }[add.tab]();
  return `<a class="back" href="#/food/${date}">← ${L('Tagebuch', 'Diary')}</a>
    <h2>${L(`Zu ${mealLabel(meal)} hinzufügen`, `Add to ${mealLabel(meal)}`)}</h2>
    <p class="muted small">${fmtDateRelative(date)}</p>
    <nav class="subnav four">${tabs.map(([k, l]) => `<button class="${add.tab === k ? 'active' : ''}" data-action="addTab" data-tab="${k}">${l}</button>`).join('')}</nav>
    ${body}`;
}

async function attachScanner() {
  const video = document.getElementById('scan-video');
  if (!video || add.tab !== 'scan' || add.scanStatus) return;
  try {
    await startScanner(video, (code) => handleBarcode(code));
  } catch {
    add.scanStatus = { error: L('Kamera nicht verfügbar – Zugriff erlaubt? Du kannst die Nummer auch eintippen.', 'Camera not available – permission granted? You can also type the number.') };
    rerender();
  }
}

async function handleBarcode(code) {
  // Erst im eigenen Speicher suchen – funktioniert offline und kennt selbst angelegte Produkte
  const local = state.foodLibrary.find((f) => f.barcode === code);
  if (local) {
    openProduct(fromLibrary(local));
    return;
  }
  add.scanStatus = 'looking';
  rerender();
  try {
    const product = await lookupBarcode(code);
    if (product) {
      add.scanStatus = null;
      openProduct(product);
    } else {
      add.scanStatus = { miss: code };
      rerender();
    }
  } catch {
    add.scanStatus = { error: L('Keine Verbindung zur Produktdatenbank. Bist du offline?', 'Could not reach the product database. Are you offline?') };
    rerender();
  }
}

// --- Produktansicht ---

let draft = null; // {name, brand, barcode, unit, per100, servingG, servingLabel, source, libId, amount}

function fromLibrary(f) {
  return { name: f.name, brand: f.brand, barcode: f.barcode, unit: f.unit || 'g', per100: libPer100(f), servingG: f.servingG, servingLabel: f.servingLabel, source: f.source, libId: f.id, lastAmount: f.lastAmount };
}

function openProduct(item) {
  const { meal, date } = addTarget();
  const lib = findLibrary(item);
  draft = { ...item, libId: lib?.id ?? item.libId ?? null, unit: item.unit || 'g' };
  draft.lastAmount = item.lastAmount ?? lib?.lastAmount ?? null;
  draft.amount = draft.lastAmount ?? (draft.unit === 'portion' ? 1 : draft.servingG || 100);
  navigate(`#/product/${meal}/${date}`);
}

function draftValuesHtml() {
  const v = scaled(draft.per100, draft.amount || 0, draft.unit);
  return `<div class="dv"><span class="big">${fmtNum(v.kcal, 0)}</span><span class="muted">kcal</span></div>
    <div class="dv"><strong>${fmtNum(v.protein, 1)}</strong><span class="muted">Protein</span></div>
    <div class="dv"><strong>${fmtNum(v.carbs, 1)}</strong><span class="muted">${L('KH', 'Carbs')}</span></div>
    <div class="dv"><strong>${fmtNum(v.fat, 1)}</strong><span class="muted">${L('Fett', 'Fat')}</span></div>`;
}

export function renderProduct() {
  const { meal, date } = addTarget();
  if (!draft) return `<a class="back" href="#/add/${meal}/${date}">← ${L('Zurück', 'Back')}</a><p class="muted">${L('Kein Produkt ausgewählt.', 'No product selected.')}</p>`;
  const lib = draft.libId ? state.foodLibrary.find((f) => f.id === draft.libId) : null;
  const chips = draft.unit === 'portion'
    ? [0.5, 1, 2].map((a) => `<button class="chip" data-action="draftAmount" data-amount="${a}">${fmtNum(a, 1)}</button>`).join('')
    : [
        draft.servingG ? [draft.servingG, `1 ${L('Portion', 'serving')} (${fmtNum(draft.servingG, 0)} g)`] : null,
        [100, '100 g'],
        draft.lastAmount && draft.lastAmount !== 100 && draft.lastAmount !== draft.servingG ? [draft.lastAmount, `${L('Zuletzt', 'Last')} ${fmtNum(draft.lastAmount, 0)} g`] : null,
      ]
        .filter(Boolean)
        .map(([a, l]) => `<button class="chip" data-action="draftAmount" data-amount="${a}">${esc(l)}</button>`)
        .join('');
  const per = draft.per100;
  return `<a class="back" href="#/add/${meal}/${date}">← ${L('Zurück', 'Back')}</a>
    <section class="card">
      <div class="card-head">
        <div><h2>${esc(draft.name)}</h2><p class="muted small">${[draft.brand, draft.servingLabel && `${L('Portion', 'Serving')}: ${draft.servingLabel}`].filter(Boolean).map(esc).join(' · ')}</p></div>
        ${lib ? `<button class="icon-btn fav ${lib.fav ? 'on' : ''}" data-action="toggleFav" data-id="${lib.id}" aria-label="${L('Favorit', 'Favorite')}">★</button>` : ''}
      </div>
      <div class="grid2">
        <label class="field"><span>${draft.unit === 'portion' ? L('Portionen', 'Servings') : L('Menge (g)', 'Amount (g)')}</span>
          <input id="draft-amount" inputmode="decimal" value="${esc(fmtInput(draft.amount))}" data-input="draftAmountInput"></label>
        <label class="field"><span>${L('Mahlzeit', 'Meal')}</span>
          <select id="draft-meal" data-change="draftMeal">${meals().map(([k, l]) => `<option value="${k}" ${k === meal ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="chips">${chips}</div>
      <div class="draft-values" id="draft-values">${draftValuesHtml()}</div>
      <button class="btn primary block" data-action="addDraft">${L('Hinzufügen', 'Add')}</button>
    </section>
    <section class="card">
      <h3>${draft.unit === 'portion' ? L('Pro Portion', 'Per serving') : L('Pro 100 g', 'Per 100 g')}</h3>
      <table class="table small">
        <tr><td>${L('Energie', 'Energy')}</td><td class="right">${fmtNum(per.kcal, 0)} kcal</td></tr>
        <tr><td>Protein</td><td class="right">${fmtNum(per.protein, 1)} g</td></tr>
        <tr><td>${L('Kohlenhydrate', 'Carbs')}</td><td class="right">${fmtNum(per.carbs, 1)} g</td></tr>
        <tr><td class="indent">${L('davon Zucker', 'of which sugar')}</td><td class="right">${fmtNum(per.sugar, 1)} g</td></tr>
        <tr><td>${L('Fett', 'Fat')}</td><td class="right">${fmtNum(per.fat, 1)} g</td></tr>
        <tr><td>${L('Ballaststoffe', 'Fiber')}</td><td class="right">${fmtNum(per.fiber, 1)} g</td></tr>
        <tr><td>${L('Salz', 'Salt')}</td><td class="right">${fmtNum(per.salt, 2)} g</td></tr>
      </table>
      <p class="small muted">${{ off: L('Quelle: Open Food Facts', 'Source: Open Food Facts'), ai: L('Quelle: KI-Schätzung', 'Source: AI estimate') }[draft.source] || L('Eigener Eintrag', 'Your own entry')}${draft.barcode ? ` · ${esc(draft.barcode)}` : ''}</p>
      ${lib ? `<button class="btn ghost small danger" data-action="removeLibrary" data-id="${lib.id}">${L('Aus „Meine Lebensmittel“ entfernen', 'Remove from “My foods”')}</button>` : ''}
    </section>`;
}

// --- Eintrag bearbeiten ---

export function renderEntry(id) {
  stopScanner();
  const e = state.foods.find((x) => x.id === id);
  if (!e) return `<a class="back" href="#/food">← ${L('Tagebuch', 'Diary')}</a><p class="muted">${L('Eintrag nicht gefunden.', 'Entry not found.')}</p>`;
  const scalable = !!e.per100 && e.amount;
  return `<a class="back" href="#/food/${e.date}">← ${L('Tagebuch', 'Diary')}</a>
    <form class="card" data-form="saveEntry" data-id="${e.id}">
      <h2>${esc(e.name)}</h2>
      ${e.brand ? `<p class="muted small">${esc(e.brand)}</p>` : ''}
      <div class="grid2">
        ${scalable ? `<label class="field"><span>${e.unit === 'portion' ? L('Portionen', 'Servings') : L('Menge (g)', 'Amount (g)')}</span><input id="entry-amount" name="amount" inputmode="decimal" value="${esc(fmtInput(e.amount))}"></label>` : ''}
        <label class="field"><span>${L('Mahlzeit', 'Meal')}</span>
          <select id="entry-meal" name="meal">${meals().map(([k, l]) => `<option value="${k}" ${k === e.meal ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      ${scalable
        ? `<p class="small muted">${L('Nährwerte werden aus der Menge berechnet.', 'Nutrients are calculated from the amount.')}</p>`
        : `<div class="grid4">
            ${['kcal', 'protein', 'carbs', 'fat'].map((k) => `<label class="field"><span>${{ kcal: 'kcal', protein: 'Protein', carbs: L('KH', 'Carbs'), fat: L('Fett', 'Fat') }[k]}</span><input id="entry-${k}" name="${k}" inputmode="decimal" value="${esc(fmtInput(e[k]))}"></label>`).join('')}
          </div>`}
      <button class="btn primary block mt">${L('Speichern', 'Save')}</button>
    </form>
    <button class="btn ghost danger block" data-action="deleteFood" data-id="${e.id}">${L('Eintrag löschen', 'Delete entry')}</button>`;
}

// Kamera aus, sobald die Hinzufügen-Seite verlassen wird
window.addEventListener('hashchange', () => {
  if (!location.hash.startsWith('#/add/')) stopScanner();
});

// --- Aktionen ---

function valuesFromForm(fd) {
  return Object.fromEntries(NUTRIENTS.map((k) => [k, parseNum(fd.get(k)) ?? 0]));
}

let searchTimer = null;

export const actions = {
  foodDate(el) {
    selectedDate = el.dataset.date;
    navigate(`#/food/${selectedDate}`);
  },
  water(el) {
    const d = selectedDate || today();
    state.water[d] = Math.max(0, (state.water[d] || 0) + Number(el.dataset.ml));
  },

  addTab(el) {
    add.tab = el.dataset.tab;
    if (add.tab === 'scan') add.scanStatus = null;
  },
  searchQuery(el) {
    add.query = el.value;
    // Eigene Lebensmittel beim Tippen filtern; Fokus bleibt durch das Neuzeichnen erhalten
    clearTimeout(searchTimer);
    searchTimer = setTimeout(rerender, 200);
  },
  searchFood(form) {
    const q = String(new FormData(form).get('q') || '').trim();
    add.query = q;
    if (q.length < 2) return;
    add.loading = true;
    add.error = null;
    add.results = null;
    searchProducts(q)
      .then((r) => {
        add.results = r;
      })
      .catch(() => {
        add.error = L('Keine Verbindung zur Produktdatenbank. Bist du offline?', 'Could not reach the product database. Are you offline?');
      })
      .finally(() => {
        add.loading = false;
        rerender();
      });
  },
  pickLibrary(el) {
    const f = state.foodLibrary.find((x) => x.id === el.dataset.id);
    if (f) openProduct(fromLibrary(f));
    return false;
  },
  pickResult(el) {
    const r = add.results?.[Number(el.dataset.i)];
    if (r) openProduct(r);
    return false;
  },
  addSavedMeal(el) {
    const m = state.savedMeals.find((x) => x.id === el.dataset.id);
    if (!m) return false;
    const { meal, date } = addTarget();
    for (const i of m.items) state.foods.push({ ...i, id: uid(), date, meal });
    toast(L(`${m.name} hinzugefügt`, `${m.name} added`));
    navigate(`#/food/${date}`);
  },
  deleteSavedMeal(el) {
    const m = state.savedMeals.find((x) => x.id === el.dataset.id);
    if (!m || !confirm(L(`Mahlzeit „${m.name}“ löschen?`, `Delete meal “${m.name}”?`))) return false;
    state.savedMeals = state.savedMeals.filter((x) => x.id !== m.id);
  },
  saveMeal(el) {
    const items = foodsOn(el.dataset.date).filter((e) => e.meal === el.dataset.meal);
    const name = prompt(L('Name der Mahlzeit', 'Meal name'), mealLabel(el.dataset.meal));
    if (!name) return false;
    state.savedMeals.push({ id: uid(), name: name.trim(), items: items.map(({ id, date, meal, ...rest }) => rest) });
    toast(L('Mahlzeit gespeichert – unter „Hinzufügen → Suchen“', 'Meal saved – find it under “Add food → Search”'));
  },

  rescan() {
    add.scanStatus = null;
  },
  manualBarcode(form) {
    const code = String(new FormData(form).get('code') || '').replace(/\D/g, '');
    add.manualCode = code;
    if (code.length < 8) {
      toast(L('Barcode zu kurz', 'Barcode too short'));
      return false;
    }
    stopScanner();
    handleBarcode(code);
    return false;
  },
  scanToQuick() {
    add.quickBarcode = add.scanStatus?.miss || null;
    add.tab = 'quick';
  },

  aiText(el) {
    add.aiText = el.value;
  },
  aiPhoto(el) {
    const file = el.files?.[0];
    if (!file) return false;
    shrinkImage(file)
      .then((url) => {
        add.aiImage = url;
      })
      .catch(() => toast(L('Foto konnte nicht gelesen werden', 'Could not read the photo')))
      .finally(rerender);
    return false;
  },
  aiClearPhoto() {
    add.aiImage = null;
  },
  aiEstimate(form) {
    add.aiText = String(new FormData(form).get('text') || '');
    if (!add.aiText.trim() && !add.aiImage) {
      toast(L('Beschreibe das Essen oder füge ein Foto hinzu', 'Describe the food or add a photo'));
      return false;
    }
    add.aiLoading = true;
    add.aiError = null;
    add.aiResult = null;
    estimateNutrition({ text: add.aiText, imageDataUrl: add.aiImage })
      .then((r) => {
        add.aiResult = r;
      })
      .catch((e) => {
        const code = e instanceof AiError ? e.code : 'api';
        add.aiError =
          {
            'no-key': L('Kein API-Schlüssel hinterlegt.', 'No API key set.'),
            auth: L('API-Schlüssel ungültig – bitte in den Einstellungen prüfen.', 'API key invalid – please check it in settings.'),
            rate: L('Zu viele Anfragen – kurz warten und nochmal versuchen.', 'Too many requests – wait a moment and try again.'),
            network: L('Keine Verbindung. Bist du offline?', 'No connection. Are you offline?'),
            refusal: L('Die KI konnte diese Anfrage nicht schätzen.', 'The AI could not estimate this request.'),
            parse: L('Antwort der KI war unvollständig – bitte nochmal versuchen.', 'The AI response was incomplete – please try again.'),
          }[code] || `${L('Fehler', 'Error')}: ${e.message}`;
      })
      .finally(() => {
        add.aiLoading = false;
        rerender();
      });
  },
  aiAmount(el) {
    const it = add.aiResult?.items[Number(el.dataset.i)];
    const amount = parseNum(el.value);
    if (!it || !amount) return;
    // Proportional zur ursprünglichen Schätzung skalieren
    it._base = it._base || { ...it };
    if (!it._base.amount_g) return;
    const f = amount / it._base.amount_g;
    for (const k of NUTRIENTS) it[k] = round(it._base[k] * f, k === 'kcal' ? 0 : 1);
    it.amount_g = amount;
    const span = document.getElementById(`ai-vals-${el.dataset.i}`);
    if (span) span.textContent = aiValsText(it);
  },
  aiRemove(el) {
    add.aiResult.items.splice(Number(el.dataset.i), 1);
  },
  aiAddAll() {
    const { meal, date } = addTarget();
    for (const it of add.aiResult.items) {
      const base = it._base || it;
      const baseAmount = base.amount_g || 100;
      const per100 = Object.fromEntries(NUTRIENTS.map((k) => [k, round((base[k] / baseAmount) * 100, 2)]));
      addEntry({ date, meal, amount: it.amount_g || baseAmount, item: { name: it.name, per100, unit: 'g', source: 'ai' } });
    }
    toast(L(`${add.aiResult.items.length} Einträge hinzugefügt`, `${add.aiResult.items.length} entries added`));
    add.aiResult = null;
    add.aiText = '';
    add.aiImage = null;
    navigate(`#/food/${date}`);
  },

  quickAdd(form) {
    const fd = new FormData(form);
    const { meal, date } = addTarget();
    const name = String(fd.get('name') || '').trim();
    if (!name) return false;
    const unit = fd.get('basis') === 'portion' ? 'portion' : 'g';
    const amount = parseNum(fd.get('amount')) ?? (unit === 'portion' ? 1 : 100);
    addEntry({ date, meal, amount, item: { name, unit, per100: valuesFromForm(fd), barcode: add.quickBarcode, source: 'manual' } });
    add.quickBarcode = null;
    toast(L(`${name} eingetragen`, `${name} added`));
    navigate(`#/food/${date}`);
  },

  draftAmount(el) {
    draft.amount = Number(el.dataset.amount);
  },
  draftAmountInput(el) {
    draft.amount = parseNum(el.value) ?? 0;
    const box = document.getElementById('draft-values');
    if (box) box.innerHTML = draftValuesHtml();
  },
  draftMeal(el) {
    const { date } = addTarget();
    history.replaceState(null, '', `#/product/${el.value}/${date}`);
    return false;
  },
  addDraft() {
    const { meal, date } = addTarget();
    if (!draft.amount) {
      toast(L('Bitte eine Menge eintragen', 'Please enter an amount'));
      return false;
    }
    const v = addEntry({ date, meal, amount: draft.amount, item: draft });
    toast(L(`${draft.name} hinzugefügt (${fmtNum(v.kcal, 0)} kcal)`, `${draft.name} added (${fmtNum(v.kcal, 0)} kcal)`));
    draft = null;
    add.scanStatus = null;
    navigate(`#/food/${date}`);
  },
  toggleFav(el) {
    const f = state.foodLibrary.find((x) => x.id === el.dataset.id);
    if (f) f.fav = !f.fav;
  },
  removeLibrary(el) {
    if (!confirm(L('Aus „Meine Lebensmittel“ entfernen? Bereits geloggte Einträge bleiben.', 'Remove from “My foods”? Logged entries are kept.'))) return false;
    state.foodLibrary = state.foodLibrary.filter((f) => f.id !== el.dataset.id);
    draft.libId = null;
  },

  saveEntry(form) {
    const e = state.foods.find((x) => x.id === form.dataset.id);
    if (!e) return false;
    const fd = new FormData(form);
    e.meal = fd.get('meal');
    if (e.per100 && e.amount) {
      const amount = parseNum(fd.get('amount'));
      if (amount) {
        e.amount = amount;
        Object.assign(e, scaled(e.per100, amount, e.unit));
      }
    } else {
      for (const k of ['kcal', 'protein', 'carbs', 'fat']) e[k] = parseNum(fd.get(k)) ?? 0;
    }
    toast(L('Gespeichert', 'Saved'));
    navigate(`#/food/${e.date}`);
  },
  deleteFood(el) {
    const e = state.foods.find((f) => f.id === el.dataset.id);
    state.foods = state.foods.filter((f) => f.id !== el.dataset.id);
    if (location.hash.startsWith('#/entry/')) navigate(`#/food/${e?.date || ''}`);
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
