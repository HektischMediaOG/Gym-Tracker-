// Neue Studien zu Krafttraining, Ernährung und Regeneration.
// news.json wird täglich vom GitHub-Workflow aus Europe PMC (inkl. PubMed) erzeugt.
import { state, save } from '../store.js';
import { esc, fmtDate } from '../util.js';
import { render as rerender } from '../app.js';

let news = null; // {updatedAt, topics, items, errors}
let loading = null;
let failed = false;
let topic = 'all';
let newThisVisit = null; // IDs, die beim Öffnen der Seite neu waren

export function loadNews() {
  if (loading) return loading;
  loading = fetch('news.json', { cache: 'no-cache' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      news = data;
      failed = false;
    })
    .catch(() => {
      failed = true;
    })
    .finally(() => {
      loading = null;
      rerender();
    });
  return loading;
}

export function unseenCount() {
  if (!news?.items) return 0;
  const seen = new Set(state.news.seen);
  return news.items.filter((i) => !seen.has(i.id)).length;
}

function markAllSeen() {
  const ids = news.items.map((i) => i.id);
  // Nur aktuelle IDs behalten, damit die Liste nicht endlos wächst
  state.news.seen = [...new Set([...ids, ...state.news.seen])].slice(0, 600);
  save();
}

export function render() {
  if (!news) {
    if (!failed) loadNews();
    return `<h1 class="page-title">Neue Studien</h1>
      <p class="muted center">${failed ? 'Studien konnten nicht geladen werden. Bist du offline?' : 'Lade …'}</p>
      ${failed ? '<button class="btn block" data-action="reloadNews">Erneut versuchen</button>' : ''}`;
  }

  if (!newThisVisit) {
    const seen = new Set(state.news.seen);
    newThisVisit = new Set(news.items.filter((i) => !seen.has(i.id)).map((i) => i.id));
    markAllSeen();
  }

  const labels = Object.fromEntries((news.topics || []).map((t) => [t.id, t.label]));
  const items = news.items.filter((i) => topic === 'all' || i.topics.includes(topic));
  const chips = [['all', 'Alle'], ...(news.topics || []).map((t) => [t.id, t.label])]
    .map(([id, label]) => `<button class="chip ${topic === id ? 'on' : ''}" data-action="newsTopic" data-topic="${id}">${esc(label)}</button>`)
    .join('');

  const list = items.length
    ? items
        .map(
          (i) => `<article class="card news-item">
            <div class="news-meta">
              <span class="badge type-${esc(i.type.toLowerCase().replace(/\s+/g, '-'))}">${esc(i.type)}</span>
              ${i.topics.map((t) => `<span class="badge soft">${esc(labels[t] || t)}</span>`).join('')}
              ${newThisVisit.has(i.id) ? '<span class="badge new">Neu</span>' : ''}
            </div>
            <h3><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a></h3>
            <p class="small muted">${esc(i.journal)}${i.journal && i.date ? ' · ' : ''}${i.date ? fmtDate(i.date, { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}</p>
            ${i.authors ? `<p class="small muted">${esc(i.authors)}</p>` : ''}
            ${i.abstract ? `<details><summary>Abstract</summary><p class="small abstract">${esc(i.abstract)}</p></details>` : ''}
            <a class="small link" href="${esc(i.url)}" target="_blank" rel="noopener">Studie öffnen ↗</a>
          </article>`
        )
        .join('')
    : '<p class="muted center">Keine Studien in diesem Bereich.</p>';

  return `<h1 class="page-title">Neue Studien</h1>
    <p class="small muted">Meta-Analysen, Reviews und RCTs der letzten ${news.days || 60} Tage aus PubMed/Europe PMC${news.updatedAt ? ` (Stand ${fmtDate(news.updatedAt.slice(0, 10), { day: '2-digit', month: '2-digit' })})` : ''}. Titel und Abstracts sind englisch – Chrome übersetzt die Seite über ⋮ → Übersetzen.</p>
    ${news.errors?.length ? `<p class="warn small">Nicht alle Bereiche konnten aktualisiert werden.</p>` : ''}
    <div class="chips">${chips}</div>
    ${list}`;
}

export const actions = {
  newsTopic(el) {
    topic = el.dataset.topic;
  },
  reloadNews() {
    failed = false;
    loadNews();
  },
};

// Beim Verlassen der Seite zurücksetzen, damit "Neu" beim nächsten Besuch neu berechnet wird
window.addEventListener('hashchange', () => {
  if (!location.hash.startsWith('#/news')) newThisVisit = null;
});
