# Gym Tracker

Mobile Web-App (PWA) für Trainingsplan & Progress, Körpergewicht, Ernährung und Ziele – mit Kalorienrechner, der sich anhand deiner echten Daten selbst nachjustiert. Läuft im Browser, lässt sich auf dem Handy wie eine App installieren und funktioniert offline. Keine Accounts, kein Server: alle Daten bleiben auf deinem Gerät.

## Funktionen

**Training**
- Trainingsplan mit Trainingstagen (z. B. Push / Pull / Leg Day), festen Wochentagen und Übungen mit Sätzen, Wiederholungs-Spanne, Startgewicht, Satzpause und Notiz
- Live-Training: Werte vom letzten Mal sind vorausgefüllt, Sätze werden abgehakt, danach startet automatisch der Pausen-Timer
- Doppelte Progression: Schaffst du in allen Sätzen das obere Ende der Wdh-Spanne, schlägt die App beim nächsten Mal mehr Gewicht vor (Steigerung in den Einstellungen, Standard 2,5 kg)
- Verlauf je Training und je Übung inkl. Diagramm (geschätztes 1RM + schwerstes Gewicht) und PR-Markierung

**Gewicht**
- Tägliches Wiegen, 7-Tage-Durchschnitt, Trend in kg/Woche (lineare Regression über 3 Wochen)

**Ernährung**
- Einträge nach Mahlzeit mit kcal, Protein, Kohlenhydraten, Fett – entweder pro Portion oder pro 100 g mit Menge
- Gespeicherte Lebensmittel zum schnellen Eintragen, „Vortag kopieren“
- Fortschrittsbalken gegen dein Tagesziel

**Ziele & Kalorienrechner**
- Ziele: Abnehmen/Muskeln erhalten, Rekomposition, Halten, Lean Bulk – jeweils mit wählbarem Tempo in % Körpergewicht pro Woche
- Grundumsatz nach Mifflin-St Jeor (oder Katch-McArdle, wenn Körperfett bekannt) × Aktivitätsfaktor
- Makros: Protein und Fett in g/kg (anpassbar), Rest Kohlenhydrate

**Automatische Anpassung**
Isst du z. B. dein Ziel, aber das Gewicht bewegt sich nicht, stimmt die Formel für dich nicht. Die App berechnet deshalb aus den letzten 21 Tagen deinen *tatsächlichen* Verbrauch:

```
echter Verbrauch = Ø gegessene kcal − (Gewichtstrend in kg/Tag × 7700)
```

und schlägt ein neues Tagesziel vor. Damit Wasserschwankungen nicht zu Überreaktionen führen, ändert sich der Wert pro Check-in um höchstens 300 kcal. Voraussetzung: mindestens 6 Wiegungen über 2 Wochen und ~60 % der Tage geloggt. Unvollständig geloggte Tage kannst du ausschließen.

## Installieren aufs Handy

1. App-URL öffnen (siehe unten)
2. **iPhone:** Safari → Teilen → „Zum Home-Bildschirm“ · **Android:** Chrome → ⋮ → „App installieren“

## Hosting über GitHub Pages

Einmalig im Repo: **Settings → Pages → Build and deployment → Source: „GitHub Actions“**. Danach veröffentlicht der Workflow `.github/workflows/pages.yml` die App bei jedem Push unter `https://<user>.github.io/Gym-Tracker-/`.

## Daten & Backup

Alles liegt im `localStorage` des Browsers. Unter Einstellungen (Zahnrad) lässt sich ein JSON-Backup exportieren und wieder importieren – regelmäßig machen, besonders vor einem Handywechsel.

## Entwicklung

Kein Build-Schritt, reines HTML/CSS/JavaScript (ES-Module).

```bash
npm start   # lokaler Server auf http://localhost:8080
npm test    # Tests für Kalorien-, Trend- und Progressionslogik
```

Nach Änderungen an App-Dateien `VERSION` in `sw.js` erhöhen, damit installierte Apps den neuen Stand laden.
