import { state, save, saveNow } from './store.js';
import * as home from './views/home.js';
import * as training from './views/training.js';
import * as food from './views/food.js';
import * as weight from './views/weight.js';
import * as goals from './views/goals.js';
import * as settings from './views/settings.js';

const views = { home, training, food, weight, goals, settings };

// Route → [View, Render-Funktion, Tab]
const routes = {
  '': [home, 'render', 'home'],
  training: [training, 'renderPlan', 'training'],
  plan: [training, 'renderDayEditor', 'training'],
  workout: [training, 'renderWorkout', 'training'],
  history: [training, 'renderHistory', 'training'],
  session: [training, 'renderSession', 'training'],
  exercise: [training, 'renderExercise', 'training'],
  food: [food, 'render', 'food'],
  weight: [weight, 'render', 'weight'],
  goals: [goals, 'render', 'goals'],
  settings: [settings, 'render', 'settings'],
};

const actions = {};
for (const v of Object.values(views)) Object.assign(actions, v.actions || {});

const TABS = [
  ['home', '#/', 'Heute', 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  ['training', '#/training', 'Training', 'M2 10h2v4H2zM20 10h2v4h-2zM5 7h3v10H5zM16 7h3v10h-3zM8 11h8v2H8z'],
  ['food', '#/food', 'Essen', 'M7 2v9a3 3 0 0 0 2 2.8V22h2v-8.2A3 3 0 0 0 13 11V2h-2v6h-1V2H9v6H8V2zM17 2c-1.7 0-3 2.2-3 5v6h2v9h2V2z'],
  ['weight', '#/weight', 'Gewicht', 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm7 3a5 5 0 0 0-4.9 4h2.1a3 3 0 0 1 2.3-1.9l1.2 2.4 1.8-.9-1-2.1A3 3 0 0 1 14.8 11h2.1A5 5 0 0 0 12 7z'],
  ['goals', '#/goals', 'Ziele', 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 4a6 6 0 1 1-6 6 6 6 0 0 1 6-6zm0 3a3 3 0 1 0 3 3 3 3 0 0 0-3-3z'],
];

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = hash.split('/');
  return { name: routes[name] ? name : '', params: rest.map(decodeURIComponent) };
}

export function navigate(path) {
  if (location.hash === path) render();
  else location.hash = path;
}

let renderQueued = false;
export function render() {
  if (renderQueued) return;
  renderQueued = true;
  // Verzögert, damit der Fokus nach einem "change" schon im nächsten Feld ist
  // und wir ihn nach dem Neuzeichnen wiederherstellen können.
  setTimeout(renderNow, 0);
}

function renderNow() {
  renderQueued = false;
  const { name, params } = parseRoute();
  const [view, fn, tab] = routes[name];
  const main = document.getElementById('main');

  const active = document.activeElement;
  const focusId = active && active.id && main.contains(active) ? active.id : null;
  let sel = null;
  try { sel = focusId ? [active.selectionStart, active.selectionEnd] : null; } catch { sel = null; }
  const scroll = window.scrollY;
  const sameRoute = main.dataset.route === location.hash;

  main.innerHTML = view[fn](...params);
  main.dataset.route = location.hash;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  document.getElementById('settings-link').classList.toggle('active', tab === 'settings');

  if (sameRoute) window.scrollTo(0, scroll);
  else window.scrollTo(0, 0);

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus({ preventScroll: true });
      if (sel && sel[0] !== null) {
        try { el.setSelectionRange(sel[0], sel[1]); } catch { /* nicht jeder Input-Typ kann das */ }
      }
    }
  }
  renderTimer();
}

function renderShell() {
  document.getElementById('tabbar').innerHTML = TABS.map(
    ([tab, href, label, icon]) => `<a href="${href}" data-tab="${tab}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg><span>${label}</span></a>`
  ).join('');
}

// --- Event-Delegation ---

function run(name, el, ev) {
  const fn = actions[name];
  if (!fn) {
    console.warn('Unbekannte Aktion', name);
    return;
  }
  const result = fn(el, ev);
  if (result !== false) {
    save();
    render();
  }
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  ev.preventDefault();
  run(el.dataset.action, el, ev);
});

document.addEventListener('change', (ev) => {
  const el = ev.target.closest('[data-change]');
  if (el) run(el.dataset.change, el, ev);
});

document.addEventListener('input', (ev) => {
  const el = ev.target.closest('[data-input]');
  if (!el) return;
  actions[el.dataset.input]?.(el, ev);
  save();
});

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  run(form.dataset.form, form, ev);
});

// --- Satzpausen-Timer (liegt über allen Views) ---

let timer = null; // {until, total, label}
let timerInterval = null;

export function startRestTimer(seconds, label = '') {
  if (!seconds) return;
  timer = { until: Date.now() + seconds * 1000, total: seconds, label };
  clearInterval(timerInterval);
  timerInterval = setInterval(renderTimer, 250);
  renderTimer();
}

function stopTimer() {
  timer = null;
  clearInterval(timerInterval);
  renderTimer();
}

function renderTimer() {
  const el = document.getElementById('rest-timer');
  if (!timer) {
    el.hidden = true;
    return;
  }
  const left = Math.max(0, Math.round((timer.until - Date.now()) / 1000));
  el.hidden = false;
  el.classList.toggle('done', left === 0);
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  el.querySelector('.time').textContent = left === 0 ? 'Weiter geht’s!' : `${mm}:${ss}`;
  el.querySelector('.timer-label').textContent = timer.label;
  el.querySelector('.progress span').style.width = `${(1 - left / timer.total) * 100}%`;
  if (left === 0 && !timer.notified) {
    timer.notified = true;
    navigator.vibrate?.([200, 100, 200]);
    setTimeout(() => { if (timer && timer.notified) stopTimer(); }, 6000);
  }
}

actions.timerAdd = () => {
  if (timer) {
    timer.until += 30000;
    timer.total += 30;
    timer.notified = false;
  }
  return false;
};
actions.timerStop = () => { stopTimer(); return false; };

// --- Toast ---

let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// --- Start ---

window.addEventListener('hashchange', render);
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

renderShell();
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service Worker nicht registriert', e));
}
// Bittet den Browser, die Daten nicht automatisch zu löschen (v. a. Safari).
navigator.storage?.persist?.().catch(() => {});

export { state };
