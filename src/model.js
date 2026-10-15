/*
 * Datenmodell-Kern: arbeitet direkt auf JSON-Schema-Dokumenten (Draft 2020-12).
 *
 * Ein Datenmodell ist ein JSON-Schema mit Entitäten unter "$defs". Beziehungen
 * zwischen Entitäten werden als "$ref": "#/$defs/<Name>" abgebildet. Unbekannte
 * Schlüsselwörter bleiben beim Bearbeiten erhalten, damit Dateien verlustfrei
 * mit anderen Werkzeugen ausgetauscht werden können.
 *
 * Läuft ohne Abhängigkeiten im Browser (window.DataModel) und in Node (require).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DataModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DIALECT = 'https://json-schema.org/draft/2020-12/schema';
  const DEFS_PREFIX = '#/$defs/';
  const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_\-]*$/;

  const PRIMITIVE_TYPES = ['string', 'integer', 'number', 'boolean', 'object'];

  // Formate aus JSON Schema 2020-12, Abschnitt 7.3 (Validation-Vokabular).
  const STRING_FORMATS = [
    'date', 'date-time', 'time', 'duration',
    'email', 'idn-email', 'hostname', 'idn-hostname',
    'ipv4', 'ipv6', 'uri', 'uri-reference', 'iri', 'iri-reference',
    'uuid', 'uri-template', 'json-pointer', 'relative-json-pointer', 'regex',
  ];

  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  function createModel(title = 'Neues Datenmodell') {
    return {
      $schema: DIALECT,
      $id: 'https://example.org/schemas/' + slug(title) + '.schema.json',
      title,
      description: '',
      $defs: {},
    };
  }

  function slug(text) {
    return String(text || 'modell')
      .toLowerCase()
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'modell';
  }

  function createEntity(title = '') {
    return { type: 'object', title, description: '', properties: {}, required: [] };
  }

  /** Normalisiert ein importiertes Dokument, ohne fremde Schlüsselwörter zu verlieren. */
  function normalizeModel(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Das Dokument muss ein JSON-Objekt sein.');
    }
    const model = clone(input);
    // Ältere Drafts nutzen "definitions" – nach "$defs" überführen.
    if (model.definitions && !model.$defs) {
      // "$defs" gibt es erst ab 2019-09 – Dialekt daher mit anheben.
      model.$schema = DIALECT;
      model.$defs = model.definitions;
      delete model.definitions;
      replaceRefs(model, (ref) =>
        ref.startsWith('#/definitions/') ? DEFS_PREFIX + ref.slice('#/definitions/'.length) : ref);
    }
    // OpenAPI-Dokumente: components.schemas übernehmen.
    if (!model.$defs && model.openapi && model.components && model.components.schemas) {
      const out = createModel((model.info && model.info.title) || 'Importiertes Modell');
      out.description = (model.info && model.info.description) || '';
      out.$defs = clone(model.components.schemas);
      replaceRefs(out, (ref) =>
        ref.startsWith('#/components/schemas/') ? DEFS_PREFIX + ref.slice('#/components/schemas/'.length) : ref);
      return normalizeModel(out);
    }
    if (!model.$schema) model.$schema = DIALECT;
    if (!model.$defs || typeof model.$defs !== 'object') model.$defs = {};
    // Ein einzelnes Objekt-Schema ohne $defs als eine Entität übernehmen.
    if (Object.keys(model.$defs).length === 0 && model.type === 'object' && model.properties) {
      const name = toName(model.title || 'Entitaet');
      model.$defs[name] = {
        type: 'object',
        title: model.title || name,
        description: model.description || '',
        properties: model.properties,
        required: model.required || [],
      };
      delete model.type; delete model.properties; delete model.required;
    }
    return model;
  }

  function toName(text) {
    const s = String(text).normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss').replace(/[^A-Za-z0-9_]+/g, ' ').trim()
      .split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    return /^[A-Za-z_]/.test(s) ? s : 'E' + s;
  }

  /** Ruft fn für jeden "$ref" im Dokument auf und ersetzt ihn durch den Rückgabewert. */
  function replaceRefs(node, fn) {
    if (Array.isArray(node)) { node.forEach((n) => replaceRefs(n, fn)); return; }
    if (!node || typeof node !== 'object') return;
    for (const key of Object.keys(node)) {
      if (key === '$ref' && typeof node[key] === 'string') node[key] = fn(node[key]);
      else if (key !== 'enum' && key !== 'const' && key !== 'default' && key !== 'examples') replaceRefs(node[key], fn);
    }
  }

  function collectRefs(node, out = []) {
    replaceRefs(node, (ref) => { out.push(ref); return ref; });
    return out;
  }

  const refTo = (name) => DEFS_PREFIX + encodePointer(name);
  const encodePointer = (s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1');
  const decodePointer = (s) => String(s).replace(/~1/g, '/').replace(/~0/g, '~');

  function refTarget(ref) {
    return typeof ref === 'string' && ref.startsWith(DEFS_PREFIX) ? decodePointer(ref.slice(DEFS_PREFIX.length)) : null;
  }

  // ---------------------------------------------------------------------------
  // Entitäten
  // ---------------------------------------------------------------------------

  function uniqueName(existing, base) {
    let name = base, i = 2;
    while (Object.prototype.hasOwnProperty.call(existing, name)) name = base + i++;
    return name;
  }

  function addEntity(model, name) {
    name = uniqueName(model.$defs, name || 'Entitaet');
    model.$defs[name] = createEntity(name);
    return name;
  }

  /** Benennt eine Entität um und passt alle Verweise im Modell an. Reihenfolge bleibt erhalten. */
  function renameEntity(model, oldName, newName) {
    if (oldName === newName) return newName;
    if (!NAME_PATTERN.test(newName)) throw new Error('Ungültiger Name: ' + newName);
    if (Object.prototype.hasOwnProperty.call(model.$defs, newName)) throw new Error('Name bereits vergeben: ' + newName);
    model.$defs = renameKey(model.$defs, oldName, newName);
    const from = refTo(oldName), to = refTo(newName);
    replaceRefs(model, (ref) => (ref === from ? to : ref));
    return newName;
  }

  function duplicateEntity(model, name) {
    const copy = uniqueName(model.$defs, name + 'Kopie');
    const entries = Object.entries(model.$defs);
    const idx = entries.findIndex(([k]) => k === name);
    entries.splice(idx + 1, 0, [copy, clone(model.$defs[name])]);
    model.$defs = Object.fromEntries(entries);
    return copy;
  }

  /** Liefert Stellen ("Entität.eigenschaft"), die auf die Entität verweisen. */
  function findReferences(model, name) {
    const target = refTo(name), hits = [];
    for (const [entity, schema] of Object.entries(model.$defs)) {
      for (const [prop, ps] of Object.entries(schema.properties || {})) {
        if (collectRefs(ps).includes(target)) hits.push(entity + '.' + prop);
      }
    }
    return hits;
  }

  function deleteEntity(model, name) {
    delete model.$defs[name];
  }

  function moveEntity(model, name, delta) {
    const entries = Object.entries(model.$defs);
    const i = entries.findIndex(([k]) => k === name), j = i + delta;
    if (i < 0 || j < 0 || j >= entries.length) return;
    [entries[i], entries[j]] = [entries[j], entries[i]];
    model.$defs = Object.fromEntries(entries);
  }

  function renameKey(obj, oldKey, newKey) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k === oldKey ? newKey : k] = v;
    return out;
  }

  // ---------------------------------------------------------------------------
  // Eigenschaften
  // ---------------------------------------------------------------------------

  function addProperty(entity, name) {
    entity.properties = entity.properties || {};
    name = uniqueName(entity.properties, name || 'feld');
    entity.properties[name] = { type: 'string', description: '' };
    return name;
  }

  function renameProperty(entity, oldName, newName) {
    if (oldName === newName) return newName;
    if (!NAME_PATTERN.test(newName)) throw new Error('Ungültiger Name: ' + newName);
    if (Object.prototype.hasOwnProperty.call(entity.properties, newName)) throw new Error('Name bereits vergeben: ' + newName);
    entity.properties = renameKey(entity.properties, oldName, newName);
    if (Array.isArray(entity.required)) entity.required = entity.required.map((r) => (r === oldName ? newName : r));
    return newName;
  }

  function deleteProperty(entity, name) {
    delete entity.properties[name];
    if (Array.isArray(entity.required)) entity.required = entity.required.filter((r) => r !== name);
  }

  function moveProperty(entity, name, delta) {
    const entries = Object.entries(entity.properties);
    const i = entries.findIndex(([k]) => k === name), j = i + delta;
    if (i < 0 || j < 0 || j >= entries.length) return;
    [entries[i], entries[j]] = [entries[j], entries[i]];
    entity.properties = Object.fromEntries(entries);
  }

  function setRequired(entity, name, required) {
    const list = new Set(entity.required || []);
    if (required) list.add(name); else list.delete(name);
    // Reihenfolge an Eigenschaften ausrichten.
    entity.required = Object.keys(entity.properties).filter((k) => list.has(k));
  }

  /**
   * Beschreibt ein Eigenschafts-Schema für die Oberfläche:
   * { kind: 'primitive'|'ref'|'custom', type, ref, list, nullable }
   */
  function describeProperty(schema) {
    const s = schema || {};
    let list = false, inner = s;
    const types = (t) => (Array.isArray(t) ? t : t ? [t] : []);
    let outerTypes = types(s.type);
    let nullable = outerTypes.includes('null');
    if (outerTypes.filter((t) => t !== 'null')[0] === 'array') {
      list = true;
      inner = s.items || {};
    }
    const nref = nullableRef(inner);
    if (nref) return { kind: refTarget(nref) ? 'ref' : 'custom', type: null, ref: refTarget(nref), list, nullable: true };
    if (inner.$ref) {
      const target = refTarget(inner.$ref);
      return { kind: target ? 'ref' : 'custom', type: null, ref: target, list, nullable };
    }
    const innerTypes = types(inner.type);
    if (!list) nullable = innerTypes.includes('null');
    const base = innerTypes.filter((t) => t !== 'null');
    if (base.length === 1 && PRIMITIVE_TYPES.includes(base[0])) {
      return { kind: 'primitive', type: base[0], ref: null, list, nullable };
    }
    if (base.length === 0 && !inner.oneOf && !inner.anyOf && !inner.allOf) {
      return { kind: 'primitive', type: 'any', ref: null, list, nullable };
    }
    return { kind: 'custom', type: null, ref: null, list, nullable };
  }

  /** Erkennt die Form { anyOf: [ { $ref }, { type: 'null' } ] } und liefert den $ref. */
  function nullableRef(s) {
    if (!s || !Array.isArray(s.anyOf) || s.anyOf.length !== 2) return null;
    const ref = s.anyOf.find((x) => x && typeof x.$ref === 'string' && Object.keys(x).length === 1);
    const nul = s.anyOf.find((x) => x && x.type === 'null' && Object.keys(x).length === 1);
    return ref && nul ? ref.$ref : null;
  }

  // Schlüsselwörter, die nur für bestimmte Typen gelten.
  const TYPE_KEYWORDS = {
    string: ['format', 'minLength', 'maxLength', 'pattern', 'contentMediaType', 'contentEncoding'],
    number: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'],
    integer: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'],
    object: ['properties', 'additionalProperties', 'required', 'patternProperties', 'minProperties', 'maxProperties'],
  };
  const ALL_TYPE_KEYWORDS = [...new Set(Object.values(TYPE_KEYWORDS).flat())];
  const ARRAY_KEYWORDS = ['items', 'minItems', 'maxItems', 'uniqueItems', 'prefixItems', 'contains'];
  const ANNOTATIONS = ['title', 'description', 'deprecated', 'readOnly', 'writeOnly', 'examples', '$comment'];

  /**
   * Setzt die Typ-Struktur einer Eigenschaft neu. Annotationen (Beschreibung, …)
   * bleiben an der Eigenschaft, typspezifische Einschränkungen am Element-Schema.
   * desc = { type?: string, ref?: string, list: boolean, nullable: boolean }
   */
  function setPropertyType(schema, desc) {
    const old = describeProperty(schema);
    const oldInner = old.list ? (schema.items || {}) : schema;
    const isStructural = (k, s) => k === 'type' || k === '$ref' || (k === 'anyOf' && nullableRef(s));
    const outer = {}, inner = {};
    for (const [k, v] of Object.entries(schema)) {
      if (isStructural(k, schema) || k === 'items') continue;
      if (ARRAY_KEYWORDS.includes(k)) { if (desc.list) outer[k] = v; continue; }
      if (ANNOTATIONS.includes(k)) { outer[k] = v; continue; }
      if (old.list) outer[k] = v; else inner[k] = v;
    }
    if (old.list) {
      for (const [k, v] of Object.entries(oldInner)) if (!isStructural(k, oldInner)) inner[k] = v;
    }
    const newType = desc.ref ? null : desc.type;
    // Nicht mehr passende Schlüsselwörter entfernen.
    const keep = newType ? TYPE_KEYWORDS[newType] || [] : [];
    for (const k of Object.keys(inner)) {
      if (ALL_TYPE_KEYWORDS.includes(k) && !keep.includes(k)) delete inner[k];
      if (desc.ref && (k === 'enum' || k === 'const' || k === 'default')) delete inner[k];
    }
    if (old.kind === 'primitive' && newType !== old.type && old.type !== 'any') {
      delete inner.enum; delete inner.const; delete inner.default;
    }

    const core = desc.ref ? { $ref: refTo(desc.ref) } : newType && newType !== 'any' ? { type: newType } : {};
    let result;
    if (desc.list) {
      const items = Object.assign({}, core, inner);
      result = Object.assign({ type: desc.nullable ? ['array', 'null'] : 'array' }, outer, { items });
    } else if (desc.nullable) {
      if (desc.ref) {
        // Ein $ref kann keinen Typ "null" tragen – daher anyOf.
        result = Object.assign({}, outer, { anyOf: [core, { type: 'null' }] }, inner);
      } else if (newType && newType !== 'any') {
        result = Object.assign({ type: [newType, 'null'] }, outer, inner);
      } else {
        result = Object.assign({}, outer, inner);
      }
    } else {
      result = Object.assign({}, core, outer, inner);
    }
    return result;
  }

  /** Schema, in dem typspezifische Einschränkungen stehen (bei Listen: items). */
  function valueSchema(schema) {
    return describeProperty(schema).list ? (schema.items = schema.items || {}) : schema;
  }

  // ---------------------------------------------------------------------------
  // Prüfung
  // ---------------------------------------------------------------------------

  /** Prüft das Modell auf strukturelle Fehler. Liefert [{level, path, message}]. */
  function validateModel(model) {
    const issues = [];
    const add = (level, path, message) => issues.push({ level, path, message });
    if (!model.title) add('warn', '', 'Das Modell hat keinen Titel.');
    if (model.$schema && model.$schema !== DIALECT) {
      add('info', '', 'Abweichender Dialekt: ' + model.$schema + ' (empfohlen: ' + DIALECT + ')');
    }
    const defs = model.$defs || {};
    if (Object.keys(defs).length === 0) add('info', '', 'Das Modell enthält noch keine Entitäten.');
    for (const [name, entity] of Object.entries(defs)) {
      if (!NAME_PATTERN.test(name)) add('error', name, 'Ungültiger Entitätsname.');
      for (const ref of collectRefs(entity)) {
        const target = refTarget(ref);
        if (target !== null && !defs[target]) add('error', name, 'Verweis auf unbekannte Entität „' + target + '“.');
        else if (target === null && ref.startsWith('#') && !resolvePointer(model, ref)) {
          add('error', name, 'Verweis kann nicht aufgelöst werden: ' + ref);
        }
      }
      if (entity.type !== 'object' && !entity.properties) continue;
      const props = entity.properties || {};
      if (Object.keys(props).length === 0) add('warn', name, 'Entität hat keine Eigenschaften.');
      for (const r of entity.required || []) {
        if (!props[r]) add('error', name, 'Pflichtfeld „' + r + '“ ist nicht definiert.');
      }
      for (const [pname, ps] of Object.entries(props)) {
        const path = name + '.' + pname;
        if (!NAME_PATTERN.test(pname)) add('warn', path, 'Name enthält ungewöhnliche Zeichen.');
        const vs = describeProperty(ps).list ? ps.items || {} : ps;
        checkRange(vs, 'minimum', 'maximum', path, add);
        checkRange(vs, 'minLength', 'maxLength', path, add);
        checkRange(ps, 'minItems', 'maxItems', path, add);
        if (Array.isArray(vs.enum) && vs.enum.length === 0) add('error', path, 'Aufzählung (enum) ist leer.');
        if (vs.pattern) {
          try { new RegExp(vs.pattern, 'u'); } catch (e) { add('error', path, 'Ungültiger regulärer Ausdruck: ' + vs.pattern); }
        }
        if (vs.format && vs.type === 'string' && !STRING_FORMATS.includes(vs.format)) {
          add('info', path, 'Format „' + vs.format + '“ ist kein Standardformat.');
        }
      }
    }
    return issues;
  }

  function checkRange(s, lo, hi, path, add) {
    if (typeof s[lo] === 'number' && typeof s[hi] === 'number' && s[lo] > s[hi]) {
      add('error', path, lo + ' ist größer als ' + hi + '.');
    }
  }

  function resolvePointer(doc, ref) {
    if (ref === '#') return doc;
    if (!ref.startsWith('#/')) return undefined;
    let node = doc;
    for (const part of ref.slice(2).split('/')) {
      if (node == null || typeof node !== 'object') return undefined;
      node = node[decodePointer(part)];
    }
    return node;
  }

  // ---------------------------------------------------------------------------
  // Beispieldaten
  // ---------------------------------------------------------------------------

  const SAMPLE_STRINGS = {
    date: '2026-01-31', 'date-time': '2026-01-31T12:00:00Z', time: '12:00:00Z', duration: 'P1D',
    email: 'max.mustermann@example.org', 'idn-email': 'max@example.org', hostname: 'example.org',
    'idn-hostname': 'example.org', ipv4: '192.0.2.1', ipv6: '2001:db8::1', uri: 'https://example.org',
    'uri-reference': '/pfad', iri: 'https://example.org', 'iri-reference': '/pfad',
    uuid: '3fa85f64-5717-4562-b3fc-2c963f66afa6', 'uri-template': 'https://example.org/{id}',
    'json-pointer': '/a/b', 'relative-json-pointer': '0/a', regex: '^[a-z]+$',
  };

  /** Erzeugt eine Beispiel-Instanz für eine Entität. */
  function generateExample(model, name, depth = 2) {
    return sample(model, { $ref: refTo(name) }, depth, '');
  }

  function sample(model, s, depth, key) {
    if (!s || typeof s !== 'object') return null;
    if (s.$ref) {
      const target = resolvePointer(model, s.$ref);
      if (!target) return null;
      if (depth <= 0) return undefined; // Rekursion begrenzen – Feld wird weggelassen.
      return sample(model, Object.assign({}, target, withoutRef(s)), depth - 1, key);
    }
    if (s.const !== undefined) return clone(s.const);
    if (s.default !== undefined) return clone(s.default);
    if (Array.isArray(s.examples) && s.examples.length) return clone(s.examples[0]);
    if (Array.isArray(s.enum) && s.enum.length) return clone(s.enum[0]);
    if (s.anyOf || s.oneOf) return sample(model, (s.anyOf || s.oneOf)[0], depth, key);
    if (s.allOf) return sample(model, Object.assign({}, ...s.allOf), depth, key);
    const type = Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type;
    switch (type) {
      case 'string': {
        if (s.format && SAMPLE_STRINGS[s.format]) return SAMPLE_STRINGS[s.format];
        let v = key || 'text';
        if (s.minLength && v.length < s.minLength) v = v.padEnd(s.minLength, 'x');
        if (s.maxLength && v.length > s.maxLength) v = v.slice(0, s.maxLength);
        return v;
      }
      case 'integer': case 'number': {
        let v = typeof s.minimum === 'number' ? s.minimum : typeof s.exclusiveMinimum === 'number'
          ? s.exclusiveMinimum + 1 : 1;
        if (typeof s.maximum === 'number' && v > s.maximum) v = s.maximum;
        return type === 'integer' ? Math.ceil(v) : v;
      }
      case 'boolean': return true;
      case 'array': {
        const n = Math.max(1, s.minItems || 0);
        return Array.from({ length: Math.min(n, 3) }, () => sample(model, s.items || {}, depth, key))
          .filter((v) => v !== undefined);
      }
      case 'object': default: {
        if (!s.properties) return type === 'object' ? {} : null;
        const out = {};
        for (const [k, ps] of Object.entries(s.properties)) {
          const v = sample(model, ps, depth, k);
          if (v !== undefined) out[k] = v;
        }
        return out;
      }
    }
  }

  function withoutRef(s) { const o = Object.assign({}, s); delete o.$ref; return o; }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  /** Erzeugt ein OpenAPI-3.1-Dokument mit allen Entitäten unter components.schemas. */
  function toOpenAPI(model, version = '1.0.0') {
    const schemas = clone(model.$defs || {});
    replaceRefs(schemas, (ref) =>
      ref.startsWith(DEFS_PREFIX) ? '#/components/schemas/' + ref.slice(DEFS_PREFIX.length) : ref);
    const info = { title: model.title || 'Datenmodell', version };
    if (model.description) info.description = model.description;
    return {
      openapi: '3.1.0',
      info,
      jsonSchemaDialect: DIALECT,
      paths: {},
      components: { schemas },
    };
  }

  /** Bereinigt das Modell für den Export (leere Beschreibungen/Pflichtlisten entfernen). */
  function toJSONSchema(model) {
    const out = clone(model);
    const strip = (node) => {
      if (Array.isArray(node)) { node.forEach(strip); return; }
      if (!node || typeof node !== 'object') return;
      if (node.description === '') delete node.description;
      if (Array.isArray(node.required) && node.required.length === 0 && node.properties) delete node.required;
      for (const [k, v] of Object.entries(node)) {
        if (k !== 'enum' && k !== 'const' && k !== 'default' && k !== 'examples') strip(v);
      }
    };
    strip(out);
    return out;
  }

  return {
    DIALECT, NAME_PATTERN, PRIMITIVE_TYPES, STRING_FORMATS,
    createModel, normalizeModel, slug, toName,
    addEntity, renameEntity, duplicateEntity, deleteEntity, moveEntity, findReferences,
    addProperty, renameProperty, deleteProperty, moveProperty, setRequired,
    describeProperty, setPropertyType, valueSchema,
    refTo, refTarget, collectRefs, resolvePointer,
    validateModel, generateExample, toOpenAPI, toJSONSchema,
  };
});
