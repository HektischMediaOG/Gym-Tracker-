// Übersetzung der Plan-Inhalte (Übungsnamen, Notizen).
// Gespeichert wird immer der ursprüngliche Name, damit der Verlauf einer Übung
// nicht in zwei Hälften zerfällt, wenn die Sprache gewechselt wird. Übersetzt
// wird nur bei der Anzeige; eigene Übungen ohne Eintrag bleiben unverändert.
import { getLang } from './i18n.js';
import { normName } from './util.js';

const EXERCISES = {
  Dips: 'Dips',
  'Kurzhantel Schrägbankdrücken': 'Incline Dumbbell Press',
  'Butterfly Maschine': 'Machine Flyes',
  'Kurzhantel Schulterdrücken': 'Dumbbell Shoulder Press',
  Seitheben: 'Lateral Raises',
  Trizepsdrücken: 'Triceps Press',
  Kreuzheben: 'Deadlift',
  Latzug: 'Lat Pulldown',
  'Face Pulls': 'Face Pulls',
  'Hammer Curls': 'Hammer Curls',
  'Unterarm Curls': 'Forearm Curls',
  'Unterarm-Rotation mit Kurzhantel': 'Dumbbell Pronation/Supination',
  'Chest Press Uni': 'Chest Press Uni',
  'Overhead Dumbbell Press': 'Overhead Dumbbell Press',
  'Overhead Trizepsdrücken': 'Overhead Triceps Press',
  'Crunch Maschine': 'Crunch Machine',
  'Latzug Maschine': 'Machine Lat Pulldown',
  'Kabelrudern breit': 'Wide-Grip Cable Row',
  'Preacher Curls': 'Preacher Curls',
  'Reverse Grip Curls': 'Reverse Grip Curls',
  Beinbeuger: 'Leg Curls',
  Kniebeugen: 'Squats',
  Beinstrecker: 'Leg Extensions',
  Wadenheben: 'Calf Raises',
  'Upright Rows': 'Upright Rows',
};

const NOTES = {
  'Körpergewicht, bis zum Versagen': 'Bodyweight, to failure',
  'Gewicht pro Hantel': 'Weight per dumbbell',
  'Supersatz mit Seitheben · Gewicht pro Hantel': 'Superset with lateral raises · weight per dumbbell',
  'Supersatz mit Seitheben': 'Superset with lateral raises',
  'Supersatz mit Unterarm-Rotation': 'Superset with pronation/supination',
  'Kurzhanteln hängen lassen, Hand nach innen und außen drehen – Wdh und Gewicht bitte anpassen':
    'Let dumbbells hang, rotate hands in and out – please adjust reps and weight',
};

function lookup(table) {
  const toEn = new Map(Object.entries(table).map(([de, en]) => [normName(de), en]));
  const toDe = new Map(Object.entries(table).map(([de, en]) => [normName(en), de]));
  const deByKey = new Map(Object.keys(table).map((de) => [normName(de), de]));
  return {
    // Stored → aktuelle Sprache
    show(text) {
      if (!text) return text;
      const key = normName(text);
      if (getLang() === 'en') return toEn.get(key) ?? text;
      return deByKey.get(key) ?? toDe.get(key) ?? text;
    },
    // Eingabe in beliebiger Sprache → gespeicherte Form
    canonical(text) {
      const key = normName(text);
      return toDe.get(key) ?? deByKey.get(key) ?? text;
    },
  };
}

const ex = lookup(EXERCISES);
const notes = lookup(NOTES);

export const exName = ex.show;
export const canonicalExName = ex.canonical;
export const noteText = notes.show;
export const canonicalNote = notes.canonical;
