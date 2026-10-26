import type { Cardinality, Kernmodell, Relationship } from '../types';
import { CARDINALITIES, DeleteButton, Field, orUndef, type Apply } from './fields';
import { deleteRelationship, setCardinality, updateRelationship } from './ops';

interface Props {
  model: Kernmodell;
  rel: Relationship;
  apply: Apply;
  onDeleted: () => void;
  onSelectEntity: (id: string) => void;
}

export default function RelationshipEditor({ model, rel, apply, onDeleted, onSelectEntity }: Props) {
  const child = model.entities.find((e) => e.id === rel.from.entityId);
  const parent = model.entities.find((e) => e.id === rel.to.entityId);
  const cols = (ids: string[], e = child) =>
    ids.map((id) => e?.attributes.find((a) => a.id === id)?.physicalName ?? '?').join(', ');
  const set = (patch: Partial<Relationship>, f: string) => apply((m) => updateRelationship(m, rel.id, patch), `rel:${rel.id}:${f}`);

  return (
    <div className="editor">
      <p className="eyebrow">Beziehung bearbeiten</p>

      <Field label="Name" hint="Wird als Constraint-Name im DDL verwendet">
        <input
          id={`rel-${rel.id}-name`}
          className="mono"
          value={rel.name ?? ''}
          onChange={(e) => set({ name: orUndef(e.target.value.toUpperCase()) }, 'name')}
        />
      </Field>

      <div className="rel-ends">
        <div className="rel-end">
          <span className="eyebrow">Eltern (PK-Seite)</span>
          <button type="button" className="link mono" onClick={() => parent && onSelectEntity(parent.id)}>
            {parent?.physicalName ?? parent?.name}
          </button>
          <span className="mono muted">({cols(rel.to.attributeIds, parent)})</span>
          <select
            id={`rel-${rel.id}-card-to`}
            aria-label="Kardinalität Eltern"
            value={rel.to.cardinality}
            onChange={(e) => apply((m) => setCardinality(m, rel.id, 'to', e.target.value as Cardinality))}
          >
            {CARDINALITIES.filter(([v]) => v === '1' || v === '0..1').map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="rel-arrow" aria-hidden="true">
          ↔
        </div>
        <div className="rel-end">
          <span className="eyebrow">Kind (FK-Seite)</span>
          <button type="button" className="link mono" onClick={() => child && onSelectEntity(child.id)}>
            {child?.physicalName ?? child?.name}
          </button>
          <span className="mono muted">({cols(rel.from.attributeIds)})</span>
          <select
            id={`rel-${rel.id}-card-from`}
            aria-label="Kardinalität Kind"
            value={rel.from.cardinality}
            onChange={(e) => apply((m) => setCardinality(m, rel.id, 'from', e.target.value as Cardinality))}
          >
            {CARDINALITIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="panel-text">
        Ein {parent?.name} hat {label(rel.from.cardinality)} {child?.name}. Ein {child?.name} gehört zu{' '}
        {label(rel.to.cardinality)} {parent?.name}.
      </p>

      <div className="attr-flags">
        <label className="check">
          <input
            id={`rel-${rel.id}-ident`}
            type="checkbox"
            checked={!!rel.identifying}
            onChange={(e) => set({ identifying: e.target.checked }, 'ident')}
          />
          Identifizierend (FK ist Teil des PK)
        </label>
      </div>
      <div className="attr-flags">
        <label className="check">
          <input
            id={`rel-${rel.id}-enforced`}
            type="checkbox"
            checked={!!rel.enforced}
            onChange={(e) => set({ enforced: e.target.checked }, 'enforced')}
          />
          In der Datenbank erzwungen
        </label>
      </div>

      <Field label="Beschreibung">
        <textarea
          id={`rel-${rel.id}-desc`}
          rows={2}
          value={rel.description ?? ''}
          onChange={(e) => set({ description: orUndef(e.target.value) }, 'description')}
        />
      </Field>

      <div className="editor-footer">
        <DeleteButton
          label="Beziehung löschen"
          onConfirm={() => {
            apply((m) => deleteRelationship(m, rel.id));
            onDeleted();
          }}
        />
      </div>
    </div>
  );
}

function label(c: Cardinality): string {
  return { '1': 'genau eins', '0..1': 'null oder eins', '0..n': 'null bis viele', '1..n': 'eins bis viele' }[c];
}
