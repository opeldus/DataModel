# DataModel

Browser-Oberfläche zum Erstellen und Bearbeiten von Datenmodellen. Die Modelle werden als
**JSON** gespeichert – konkret als [JSON Schema 2020-12](https://json-schema.org/draft/2020-12),
dem offenen Standard für die Beschreibung von JSON-Daten.

## Starten

Keine Installation, kein Build-Schritt – reines HTML/CSS/JavaScript ohne Abhängigkeiten.

```sh
npm start            # entspricht: python3 -m http.server 8080
# dann http://localhost:8080 öffnen
```

`index.html` lässt sich auch direkt per Doppelklick öffnen; nur der Knopf „Beispiel“ braucht einen Webserver.

## Funktionen

- **Entitäten** anlegen, umbenennen (alle Verweise werden mitgezogen), duplizieren, sortieren, löschen
  (mit Warnung, wenn sie noch verwendet werden).
- **Eigenschaften** mit Typ (`string`, `integer`, `number`, `boolean`, `object`, beliebig),
  **Beziehungen** zu anderen Entitäten, Listen, Pflichtfeldern, `null`-Werten und Einschränkungen
  (Format, Länge, Regex, Minimum/Maximum, Aufzählungen, Standardwerte, `readOnly`, `deprecated` …).
- Für Sonderfälle (`oneOf`, `allOf`, …) kann jedes Eigenschafts-Schema direkt als JSON bearbeitet werden.
  Unbekannte Schlüsselwörter bleiben beim Bearbeiten erhalten.
- **Diagramm** aller Entitäten und Beziehungen (Kästen per Maus anordnen).
- **JSON-Ansicht** zum direkten Bearbeiten des gesamten Dokuments.
- **Beispieldaten** werden automatisch aus dem Schema erzeugt.
- **Laufende Prüfung**: unbekannte Verweise, fehlende Pflichtfelder, widersprüchliche Grenzen, ungültige Regex …
- Rückgängig/Wiederholen, automatische Zwischenspeicherung im Browser, Drag & Drop von Dateien,
  Tastenkürzel (Strg+S, Strg+O, Strg+Z, Strg+Umschalt+Z).

## Offene Standards

| Zweck | Standard |
|---|---|
| Speicherformat | JSON Schema 2020-12 (`$schema`, `$id`, `$defs`, `$ref`) |
| Export | OpenAPI 3.1 (`components.schemas`), JSON Schema, Beispiel-Instanz |
| Import | JSON Schema 2020-12, ältere Drafts mit `definitions` (z. B. draft-07), OpenAPI 3.x, einzelne Objekt-Schemas |
| Formate | `format`-Werte aus JSON Schema (`date`, `date-time`, `email`, `uri`, `uuid`, …) |

Aufbau einer gespeicherten Datei:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.org/schemas/bibliothek.schema.json",
  "title": "Bibliothek",
  "$defs": {
    "Buch": {
      "type": "object",
      "properties": {
        "titel":   { "type": "string", "minLength": 1 },
        "autoren": { "type": "array", "items": { "$ref": "#/$defs/Person" } }
      },
      "required": ["titel"]
    },
    "Person": { "type": "object", "properties": { "name": { "type": "string" } } }
  }
}
```

Da es sich um gewöhnliches JSON Schema handelt, können die Dateien direkt mit gängigen Validatoren
(z. B. Ajv, `jsonschema` für Python), Code-Generatoren oder OpenAPI-Werkzeugen weiterverwendet werden.
Eine optionale **Wurzel-Entität** (`"$ref"` auf oberster Ebene) legt fest, gegen welche Entität Dokumente validiert werden.

Die Anordnung im Diagramm wird bewusst nur lokal im Browser gespeichert, damit die Datei frei von
proprietären Erweiterungen bleibt.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Seitengerüst |
| `src/model.js` | Modell-Logik ohne DOM (Umbenennen, Typen, Prüfung, Beispieldaten, Import/Export) – läuft auch in Node |
| `src/app.js` | Oberfläche |
| `src/diagram.js` | SVG-Diagramm |
| `src/styles.css` | Gestaltung (helles und dunkles Farbschema) |
| `examples/bibliothek.schema.json` | Beispielmodell |
| `test/model.test.js` | Tests der Modell-Logik |

## Tests

```sh
npm test
```
