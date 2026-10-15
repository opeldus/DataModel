'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const DM = require('../src/model.js');

const sample = () => JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/bibliothek.schema.json'), 'utf8'));

test('neues Modell ist ein JSON Schema 2020-12', () => {
  const m = DM.createModel('Mein Modell');
  assert.equal(m.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(m.$id, 'https://example.org/schemas/mein-modell.schema.json');
  assert.deepEqual(m.$defs, {});
});

test('Beispielmodell ist fehlerfrei', () => {
  const issues = DM.validateModel(sample()).filter((i) => i.level === 'error');
  assert.deepEqual(issues, []);
});

test('Umbenennen einer Entität passt alle Verweise an und erhält die Reihenfolge', () => {
  const m = sample();
  DM.renameEntity(m, 'Person', 'Autor');
  assert.deepEqual(Object.keys(m.$defs), ['Buch', 'Autor', 'Verlag', 'Mitglied', 'Ausleihe']);
  assert.equal(m.$defs.Buch.properties.autoren.items.$ref, '#/$defs/Autor');
  assert.equal(m.$defs.Mitglied.properties.person.$ref, '#/$defs/Autor');
  assert.throws(() => DM.renameEntity(m, 'Autor', 'Buch'), /bereits vergeben/);
  assert.throws(() => DM.renameEntity(m, 'Autor', '1x'), /Ungültig/);
});

test('Verweise finden und unbekannte Verweise melden', () => {
  const m = sample();
  assert.deepEqual(DM.findReferences(m, 'Person'), ['Buch.autoren', 'Mitglied.person']);
  DM.deleteEntity(m, 'Verlag');
  const errors = DM.validateModel(m).filter((i) => i.level === 'error');
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Verlag/);
});

test('Eigenschaften umbenennen hält required konsistent', () => {
  const m = sample();
  const buch = m.$defs.Buch;
  DM.renameProperty(buch, 'titel', 'name');
  assert.ok(buch.required.includes('name'));
  assert.ok(!buch.required.includes('titel'));
  assert.equal(Object.keys(buch.properties)[2], 'name');
  DM.deleteProperty(buch, 'name');
  assert.ok(!buch.required.includes('name'));
});

test('describeProperty erkennt Typen, Listen, Verweise und null', () => {
  const m = sample();
  const p = m.$defs.Buch.properties;
  assert.deepEqual(DM.describeProperty(p.titel), { kind: 'primitive', type: 'string', ref: null, list: false, nullable: false });
  assert.deepEqual(DM.describeProperty(p.autoren), { kind: 'ref', type: null, ref: 'Person', list: true, nullable: false });
  assert.deepEqual(DM.describeProperty(p.schlagworte), { kind: 'primitive', type: 'string', ref: null, list: true, nullable: false });
  assert.equal(DM.describeProperty(m.$defs.Person.properties.geburtsdatum).nullable, true);
  assert.equal(DM.describeProperty({ oneOf: [{ type: 'string' }, { type: 'integer' }] }).kind, 'custom');
});

test('setPropertyType: Liste ein/aus behält Einschränkungen und Beschreibung', () => {
  let s = { type: 'string', format: 'email', description: 'Mail', maxLength: 99 };
  s = DM.setPropertyType(s, { type: 'string', list: true, nullable: false });
  assert.deepEqual(s, { type: 'array', description: 'Mail', items: { type: 'string', format: 'email', maxLength: 99 } });
  s.minItems = 1;
  s = DM.setPropertyType(s, { type: 'string', list: false, nullable: false });
  assert.deepEqual(s, { type: 'string', description: 'Mail', format: 'email', maxLength: 99 });
});

test('setPropertyType: Typwechsel entfernt unpassende Schlüsselwörter', () => {
  let s = { type: 'string', format: 'date', enum: ['a'], description: 'x' };
  s = DM.setPropertyType(s, { type: 'integer', list: false, nullable: false });
  assert.deepEqual(s, { type: 'integer', description: 'x' });
  s.minimum = 0;
  s = DM.setPropertyType(s, { ref: 'Person', list: false, nullable: false });
  assert.deepEqual(s, { $ref: '#/$defs/Person', description: 'x' });
});

test('setPropertyType: null-fähige Typen und Verweise', () => {
  let s = DM.setPropertyType({ type: 'string' }, { type: 'string', list: false, nullable: true });
  assert.deepEqual(s.type, ['string', 'null']);
  s = DM.setPropertyType({ $ref: '#/$defs/Person' }, { ref: 'Person', list: false, nullable: true });
  assert.deepEqual(s, { anyOf: [{ $ref: '#/$defs/Person' }, { type: 'null' }] });
  assert.deepEqual(DM.describeProperty(s), { kind: 'ref', type: null, ref: 'Person', list: false, nullable: true });
  s = DM.setPropertyType(s, { ref: 'Person', list: false, nullable: false });
  assert.deepEqual(s, { $ref: '#/$defs/Person' });
});

test('Import: draft-07 "definitions" werden nach $defs überführt', () => {
  const m = DM.normalizeModel({
    $schema: 'http://json-schema.org/draft-07/schema#',
    definitions: { A: { type: 'object', properties: { b: { $ref: '#/definitions/B' } } }, B: { type: 'object', properties: {} } },
  });
  assert.equal(m.$defs.A.properties.b.$ref, '#/$defs/B');
  assert.equal(m.definitions, undefined);
  assert.equal(m.$schema, DM.DIALECT);
});

test('Import und Export: OpenAPI 3.1 hin und zurück', () => {
  const m = sample();
  const oas = DM.toOpenAPI(m);
  assert.equal(oas.openapi, '3.1.0');
  assert.equal(oas.info.title, 'Bibliothek');
  assert.equal(oas.components.schemas.Buch.properties.verlag.$ref, '#/components/schemas/Verlag');
  const back = DM.normalizeModel(oas);
  assert.deepEqual(back.$defs, m.$defs);
});

test('Import: einzelnes Objekt-Schema wird zur Entität', () => {
  const m = DM.normalizeModel({ title: 'Adresse', type: 'object', properties: { ort: { type: 'string' } }, required: ['ort'] });
  assert.deepEqual(Object.keys(m.$defs), ['Adresse']);
  assert.deepEqual(m.$defs.Adresse.required, ['ort']);
});

test('Beispiel-Instanz berücksichtigt Formate, Defaults und Verweise', () => {
  const m = sample();
  const ex = DM.generateExample(m, 'Ausleihe', 2);
  assert.equal(ex.verlaengerungen, 0);
  assert.equal(ex.faelligAm, '2026-01-31');
  assert.equal(ex.mitglied.email, 'max.mustermann@example.org');
  assert.equal(ex.mitglied.aktiv, true);
  assert.equal(ex.buch.sprache, 'de');
  // Rekursionstiefe erreicht: Verweise werden weggelassen statt als $ref ausgegeben.
  assert.deepEqual(ex.buch.autoren, []);
  assert.equal(ex.buch.verlag, undefined);
});

test('Export bereinigt leere Beschreibungen und Pflichtlisten', () => {
  const m = DM.createModel('X');
  const n = DM.addEntity(m, 'A');
  DM.addProperty(m.$defs[n], 'f');
  const out = DM.toJSONSchema(m);
  assert.equal(out.description, undefined);
  assert.equal(out.$defs.A.required, undefined);
  assert.equal(out.$defs.A.properties.f.description, undefined);
  assert.equal(m.$defs.A.description, '');
});

test('Prüfung meldet widersprüchliche Grenzen und ungültige Regex', () => {
  const m = DM.createModel('X');
  m.$defs.A = { type: 'object', properties: { n: { type: 'integer', minimum: 5, maximum: 1 }, s: { type: 'string', pattern: '(' } }, required: ['fehlt'] };
  const msgs = DM.validateModel(m).filter((i) => i.level === 'error').map((i) => i.path);
  assert.deepEqual(msgs.sort(), ['A', 'A.n', 'A.s']);
});
