import dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import type { Cardinality, Entity, Kernmodell, Position, Relationship } from './types';

export const NODE_WIDTH = 280;
export const HEADER_HEIGHT = 42;
export const ROW_HEIGHT = 28;

export interface TableNodeData extends Record<string, unknown> {
  entity: Entity;
  domainName?: string;
  colorIndex: number;
  pkIds: Set<string>;
  fkIds: Set<string>;
  /** Attribute, die zur aktuell markierten Beziehung gehören */
  activeAttrIds: Set<string>;
  dimmed: boolean;
  searchHit: boolean;
  /** Bearbeitungsmodus: Anschlusspunkte zum Ziehen von Beziehungen sichtbar */
  editing: boolean;
}

export type TableNode = Node<TableNodeData, 'table'>;

export interface RelEdgeData extends Record<string, unknown> {
  relationship: Relationship;
  active: boolean;
}

export type RelEdge = Edge<RelEdgeData>;

export const MARKER: Record<Cardinality, string> = {
  '1': 'card-1',
  '0..1': 'card-01',
  '0..n': 'card-0n',
  '1..n': 'card-1n',
};

export function nodeHeight(e: Entity): number {
  return HEADER_HEIGHT + e.attributes.length * ROW_HEIGHT + 6;
}

export function sortedAttributes(e: Entity) {
  return [...e.attributes].sort(
    (a, b) => (a.ordinalPosition ?? Number.MAX_SAFE_INTEGER) - (b.ordinalPosition ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Automatisches Layout: Eltern links, Kinder rechts, Domänen bleiben über die Reihenfolge beieinander. */
export function autoLayout(model: Kernmodell): Record<string, Position> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 48, ranksep: 120, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  const entities = [...model.entities].sort((a, b) => (a.domainId ?? '').localeCompare(b.domainId ?? ''));
  for (const e of entities) {
    g.setNode(e.id, { width: NODE_WIDTH, height: nodeHeight(e) });
  }
  for (const r of model.relationships ?? []) {
    if (r.from.entityId !== r.to.entityId) {
      g.setEdge(r.to.entityId, r.from.entityId);
    }
  }
  dagre.layout(g);

  const positions: Record<string, Position> = {};
  for (const e of model.entities) {
    const n = g.node(e.id);
    positions[e.id] = { x: Math.round(n.x - NODE_WIDTH / 2), y: Math.round(n.y - nodeHeight(e) / 2) };
  }
  return positions;
}

export interface ViewState {
  hiddenDomains: Set<string>;
  search: string;
  selectedEntityId?: string;
  selectedRelationshipId?: string;
}

export function matchesSearch(e: Entity, q: string): boolean {
  if (!q) return false;
  const needle = q.toLowerCase();
  return [e.name, e.physicalName, e.description, e.dataProduct, ...e.attributes.flatMap((a) => [a.name, a.physicalName])]
    .filter(Boolean)
    .some((s) => s!.toLowerCase().includes(needle));
}

export function buildNodes(
  model: Kernmodell,
  positions: Record<string, Position>,
  view: ViewState,
  editing = false,
): TableNode[] {
  const domainIndex = new Map((model.domains ?? []).map((d, i) => [d.id, i]));
  const domainName = new Map((model.domains ?? []).map((d) => [d.id, d.name]));
  const rels = model.relationships ?? [];
  const fkIds = new Set(rels.flatMap((r) => r.from.attributeIds));

  const related = relatedEntities(rels, view);
  const activeRel = rels.find((r) => r.id === view.selectedRelationshipId);
  const activeAttrIds = new Set(activeRel ? [...activeRel.from.attributeIds, ...activeRel.to.attributeIds] : []);

  return model.entities
    .filter((e) => !e.domainId || !view.hiddenDomains.has(e.domainId))
    .map((e) => {
      const hit = matchesSearch(e, view.search);
      const dimmedBySelection = related !== null && !related.has(e.id);
      const dimmedBySearch = view.search !== '' && !hit;
      return {
        id: e.id,
        type: 'table' as const,
        position: positions[e.id] ?? { x: 0, y: 0 },
        data: {
          entity: e,
          domainName: e.domainId ? domainName.get(e.domainId) : undefined,
          colorIndex: e.domainId ? (domainIndex.get(e.domainId) ?? 0) % 6 : 6,
          pkIds: new Set(e.primaryKey?.attributeIds ?? []),
          fkIds,
          activeAttrIds,
          dimmed: dimmedBySelection || dimmedBySearch,
          searchHit: hit,
          editing,
        },
        selected: e.id === view.selectedEntityId,
      };
    });
}

/** Bei markierter Tabelle oder Beziehung: welche Tabellen bleiben hervorgehoben? null = keine Auswahl. */
function relatedEntities(rels: Relationship[], view: ViewState): Set<string> | null {
  if (view.selectedRelationshipId) {
    const r = rels.find((x) => x.id === view.selectedRelationshipId);
    return r ? new Set([r.from.entityId, r.to.entityId]) : null;
  }
  if (view.selectedEntityId) {
    const s = new Set([view.selectedEntityId]);
    for (const r of rels) {
      if (r.from.entityId === view.selectedEntityId) s.add(r.to.entityId);
      if (r.to.entityId === view.selectedEntityId) s.add(r.from.entityId);
    }
    return s;
  }
  return null;
}

/**
 * Kanten zeigen von der Kind-Spalte (FK) zur Eltern-Spalte (PK).
 * Die Seite (links/rechts) richtet sich nach der aktuellen Lage der Tabellen,
 * damit Linien nicht quer durch Tabellen laufen.
 */
export function buildEdges(model: Kernmodell, nodes: TableNode[], view: ViewState): RelEdge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: RelEdge[] = [];

  for (const r of model.relationships ?? []) {
    const child = byId.get(r.from.entityId);
    const parent = byId.get(r.to.entityId);
    if (!child || !parent) continue; // ausgeblendete Domäne

    const childCenter = child.position.x + NODE_WIDTH / 2;
    const parentCenter = parent.position.x + NODE_WIDTH / 2;
    const overlap = Math.abs(childCenter - parentCenter) < NODE_WIDTH * 0.75;
    let sourceSide: 'L' | 'R';
    let targetSide: 'L' | 'R';
    if (overlap) {
      sourceSide = 'R';
      targetSide = 'R';
    } else if (childCenter < parentCenter) {
      sourceSide = 'R';
      targetSide = 'L';
    } else {
      sourceSide = 'L';
      targetSide = 'R';
    }

    const active =
      view.selectedRelationshipId === r.id ||
      (!!view.selectedEntityId && (r.from.entityId === view.selectedEntityId || r.to.entityId === view.selectedEntityId));
    const dimmed = (!!view.selectedEntityId || !!view.selectedRelationshipId) && !active;
    const suffix = active ? '-hl' : '';

    edges.push({
      id: r.id,
      source: child.id,
      target: parent.id,
      sourceHandle: `${r.from.attributeIds[0]}-s${sourceSide}`,
      targetHandle: `${r.to.attributeIds[0]}-t${targetSide}`,
      type: 'smoothstep',
      pathOptions: { borderRadius: 10, offset: 24 },
      markerStart: MARKER[r.from.cardinality] + suffix,
      markerEnd: MARKER[r.to.cardinality] + suffix,
      label: active ? `${r.name ?? ''}  ${r.to.cardinality} : ${r.from.cardinality}`.trim() : undefined,
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 4,
      className: [
        'rel-edge',
        active ? 'is-active' : '',
        dimmed ? 'is-dimmed' : '',
        r.identifying ? 'is-identifying' : '',
      ].join(' '),
      data: { relationship: r, active },
      selected: view.selectedRelationshipId === r.id,
      zIndex: active ? 10 : 0,
    } as RelEdge);
  }
  return edges;
}

// Typ-Anzeige wie in dbdiagram: kompakt, Originaltyp bevorzugt
export function typeLabel(dt: { type: string; length?: number; precision?: number; scale?: number; nativeType?: string }): string {
  if (dt.nativeType) return dt.nativeType.toLowerCase();
  if (dt.type === 'decimal') return `decimal(${dt.precision},${dt.scale ?? 0})`;
  if (dt.length) return `${dt.type === 'string' ? 'varchar' : dt.type}(${dt.length})`;
  return dt.type === 'string' ? 'varchar' : dt.type;
}

