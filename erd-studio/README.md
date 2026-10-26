# ERD Studio

Visualisierung von Datenmodellen im eigenen **Kernmodell-Format** (JSON), im Stil von dbdiagram.io.
Backend: Spring Boot 3.4 (Java 21). Frontend: React 18 + React Flow.

## Funktionen

- ER-Diagramm mit Krähenfuß-Notation (1, 0..1, 0..n, 1..n), Linien von Spalte zu Spalte
- Tabellen verschieben, Auto-Layout, Layout speichern (Strg/Cmd+S)
- Domänen farbig, per Legende ein- und ausblendbar
- Suche über Tabellen und Spalten (Enter zoomt auf Treffer)
- Detailspalte: Spalten, fachliche Namen, Klassifizierung, Governance, Beziehungen
- Prüfung gegen JSON Schema **und** referenzielle Integrität (IDs, PK/FK-Verweise, Namen)
- Export: DBML, Mermaid, Snowflake DDL, Kernmodell-JSON
- Import einer Kernmodell-Datei, ungültige Modelle werden mit Befundliste abgelehnt

## Bearbeiten

Oben auf **Bearbeiten** umschalten. Änderungen bleiben lokal, bis **Speichern** (Strg/Cmd+S) gedrückt wird;
der Server prüft dann Schema und Referenzen und lehnt fehlerhafte Modelle mit Befundliste ab.
Während der Arbeit läuft dieselbe Prüfung im Hintergrund, das Ergebnis steht im Prüf-Badge.

| Aktion | So geht's |
|---|---|
| Tabelle anlegen | **+ Tabelle** (bekommt eine PK-Spalte `ID`) |
| Tabelle/Spalten ändern | Tabelle anklicken, rechts im Formular |
| Spalte anlegen, sortieren, löschen | **+ Spalte**, ↑ ↓, × im Formular |
| Primärschlüssel | Haken **PK** (setzt automatisch NOT NULL) |
| Beziehung Spalte → Spalte | Über eine Zeile fahren, Punkt am Rand auf die Zielspalte ziehen. Richtung wird erkannt: die Seite ohne Schlüssel wird FK |
| Beziehung Tabelle → Tabelle | Punkt am Tabellenkopf auf die Elterntabelle ziehen. FK-Spalten werden aus deren PK angelegt |
| Kardinalität, identifizierend | Beziehung anklicken, rechts im Formular |
| Löschen | Element auswählen, Entf (Tabellen nehmen ihre Beziehungen mit) |
| Rückgängig / Wiederholen | ↶ ↷ oder Strg+Z / Strg+Y (außerhalb von Eingabefeldern) |
| Modell, Domänen | **Modell & Domänen** |
| Neues Modell | **Neu** |

Beim Ändern eines Datentyps wird ein vorhandener Originaltyp (`nativeType`) verworfen, damit der neue Typ in alle Exporte geht.

## Starten

**Variante A – ein JAR (Frontend ist bereits gebaut und liegt in `backend/src/main/resources/static`):**

```bash
cd backend
mvn package
java -jar target/erd-studio-0.1.0.jar
# http://localhost:8080
```

**Variante B – Entwicklung mit Hot Reload:**

```bash
cd backend && mvn spring-boot:run        # API auf :8080
cd frontend && npm install && npm run dev # UI auf :5173, /api wird an :8080 weitergeleitet
```

Nach Frontend-Änderungen `npm run build` ausführen; das Ergebnis landet direkt in den Backend-Ressourcen.

## Ablage

Modelle liegen als Dateien in `./models` (änderbar über `erd.model-dir` in `application.yml`):

- `{model-id}.json` – das Kernmodell
- `{model-id}.layout.json` – nur die Tabellenpositionen

Das Layout ist bewusst getrennt, damit Verschieben keine fachliche Modelländerung erzeugt.
Das Verzeichnis kann ein Git-Arbeitsverzeichnis sein (Review per Merge Request).
Beim ersten Start werden zwei Beispielmodelle angelegt.

## REST-API

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/models` | Modellliste |
| GET | `/api/models/{id}` | Modell |
| POST | `/api/models` | Neues Modell importieren (422 bei Befunden, 409 wenn ID existiert) |
| PUT | `/api/models/{id}` | Modell ersetzen |
| POST | `/api/validate` | Modell prüfen, ohne zu speichern |
| GET | `/api/models/{id}/validation` | Gespeichertes Modell prüfen |
| GET/PUT | `/api/models/{id}/layout` | Positionen lesen/speichern |
| GET | `/api/formats` | Verfügbare Exportformate |
| GET | `/api/models/{id}/export/{format}` | Export (`dbml`, `mermaid`, `snowflake-ddl`) |

## Neues Austauschformat ergänzen

Eine Klasse, die `ModelExporter` implementiert und mit `@Component` annotiert ist.
Sie erscheint automatisch in `/api/formats` und im Export-Menü. Der Kern bleibt unverändert.

## Projektstruktur

```
backend/
  model/        Kernmodell (Java Records), Layout
  validation/   ModelValidator (JSON Schema), ReferenceChecker (Integrität, reines Java)
  export/       ModelExporter + DBML, Mermaid, Snowflake DDL
  repository/   Dateiablage, atomares Schreiben, Schutz vor Path Traversal
  service/      Geschäftslogik
  web/          REST-Controller, Fehlerbehandlung
  resources/    schema/kernmodell.schema.json, samples/, static/ (gebautes Frontend)
frontend/src/
  App.tsx       Werkzeugleiste, Zustand, Import/Export
  diagram.ts    Modell → Knoten/Kanten, Auto-Layout (dagre)
  TableNode.tsx Tabellendarstellung
  Markers.tsx   Krähenfuß-Symbole
  DetailPanel.tsx  Ansicht (nur lesen)
  editor/
    ops.ts        Modelloperationen als reine Funktionen (Grundlage für Undo)
    useHistory.ts Undo/Redo mit Zusammenfassen von Tipp-Eingaben
    EntityEditor.tsx, RelationshipEditor.tsx, ModelEditor.tsx
```

## Bekannte Grenzen

- Keine Anmeldung und keine Rollen. Vor dem Betrieb im Netz Spring Security (z. B. AD/LDAP oder OIDC) ergänzen.
- Bei zusammengesetzten Fremdschlüsseln wird die Linie an der ersten Spalte angesetzt.
- Exporte nutzen den gespeicherten Stand; vor dem Export speichern.
- Mehrere Personen am selben Modell überschreiben sich gegenseitig (letzter Speichervorgang gewinnt). Für Teamarbeit Git-Ablage mit Review nutzen oder Versionsprüfung beim Speichern ergänzen.
