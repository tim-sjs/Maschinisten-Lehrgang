# Maschinisten Lerntrainer

Kleine statische Web-App zum Lernen für den Feuerwehr-Maschinistenlehrgang.

## Funktionen

- 20 Zufallsfragen pro Runde
- automatische Auswertung mit **Bestehensgrenze 50 %**
- vollständiger Fragenkatalog mit den im PDF markierten richtigen Antworten
- ohne Backend, daher gut für **GitHub Pages**

## Lokal nutzen

1. `npm install`
2. `npm run build:data`
3. `index.html` im Browser öffnen

## Auf GitHub veröffentlichen

1. Repository nach GitHub pushen
2. In GitHub unter **Settings → Pages**
3. Als Source **Deploy from a branch** wählen
4. Branch **main** und Ordner **/(root)** auswählen

Danach ist die App direkt per Web erreichbar.

## Frage-Daten neu erzeugen

Wenn sich `MA_Fragenkatalog.pdf` ändert:

1. PDF ersetzen
2. `npm run build:data`
3. `npm test`

Die Fragen und richtigen Antworten werden aus den gelb markierten Lösungen im PDF erzeugt.
