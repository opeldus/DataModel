import { sortedAttributes, typeLabel } from './diagram';
import type { Entity, Kernmodell, Relationship, ValidationIssue } from './types';

const CARD_TEXT: Record<string, string> = {
  '1': 'genau eins',
  '0..1': 'null oder eins',
  '0..n': 'null bis viele',
  '1..n': 'eins bis viele',
};

const STATUS_TEXT: Record<string, string> = {
  entwurf: 'Entwurf',
  in_pruefung: 'In Prüfung',
  freigegeben: 'Freigegeben',
  abgekuendigt: 'Abgekündigt',
};

interface Props {
  model: Kernmodell;
  entityId?: string;
  relationshipId?: string;
  issues?: ValidationIssue[];
  issuesTitle?: string;
  onSelectEntity: (id: string) => void;
  onSelectRelationship: (id: string) => void;
  onClose: () => void;
}

export default function DetailPanel(props: Props) {
  const { model, entityId, relationshipId, issues } = props;
  const entity = model.entities.find((e) => e.id === entityId);
  const rel = (model.relationships ?? []).find((r) => r.id === relationshipId);

  return (
    <aside className="panel" aria-label="Details">
      <button className="panel-close" onClick={props.onClose} aria-label="Details schließen">
        ×
      </button>
      {issues && <IssueList title={props.issuesTitle ?? 'Prüfergebnis'} issues={issues} />}
      {!issues && entity && <EntityDetail {...props} entity={entity} />}
      {!issues && rel && <RelationshipDetail {...props} rel={rel} />}
    </aside>
  );
}

function StatusChip({ status }: { status?: string }) {
  if (!status) return null;
  return <span className={`chip status-${status}`}>{STATUS_TEXT[status] ?? status}</span>;
}

function EntityDetail({ model, entity, onSelectEntity, onSelectRelationship }: Props & { entity: Entity }) {
  const domain = model.domains?.find((d) => d.id === entity.domainId);
  const pk = new Set(entity.primaryKey?.attributeIds ?? []);
  const rels = (model.relationships ?? []).filter((r) => r.from.entityId === entity.id || r.to.entityId === entity.id);
  const nameOf = (id: string) => {
    const e = model.entities.find((x) => x.id === id);
    return e?.physicalName ?? e?.name ?? id;
  };

  return (
    <>
      <p className="eyebrow">{entity.kind ?? 'Tabelle'}</p>
      <h2 className="panel-title">{entity.name}</h2>
      <p className="mono muted">
        {[entity.database, entity.schema, entity.physicalName].filter(Boolean).join('.')}
      </p>
      {entity.description && <p className="panel-text">{entity.description}</p>}

      <dl className="facts">
        {domain && (
          <>
            <dt>Domäne</dt>
            <dd>{domain.name}</dd>
          </>
        )}
        {entity.dataProduct && (
          <>
            <dt>Data Product</dt>
            <dd>{entity.dataProduct}</dd>
          </>
        )}
        {entity.classification && (
          <>
            <dt>Klassifizierung</dt>
            <dd>
              <span className={`chip class-${entity.classification}`}>{entity.classification.replace('_', ' ')}</span>
            </dd>
          </>
        )}
        {entity.governance?.status && (
          <>
            <dt>Status</dt>
            <dd>
              <StatusChip status={entity.governance.status} />
            </dd>
          </>
        )}
        {entity.governance?.owner && (
          <>
            <dt>Owner</dt>
            <dd>{entity.governance.owner}</dd>
          </>
        )}
        {entity.governance?.regulatoryTags?.length ? (
          <>
            <dt>Regulatorik</dt>
            <dd>{entity.governance.regulatoryTags.join(', ')}</dd>
          </>
        ) : null}
      </dl>

      <h3 className="panel-section">Spalten ({entity.attributes.length})</h3>
      <div className="table-scroll">
        <table className="attr-table">
          <thead>
            <tr>
              <th>Spalte</th>
              <th>Typ</th>
              <th>Fachlicher Name</th>
            </tr>
          </thead>
          <tbody>
            {sortedAttributes(entity).map((a) => (
              <tr key={a.id}>
                <td className="mono">
                  {a.physicalName ?? a.name}
                  {pk.has(a.id) && <span className="tag">PK</span>}
                </td>
                <td className="mono muted">
                  {typeLabel(a.dataType)}
                  {a.nullable === false ? ' not null' : ''}
                </td>
                <td>
                  {a.name}
                  {a.description && <span className="attr-desc">{a.description}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rels.length > 0 && (
        <>
          <h3 className="panel-section">Beziehungen ({rels.length})</h3>
          <ul className="rel-list">
            {rels.map((r) => {
              const other = r.from.entityId === entity.id ? r.to.entityId : r.from.entityId;
              const outgoing = r.from.entityId === entity.id;
              return (
                <li key={r.id}>
                  <button className="link" onClick={() => onSelectRelationship(r.id)}>
                    {r.name ?? 'Beziehung'}
                  </button>
                  <span className="muted">
                    {outgoing ? ' verweist auf ' : ' referenziert von '}
                  </span>
                  <button className="link mono" onClick={() => onSelectEntity(other)}>
                    {nameOf(other)}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

function RelationshipDetail({ model, rel, onSelectEntity }: Props & { rel: Relationship }) {
  const child = model.entities.find((e) => e.id === rel.from.entityId);
  const parent = model.entities.find((e) => e.id === rel.to.entityId);
  const cols = (e: Entity | undefined, ids: string[]) =>
    ids.map((id) => e?.attributes.find((a) => a.id === id)?.physicalName ?? id).join(', ');

  return (
    <>
      <p className="eyebrow">Beziehung</p>
      <h2 className="panel-title mono">{rel.name ?? 'ohne Namen'}</h2>
      {rel.description && <p className="panel-text">{rel.description}</p>}

      <div className="rel-ends">
        <div className="rel-end">
          <span className="eyebrow">Eltern (PK-Seite)</span>
          <button className="link mono" onClick={() => parent && onSelectEntity(parent.id)}>
            {parent?.physicalName ?? parent?.name}
          </button>
          <span className="mono muted">({cols(parent, rel.to.attributeIds)})</span>
          <span className="card-text">{CARD_TEXT[rel.to.cardinality]}</span>
        </div>
        <div className="rel-arrow" aria-hidden="true">
          ↔
        </div>
        <div className="rel-end">
          <span className="eyebrow">Kind (FK-Seite)</span>
          <button className="link mono" onClick={() => child && onSelectEntity(child.id)}>
            {child?.physicalName ?? child?.name}
          </button>
          <span className="mono muted">({cols(child, rel.from.attributeIds)})</span>
          <span className="card-text">{CARD_TEXT[rel.from.cardinality]}</span>
        </div>
      </div>

      <p className="panel-text">
        Ein {parent?.name} hat {CARD_TEXT[rel.from.cardinality]} {child?.name}. Ein {child?.name} gehört zu{' '}
        {CARD_TEXT[rel.to.cardinality]} {parent?.name}.
      </p>

      <dl className="facts">
        <dt>Art</dt>
        <dd>{rel.identifying ? 'identifizierend (FK ist Teil des PK)' : 'nicht identifizierend'}</dd>
        <dt>In der DB erzwungen</dt>
        <dd>{rel.enforced ? 'ja' : 'nein (informativ)'}</dd>
      </dl>
    </>
  );
}

function IssueList({ title, issues }: { title: string; issues: ValidationIssue[] }) {
  return (
    <>
      <p className="eyebrow">Modellprüfung</p>
      <h2 className="panel-title">{title}</h2>
      {issues.length === 0 ? (
        <p className="panel-text">Keine Befunde. Schema und Referenzen sind in Ordnung.</p>
      ) : (
        <ul className="issue-list">
          {issues.map((i, n) => (
            <li key={n} className={`issue issue-${i.source.toLowerCase()}`}>
              <span className="chip">{i.source === 'SCHEMA' ? 'Schema' : 'Referenz'}</span>
              <span className="issue-msg">{i.message}</span>
              <code className="issue-path">{i.path}</code>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
