import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../js/i18n.js';
import { exName, canonicalExName, noteText } from '../js/names.js';

test('Übungsnamen folgen der Sprache, gespeichert bleibt das Original', () => {
  setLang('en');
  assert.equal(exName('Kreuzheben'), 'Deadlift');
  assert.equal(noteText('Gewicht pro Hantel'), 'Weight per dumbbell');
  assert.equal(exName('Mein eigener Name'), 'Mein eigener Name');
  setLang('de');
  assert.equal(exName('Kreuzheben'), 'Kreuzheben');
  assert.equal(exName('Deadlift'), 'Kreuzheben');
  // Eingaben in beiden Sprachen landen beim selben gespeicherten Namen
  assert.equal(canonicalExName('deadlift'), 'Kreuzheben');
  assert.equal(canonicalExName('Kreuzheben'), 'Kreuzheben');
  assert.equal(canonicalExName('Neue Übung'), 'Neue Übung');
});
