import { state, replaceState, defaultState } from '../store.js';
import { esc, today, parseNum, fmtInput } from '../util.js';
import { toast, navigate, applyLang } from '../app.js';
import { L, getLang } from '../i18n.js';
import { getApiKey, setApiKey } from '../ai.js';

export function render() {
  const s = state.settings;
  const counts = L(
    `${state.sessions.length} Trainings · ${state.weights.length} Wiegungen · ${state.foods.length} Essens-Einträge`,
    `${state.sessions.length} workouts · ${state.weights.length} weigh-ins · ${state.foods.length} food entries`
  );
  const lang = getLang();
  return `<h1 class="page-title">${L('Einstellungen', 'Settings')}</h1>
    <section class="card">
      <h3>${L('Sprache', 'Language')}</h3>
      <div class="seg">
        <button class="${lang === 'en' ? 'on' : ''}" data-action="setLang" data-lang="en">English</button>
        <button class="${lang === 'de' ? 'on' : ''}" data-action="setLang" data-lang="de">Deutsch</button>
      </div>
    </section>

    <section class="card">
      <h3>Training</h3>
      <div class="grid2">
        <label class="field"><span>${L('Gewichtssteigerung (kg)', 'Weight increment (kg)')}</span>
          <input id="s-inc" inputmode="decimal" value="${esc(fmtInput(s.increment))}" data-change="settingField" data-field="increment"></label>
        <label class="field"><span>${L('Zeitraum Anpassung', 'Adjustment window')}</span>
          <select id="s-window" data-change="settingField" data-field="adaptiveWindow">
            ${[14, 21, 28].map((d) => `<option value="${d}" ${d === s.adaptiveWindow ? 'selected' : ''}>${d} ${L('Tage', 'days')}</option>`).join('')}
          </select></label>
      </div>
      <p class="small muted">${L('Die Steigerung wird vorgeschlagen, sobald du bei einer Übung alle Sätze am oberen Ende der Wiederholungsspanne schaffst. Kürzerer Anpassungs-Zeitraum = reagiert schneller, aber anfälliger für Wasserschwankungen.', 'The increment is suggested once you hit the top of the rep range in all sets of an exercise. A shorter adjustment window reacts faster but is more sensitive to water swings.')}</p>
    </section>

    <section class="card">
      <h3>${L('Ernährung', 'Nutrition')}</h3>
      <label class="field"><span>${L('Wasserziel (ml pro Tag)', 'Water target (ml per day)')}</span>
        <input id="s-water" inputmode="numeric" value="${esc(s.waterTarget || 2500)}" data-change="settingField" data-field="waterTarget"></label>
      <label class="field"><span>${L('Anthropic-API-Schlüssel für die KI-Schätzung', 'Anthropic API key for AI estimates')}</span>
        <input id="s-apikey" type="password" autocomplete="off" placeholder="sk-ant-…" value="${esc(getApiKey())}" data-change="apiKey"></label>
      <p class="small muted">${L('Den Schlüssel bekommst du unter console.anthropic.com → API Keys. Er wird nur auf diesem Gerät gespeichert und nicht ins Backup exportiert. Tipp: In der Console ein monatliches Ausgabenlimit setzen. Eine Schätzung kostet ca. 1 Cent.', 'Get a key at console.anthropic.com → API Keys. It is stored only on this device and is not included in backups. Tip: set a monthly spend limit in the Console. One estimate costs about 1 cent.')}</p>
    </section>

    <section class="card">
      <h3>${L('Daten & Backup', 'Data & backup')}</h3>
      <p class="small">${L(`Alle Daten liegen nur auf diesem Gerät (${counts}). Wenn du den Browser-Speicher löschst oder das Handy wechselst, sind sie weg – exportiere deshalb regelmäßig ein Backup, z. B. in iCloud/Google Drive.`, `All data is stored only on this device (${counts}). If you clear browser storage or switch phones, it is gone – so export a backup regularly, e.g. to iCloud/Google Drive.`)}</p>
      <button class="btn primary block" data-action="exportData">${L('Backup exportieren', 'Export backup')}</button>
      <label class="btn ghost block file-btn">${L('Backup importieren', 'Import backup')}<input type="file" accept="application/json,.json" id="import-file" data-change="importData" hidden></label>
    </section>

    <section class="card">
      <h3>${L('Als App installieren', 'Install as app')}</h3>
      <p class="small">${L('<strong>iPhone:</strong> In Safari öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.<br><strong>Android:</strong> In Chrome öffnen → Menü ⋮ → „App installieren“.', '<strong>iPhone:</strong> Open in Safari → Share icon → “Add to Home Screen”.<br><strong>Android:</strong> Open in Chrome → menu ⋮ → “Install app”.')}</p>
      <p class="small muted">${L('Danach startet die App im Vollbild und funktioniert auch offline im Gym.', 'It then launches full screen and also works offline at the gym.')}</p>
    </section>

    <section class="card">
      <h3>${L('Zurücksetzen', 'Reset')}</h3>
      <button class="btn ghost danger block" data-action="resetAll">${L('Alle Daten löschen', 'Delete all data')}</button>
    </section>`;
}

export const actions = {
  setLang(el) {
    state.settings.lang = el.dataset.lang;
    applyLang();
  },
  apiKey(el) {
    setApiKey(el.value);
    toast(el.value ? L('Schlüssel gespeichert', 'Key saved') : L('Schlüssel entfernt', 'Key removed'));
  },
  settingField(el) {
    const v = parseNum(el.value);
    if (v === null || v < 0) return;
    state.settings[el.dataset.field] = v;
  },
  exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gym-tracker-backup-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return false;
  },
  importData(el) {
    const file = el.files?.[0];
    if (!file) return false;
    file.text().then((text) => {
      try {
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object' || !('plan' in data || 'sessions' in data || 'weights' in data)) {
          throw new Error(L('Kein Gym-Tracker-Backup', 'Not a Gym Tracker backup'));
        }
        if (!confirm(L('Backup importieren? Die aktuellen Daten auf diesem Gerät werden ersetzt.', 'Import backup? The current data on this device will be replaced.'))) return;
        replaceState(data);
        toast(L('Backup importiert', 'Backup imported'));
        applyLang();
        navigate('#/');
      } catch (e) {
        alert(`${L('Import fehlgeschlagen', 'Import failed')}: ${e.message}`);
      } finally {
        el.value = '';
      }
    });
    return false;
  },
  resetAll() {
    if (!confirm(L('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.', 'Really delete ALL data? This cannot be undone.'))) return false;
    if (!confirm(L('Sicher? Vorher besser ein Backup exportieren.', 'Sure? Better export a backup first.'))) return false;
    replaceState(defaultState());
    navigate('#/');
  },
};
