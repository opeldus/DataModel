// Spiegel von kernmodell.schema.json (formatVersion 1.x)

export type Cardinality = '0..1' | '1' | '0..n' | '1..n';

export interface Governance {
  status?: 'entwurf' | 'in_pruefung' | 'freigegeben' | 'abgekuendigt';
  owner?: string;
  steward?: string;
  approvedBy?: string;
  approvedAt?: string;
  regulatoryTags?: string[];
}

export interface DataType {
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  nativeType?: string;
}

export interface Attribute {
  id: string;
  name: string;
  physicalName?: string;
  description?: string;
  dataType: DataType;
  nullable?: boolean;
  defaultValue?: string | number | boolean | null;
  classification?: string;
  businessTerm?: string;
  ordinalPosition?: number;
  extensions?: Record<string, unknown>;
}

export interface Key {
  name?: string;
  attributeIds: string[];
}

export interface Entity {
  id: string;
  name: string;
  physicalName?: string;
  kind?: string;
  schema?: string;
  database?: string;
  domainId?: string;
  dataProduct?: string;
  description?: string;
  classification?: string;
  governance?: Governance;
  attributes: Attribute[];
  primaryKey?: Key;
  uniqueKeys?: Key[];
  extensions?: Record<string, unknown>;
}

export interface RelationshipEnd {
  entityId: string;
  attributeIds: string[];
  cardinality: Cardinality;
}

export interface Relationship {
  id: string;
  name?: string;
  description?: string;
  from: RelationshipEnd;
  to: RelationshipEnd;
  identifying?: boolean;
  enforced?: boolean;
}

export interface Domain {
  id: string;
  name: string;
  description?: string;
  owner?: string;
}

export interface Kernmodell {
  formatVersion: string;
  model: {
    id: string;
    name: string;
    version: string;
    level?: string;
    targetPlatform?: string;
    description?: string;
    governance?: Governance;
  };
  domains?: Domain[];
  entities: Entity[];
  relationships?: Relationship[];
}

export interface ModelSummary {
  id: string;
  name: string;
  version: string;
  status?: string;
  entityCount: number;
  relationshipCount: number;
}

export interface ValidationIssue {
  source: 'SCHEMA' | 'REFERENZ';
  path: string;
  message: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface Layout {
  positions: Record<string, Position>;
}

export interface FormatInfo {
  format: string;
  label: string;
  fileExtension: string;
}
