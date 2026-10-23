// Kleine Helfer ohne Abhängigkeiten zum DOM oder State.
import { L, locale, getLang } from './i18n.js';

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Akzeptiert "82,5" genauso wie "82.5". Leere Eingaben ergeben null.
export function parseNum(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Zahl für ein Eingabefeld: deutsches Dezimalkomma, leer bei null
export function fmtInput(n) {
  if (n === null || n === undefined || n === '') return '';
  return getLang() === 'de' ? String(n).replace('.', ',') : String(n);
}

export function round(n, digits = 0) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function fmtNum(n, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  return n.toLocaleString(locale(), { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtSigned(n, digits = 1) {
  if (!Number.isFinite(n)) return '–';
  const s = fmtNum(Math.abs(n), digits);
  if (round(n, digits) === 0) return s;
  return (n > 0 ? '+' : '−') + s;
}

// --- Datum: intern immer "YYYY-MM-DD" in lokaler Zeit ---

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today() {
  return toISODate(new Date());
}

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, days) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

// Ganze Tage zwischen zwei ISO-Daten (b - a), robust gegen Sommerzeit.
export function daysBetween(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

// ISO-Wochentag: 1 = Montag … 7 = Sonntag
export function isoWeekday(iso) {
  const d = parseDate(iso).getDay();
  return d === 0 ? 7 : d;
}

const WD_SHORT = { de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] };
const WD_LONG = {
  de: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

// Als Funktionen, damit ein Sprachwechsel sofort greift
export function weekdayShort(i) {
  return WD_SHORT[getLang()][i];
}
export function weekdayLong(i) {
  return WD_LONG[getLang()][i];
}

export function fmtDate(iso, opts = { weekday: 'short', day: '2-digit', month: '2-digit' }) {
  if (!iso) return '';
  return parseDate(iso).toLocaleDateString(locale(), opts);
}

export function fmtDateRelative(iso) {
  const diff = daysBetween(iso, today());
  if (diff === 0) return L('Heute', 'Today');
  if (diff === 1) return L('Gestern', 'Yesterday');
  if (diff === -1) return L('Morgen', 'Tomorrow');
  return fmtDate(iso);
}

export function normName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
