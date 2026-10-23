// Zweisprachigkeit: Texte stehen direkt im Code als L('Deutsch', 'English').
// Bewusst ohne Schlüssel-Wörterbuch, damit beide Fassungen beieinander bleiben.

let lang = 'en';

export function setLang(next) {
  lang = next === 'de' ? 'de' : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function getLang() {
  return lang;
}

export function L(de, en) {
  return lang === 'de' ? de : en;
}

export function locale() {
  return lang === 'de' ? 'de-DE' : 'en-GB';
}
