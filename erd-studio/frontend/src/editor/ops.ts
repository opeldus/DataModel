/**
 * Reine Funktionen zum Ändern des Kernmodells. Jede Funktion liefert ein neues Modell
 * und lässt das alte unverändert – Voraussetzung für Undo/Redo.
 */
import type { Attribute, Cardinality, DataType, Domain, Entity, Kernmodell, Relationship } from '../types';

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));

/** Erlaubte technische Namen laut Schema */
export const PHYSICAL_NAME = /^[A-Za-z_][A-Za-z0-9_$]*$/;

/** "Neue Tabelle 2" → "NEUE_TABELLE_2", Umlaute werden ausgeschrieben */
export function toPhysicalName(name: string): string {
  const s = name
    .trim()
    .replace(/ä/gi, 'ae')
    .replace(/ö/gi, 'oe')
    .replace(/ü/gi, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return /^[A-Z_]/.test(s) ? s : `T_${s}`;
}

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base.toUpperCase())) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`.toUpperCase())) i++;
  return `${base}_${i}`;
}

const mapEntity = (m: Kernmodell, id: string, fn: (e: Entity) => Entity): Kernmodell => ({
  ...m,
  entities: m.entities.map((e) => (e.id === id ? fn(e) : e)),
});

const rels = (m: Kernmodell) => m.relationships ?? [];

function renumber(attrs: Attribute[]): Attribute[] {
  return attrs.map((a, i) => ({ ...a, ordinalPosition: i + 1 }));
}

function ordered(e: Entity): Attribute[] {
  return [...e.attributes].sort(
    (a, b) => (a.ordinalPosition ?? Number.MAX_SAFE_INTEGER) - (b.ordinalPosition ?? Number.MAX_SAFE_INTEGER),
  );
}

// ---------- Modell ----------

export function emptyModel(name: string): Kernmodell {
  const domainId = newId();
  return {
    formatVersion: '1.0.0',
    model: {
      id: newId(),
      name,
      version: '0.1.0',
      level: 'physisch',
      targetPlatform: 'snowflake',
      governance: { status: 'entwurf' },
    },
    domains: [{ id: domainId, name: 'Allgemein' }],
    entities: [],
    relationships: [],
  };
}

export function updateModelInfo(m: Kernmodell, patch: Partial<Kernmodell['model']>): Kernmodell {
  return { ...m, model: { ...m.model, ...patch } };
}

// ---------- Domänen ----------

export function addDomain(m: Kernmodell, name: string): Kernmodell {
  return { ...m, domains: [...(m.domains ?? []), { id: newId(), name }] };
}

export function updateDomain(m: Kernmodell, id: string, patch: Partial<Domain>): Kernmodell {
  return { ...m, domains: (m.domains ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)) };
}

/** Domäne entfernen; zugeordnete Tabellen verlieren nur die Zuordnung. */
export function deleteDomain(m: Kernmodell, id: string): Kernmodell {
  return {
    ...m,
    domains: (m.domains ?? []).filter((d) => d.id !== id),
    entities: m.entities.map((e) => (e.domainId === id ? { ...e, domainId: undefined } : e)),
  };
}

// ---------- Tabellen ----------

export function addEntity(m: Kernmodell, domainId?: string): { model: Kernmodell; entity: Entity } {
  const taken = new Set(m.entities.map((e) => (e.physicalName ?? e.name).toUpperCase()));
  const physicalName = uniqueName('NEUE_TABELLE', taken);
  const idAttr: Attribute = {
    id: newId(),
    name: 'ID',
    physicalName: 'ID',
    dataType: { type: 'string', length: 36 },
    nullable: false,
    ordinalPosition: 1,
  };
  const entity: Entity = {
    id: newId(),
    name: physicalName === 'NEUE_TABELLE' ? 'Neue Tabelle' : `Neue Tabelle ${physicalName.split('_').pop()}`,
    physicalName,
    schema: m.entities.find((e) => e.schema)?.schema,
    domainId: domainId ?? m.domains?.[0]?.id,
    attributes: [idAttr],
    primaryKey: { name: `PK_${physicalName}`, attributeIds: [idAttr.id] },
  };
  return { model: { ...m, entities: [...m.entities, entity] }, entity };
}

export function updateEntity(m: Kernmodell, id: string, patch: Partial<Entity>): Kernmodell {
  return mapEntity(m, id, (e) => {
    const next = { ...e, ...patch };
    // PK-Name folgt dem Tabellennamen, solange er dem Standardmuster entspricht
    if (patch.physicalName && e.primaryKey?.name === `PK_${e.physicalName}`) {
      next.primaryKey = { ...e.primaryKey, name: `PK_${patch.physicalName}` };
    }
    return next;
  });
}

/** Tabelle samt aller Beziehungen löschen, die sie berühren. */
export function deleteEntity(m: Kernmodell, id: string): Kernmodell {
  return {
    ...m,
    entities: m.entities.filter((e) => e.id !== id),
    relationships: rels(m).filter((r) => r.from.entityId !== id && r.to.entityId !== id),
  };
}

// ---------- Spalten ----------

export function addAttribute(m: Kernmodell, entityId: string): { model: Kernmodell; attribute: Attribute } {
  const entity = m.entities.find((e) => e.id === entityId)!;
  const taken = new Set(entity.attributes.map((a) => (a.physicalName ?? a.name).toUpperCase()));
  const physicalName = uniqueName('NEUE_SPALTE', taken);
  const attribute: Attribute = {
    id: newId(),
    name: physicalName === 'NEUE_SPALTE' ? 'Neue Spalte' : physicalName,
    physicalName,
    dataType: { type: 'string', length: 100 },
    ordinalPosition: entity.attributes.length + 1,
  };
  return {
    model: mapEntity(m, entityId, (e) => ({ ...e, attributes: renumber([...ordered(e), attribute]) })),
    attribute,
  };
}

export function updateAttribute(m: Kernmodell, entityId: string, attrId: string, patch: Partial<Attribute>): Kernmodell {
  return mapEntity(m, entityId, (e) => ({
    ...e,
    attributes: e.attributes.map((a) => (a.id === attrId ? { ...a, ...patch } : a)),
  }));
}

/**
 * Datentyp ändern. nativeType wird verworfen, weil er sonst den neuen Typ in allen Exporten überschreibt.
 * Länge/Präzision werden passend zum Typ gesetzt bzw. entfernt.
 */
export function updateDataType(m: Kernmodell, entityId: string, attrId: string, patch: Partial<DataType>): Kernmodell {
  return mapEntity(m, entityId, (e) => ({
    ...e,
    attributes: e.attributes.map((a) => {
      if (a.id !== attrId) return a;
      const merged: DataType = { ...a.dataType, ...patch };
      delete merged.nativeType;
      const t = merged.type;
      const dt: DataType = { type: t };
      if (t === 'string' || t === 'binary') dt.length = merged.length ?? 100;
      if (t === 'decimal') {
        dt.precision = merged.precision ?? 18;
        dt.scale = merged.scale ?? 2;
      }
      return { ...a, dataType: dt };
    }),
  }));
}

/** Spalte löschen: auch aus PK/UK entfernen und Beziehungen über diese Spalte löschen. */
export function deleteAttribute(m: Kernmodell, entityId: string, attrId: string): Kernmodell {
  const next = mapEntity(m, entityId, (e) => {
    const pkIds = (e.primaryKey?.attributeIds ?? []).filter((id) => id !== attrId);
    return {
      ...e,
      attributes: renumber(ordered(e).filter((a) => a.id !== attrId)),
      primaryKey: pkIds.length ? { ...e.primaryKey, attributeIds: pkIds } : undefined,
      uniqueKeys: (e.uniqueKeys ?? [])
        .map((k) => ({ ...k, attributeIds: k.attributeIds.filter((id) => id !== attrId) }))
        .filter((k) => k.attributeIds.length > 0),
    };
  });
  return {
    ...next,
    relationships: rels(next).filter(
      (r) => !r.from.attributeIds.includes(attrId) && !r.to.attributeIds.includes(attrId),
    ),
  };
}

export function moveAttribute(m: Kernmodell, entityId: string, attrId: string, delta: -1 | 1): Kernmodell {
  return mapEntity(m, entityId, (e) => {
    const list = ordered(e);
    const i = list.findIndex((a) => a.id === attrId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return e;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...e, attributes: renumber(list) };
  });
}

/** PK-Zugehörigkeit umschalten. PK-Spalten sind immer NOT NULL. */
export function togglePrimaryKey(m: Kernmodell, entityId: string, attrId: string): Kernmodell {
  return mapEntity(m, entityId, (e) => {
    const ids = e.primaryKey?.attributeIds ?? [];
    const inPk = ids.includes(attrId);
    const nextIds = inPk ? ids.filter((id) => id !== attrId) : [...ids, attrId];
    return {
      ...e,
      attributes: inPk ? e.attributes : e.attributes.map((a) => (a.id === attrId ? { ...a, nullable: false } : a)),
      primaryKey: nextIds.length
        ? { name: e.primaryKey?.name ?? `PK_${e.physicalName ?? e.name}`, attributeIds: nextIds }
        : undefined,
    };
  });
}

// ---------- Beziehungen ----------

export interface ConnectResult {
  model: Kernmodell;
  relationship?: Relationship;
  message?: string;
}

function isKey(e: Entity, attrId: string): boolean {
  return (
    (e.primaryKey?.attributeIds ?? []).includes(attrId) ||
    (e.uniqueKeys ?? []).some((k) => k.attributeIds.length === 1 && k.attributeIds[0] === attrId)
  );
}

function relationshipName(m: Kernmodell, child: Entity, parent: Entity): string {
  const base = `FK_${child.physicalName ?? child.name}_${parent.physicalName ?? parent.name}`.toUpperCase();
  return uniqueName(base, new Set(rels(m).map((r) => (r.name ?? '').toUpperCase())));
}

function makeRelationship(
  m: Kernmodell,
  child: Entity,
  childAttrIds: string[],
  parent: Entity,
  parentAttrIds: string[],
): Relationship {
  const childAttrs = childAttrIds.map((id) => child.attributes.find((a) => a.id === id)!);
  const optional = childAttrs.some((a) => a.nullable !== false);
  const childPk = child.primaryKey?.attributeIds ?? [];
  return {
    id: newId(),
    name: relationshipName(m, child, parent),
    from: { entityId: child.id, attributeIds: childAttrIds, cardinality: '0..n' },
    to: { entityId: parent.id, attributeIds: parentAttrIds, cardinality: optional ? '0..1' : '1' },
    identifying: childAttrIds.every((id) => childPk.includes(id)),
    enforced: false,
  };
}

/**
 * Beziehung zwischen zwei Spalten. Die Richtung wird erkannt:
 * Kind (FK) ist die Seite, deren Spalte kein Schlüssel ist.
 */
export function connectAttributes(
  m: Kernmodell,
  a: { entityId: string; attrId: string },
  b: { entityId: string; attrId: string },
): ConnectResult {
  if (a.entityId === b.entityId && a.attrId === b.attrId) return { model: m };
  const ea = m.entities.find((e) => e.id === a.entityId)!;
  const eb = m.entities.find((e) => e.id === b.entityId)!;

  let child = ea, childAttr = a.attrId, parent = eb, parentAttr = b.attrId;
  if (isKey(ea, a.attrId) && !isKey(eb, b.attrId)) {
    [child, childAttr, parent, parentAttr] = [eb, b.attrId, ea, a.attrId];
  }

  const exists = rels(m).some(
    (r) => r.from.entityId === child.id && r.to.entityId === parent.id && r.from.attributeIds.includes(childAttr),
  );
  if (exists) return { model: m, message: 'Diese Beziehung gibt es bereits.' };

  const relationship = makeRelationship(m, child, [childAttr], parent, [parentAttr]);
  const ca = child.attributes.find((x) => x.id === childAttr)!;
  const pa = parent.attributes.find((x) => x.id === parentAttr)!;
  const sameType = JSON.stringify(ca.dataType) === JSON.stringify(pa.dataType);
  return {
    model: { ...m, relationships: [...rels(m), relationship] },
    relationship,
    message: sameType
      ? undefined
      : `Achtung: ${ca.physicalName ?? ca.name} und ${pa.physicalName ?? pa.name} haben unterschiedliche Datentypen.`,
  };
}

/**
 * Beziehung von Tabelle zu Tabelle: Im Kind werden FK-Spalten als Kopie des Eltern-PK angelegt
 * (vorhandene Spalten mit gleichem Namen und Typ werden wiederverwendet).
 */
export function connectEntities(m: Kernmodell, childId: string, parentId: string): ConnectResult {
  const parent = m.entities.find((e) => e.id === parentId)!;
  const pkIds = parent.primaryKey?.attributeIds ?? [];
  if (pkIds.length === 0) {
    return { model: m, message: `${parent.physicalName ?? parent.name} hat keinen Primärschlüssel.` };
  }
  let model = m;
  const childAttrIds: string[] = [];
  for (const pkId of pkIds) {
    const pkAttr = parent.attributes.find((a) => a.id === pkId)!;
    const child = model.entities.find((e) => e.id === childId)!;
    const colName = pkAttr.physicalName ?? pkAttr.name;
    const existing = child.attributes.find(
      (a) =>
        (a.physicalName ?? a.name).toUpperCase() === colName.toUpperCase() &&
        JSON.stringify(a.dataType) === JSON.stringify(pkAttr.dataType),
    );
    if (existing && childId !== parentId) {
      childAttrIds.push(existing.id);
      continue;
    }
    const taken = new Set(child.attributes.map((a) => (a.physicalName ?? a.name).toUpperCase()));
    const physicalName = uniqueName(childId === parentId ? `PARENT_${colName}` : colName, taken);
    const attr: Attribute = {
      id: newId(),
      name: pkAttr.name,
      physicalName,
      description: pkAttr.description,
      dataType: { ...pkAttr.dataType },
      nullable: childId === parentId,
      ordinalPosition: child.attributes.length + 1,
    };
    model = mapEntity(model, childId, (e) => ({ ...e, attributes: renumber([...ordered(e), attr]) }));
    childAttrIds.push(attr.id);
  }
  const child = model.entities.find((e) => e.id === childId)!;
  const relationship = makeRelationship(model, child, childAttrIds, parent, pkIds);
  return { model: { ...model, relationships: [...rels(model), relationship] }, relationship };
}

export function updateRelationship(m: Kernmodell, id: string, patch: Partial<Relationship>): Kernmodell {
  return { ...m, relationships: rels(m).map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

export function setCardinality(m: Kernmodell, id: string, end: 'from' | 'to', cardinality: Cardinality): Kernmodell {
  return {
    ...m,
    relationships: rels(m).map((r) => (r.id === id ? { ...r, [end]: { ...r[end], cardinality } } : r)),
  };
}

export function deleteRelationship(m: Kernmodell, id: string): Kernmodell {
  return { ...m, relationships: rels(m).filter((r) => r.id !== id) };
}
