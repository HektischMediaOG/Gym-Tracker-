import { state, replaceState, defaultState } from '../store.js';
import { esc, today, parseNum, fmtInput } from '../util.js';
import { toast, navigate } from '../app.js';

export function render() {
  const s = state.settings;
  const counts = `${state.sessions.length} Trainings · ${state.weights.length} Wiegungen · ${state.foods.length} Essens-Einträge`;
  return `<h1 class="page-title">Einstellungen</h1>
    <section class="card">
      <h3>Training</h3>
      <div class="grid2">
        <label class="field"><span>Gewichtssteigerung (kg)</span>
          <input id="s-inc" inputmode="decimal" value="${esc(fmtInput(s.increment))}" data-change="settingField" data-field="increment"></label>
        <label class="field"><span>Zeitraum Anpassung</span>
          <select id="s-window" data-change="settingField" data-field="adaptiveWindow">
            ${[14, 21, 28].map((d) => `<option value="${d}" ${d === s.adaptiveWindow ? 'selected' : ''}>${d} Tage</option>`).join('')}
          </select></label>
      </div>
      <p class="small muted">Die Steigerung wird vorgeschlagen, sobald du bei einer Übung alle Sätze am oberen Ende der Wiederholungsspanne schaffst. Kürzerer Anpassungs-Zeitraum = reagiert schneller, aber anfälliger für Wasserschwankungen.</p>
    </section>

    <section class="card">
      <h3>Daten & Backup</h3>
      <p class="small">Alle Daten liegen nur auf diesem Gerät (${counts}). Wenn du den Browser-Speicher löschst oder das Handy wechselst, sind sie weg – exportiere deshalb regelmäßig ein Backup, z. B. in iCloud/Google Drive.</p>
      <button class="btn primary block" data-action="exportData">Backup exportieren</button>
      <label class="btn ghost block file-btn">Backup importieren<input type="file" accept="application/json,.json" id="import-file" data-change="importData" hidden></label>
    </section>

    <section class="card">
      <h3>Als App installieren</h3>
      <p class="small"><strong>iPhone:</strong> In Safari öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.<br>
      <strong>Android:</strong> In Chrome öffnen → Menü ⋮ → „App installieren“.</p>
      <p class="small muted">Danach startet die App im Vollbild und funktioniert auch offline im Gym.</p>
    </section>

    <section class="card">
      <h3>Zurücksetzen</h3>
      <button class="btn ghost danger block" data-action="resetAll">Alle Daten löschen</button>
    </section>`;
}

export const actions = {
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
          throw new Error('Kein Gym-Tracker-Backup');
        }
        if (!confirm('Backup importieren? Die aktuellen Daten auf diesem Gerät werden ersetzt.')) return;
        replaceState(data);
        toast('Backup importiert');
        navigate('#/');
      } catch (e) {
        alert(`Import fehlgeschlagen: ${e.message}`);
      } finally {
        el.value = '';
      }
    });
    return false;
  },
  resetAll() {
    if (!confirm('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.')) return false;
    if (!confirm('Sicher? Vorher besser ein Backup exportieren.')) return false;
    replaceState(defaultState());
    navigate('#/');
  },
};
