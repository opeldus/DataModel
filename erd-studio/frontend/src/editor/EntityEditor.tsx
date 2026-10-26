import { useState } from 'react';
import { sortedAttributes } from '../diagram';
import type { Attribute, Entity, Kernmodell } from '../types';
import {
  CLASSIFICATIONS,
  DATA_TYPES,
  DeleteButton,
  Field,
  STATUSES,
  orUndef,
  type Apply,
} from './fields';
import {
  PHYSICAL_NAME,
  addAttribute,
  deleteAttribute,
  deleteEntity,
  moveAttribute,
  togglePrimaryKey,
  updateAttribute,
  updateDataType,
  updateEntity,
} from './ops';

interface Props {
  model: Kernmodell;
  entity: Entity;
  apply: Apply;
  onDeleted: () => void;
  onSelectRelationship: (id: string) => void;
}

export default function EntityEditor({ model, entity, apply, onDeleted, onSelectRelationship }: Props) {
  const [openAttr, setOpenAttr] = useState<string>();
  const set = (patch: Partial<Entity>, field: string) =>
    apply((m) => updateEntity(m, entity.id, patch), `ent:${entity.id}:${field}`);
  const gov = entity.governance ?? {};
  const setGov = (patch: Partial<NonNullable<Entity['governance']>>, field: string) =>
    set({ governance: cleanGov({ ...gov, ...patch }) }, `gov.${field}`);

  const physicalError = nameError(entity.physicalName, 'Tabellenname');
  const duplicate = model.entities.some(
    (e) =>
      e.id !== entity.id &&
      (e.schema ?? '') === (entity.schema ?? '') &&
      (e.physicalName ?? e.name).toUpperCase() === (entity.physicalName ?? entity.name).toUpperCase(),
  );
  const pk = new Set(entity.primaryKey?.attributeIds ?? []);
  const fk = new Set((model.relationships ?? []).flatMap((r) => (r.from.entityId === entity.id ? r.from.attributeIds : [])));
  const rels = (model.relationships ?? []).filter((r) => r.from.entityId === entity.id || r.to.entityId === entity.id);

  return (
    <div className="editor">
      <p className="eyebrow">Tabelle bearbeiten</p>

      <div className="form-grid">
        <Field label="Technischer Name" error={physicalError ?? (duplicate ? 'Name ist im Schema bereits vergeben' : undefined)}>
          <input
            id={`ent-${entity.id}-physical`}
            className="mono"
            value={entity.physicalName ?? ''}
            onChange={(e) => set({ physicalName: e.target.value.toUpperCase() }, 'physicalName')}
          />
        </Field>
        <Field label="Schema">
          <input
            id={`ent-${entity.id}-schema`}
            className="mono"
            value={entity.schema ?? ''}
            onChange={(e) => set({ schema: orUndef(e.target.value.toUpperCase()) }, 'schema')}
          />
        </Field>
        <Field label="Fachlicher Name" error={entity.name.trim() ? undefined : 'Pflichtfeld'}>
          <input id={`ent-${entity.id}-name`} value={entity.name} onChange={(e) => set({ name: e.target.value }, 'name')} />
        </Field>
        <Field label="Domäne">
          <select
            id={`ent-${entity.id}-domain`}
            value={entity.domainId ?? ''}
            onChange={(e) => set({ domainId: orUndef(e.target.value) }, 'domain')}
          >
            <option value="">– keine –</option>
            {(model.domains ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Art">
          <select id={`ent-${entity.id}-kind`} value={entity.kind ?? 'tabelle'} onChange={(e) => set({ kind: e.target.value }, 'kind')}>
            <option value="tabelle">Tabelle</option>
            <option value="view">View</option>
            <option value="materialisierte_view">Materialisierte View</option>
            <option value="externe_tabelle">Externe Tabelle</option>
          </select>
        </Field>
        <Field label="Data Product">
          <input
            id={`ent-${entity.id}-dp`}
            value={entity.dataProduct ?? ''}
            onChange={(e) => set({ dataProduct: orUndef(e.target.value) }, 'dataProduct')}
          />
        </Field>
        <Field label="Klassifizierung">
          <select
            id={`ent-${entity.id}-class`}
            value={entity.classification ?? ''}
            onChange={(e) => set({ classification: orUndef(e.target.value) }, 'classification')}
          >
            <option value="">– nicht gesetzt –</option>
            {CLASSIFICATIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            id={`ent-${entity.id}-status`}
            value={gov.status ?? ''}
            onChange={(e) => setGov({ status: orUndef(e.target.value) as typeof gov.status }, 'status')}
          >
            <option value="">– nicht gesetzt –</option>
            {STATUSES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owner">
          <input id={`ent-${entity.id}-owner`} value={gov.owner ?? ''} onChange={(e) => setGov({ owner: orUndef(e.target.value) }, 'owner')} />
        </Field>
        <Field label="Regulatorik" hint="Kommagetrennt, z. B. BCBS239, DSGVO">
          <input
            id={`ent-${entity.id}-tags`}
            value={(gov.regulatoryTags ?? []).join(', ')}
            onChange={(e) =>
              setGov(
                {
                  regulatoryTags: [...new Set(e.target.value.split(',').map((t) => t.trim()).filter(Boolean))],
                },
                'tags',
              )
            }
          />
        </Field>
      </div>
      <Field label="Beschreibung">
        <textarea
          id={`ent-${entity.id}-desc`}
          rows={2}
          value={entity.description ?? ''}
          onChange={(e) => set({ description: orUndef(e.target.value) }, 'description')}
        />
      </Field>

      <div className="editor-section-head">
        <h3 className="panel-section">Spalten ({entity.attributes.length})</h3>
        <button
          type="button"
          className="btn"
          onClick={() => {
            let created: Attribute | undefined;
            apply((m) => {
              const r = addAttribute(m, entity.id);
              created = r.attribute;
              return r.model;
            });
            window.setTimeout(() => {
              if (created) {
                setOpenAttr(created.id);
                (document.getElementById(`attr-${created.id}-physical`) as HTMLInputElement | null)?.select();
              }
            }, 30);
          }}
        >
          + Spalte
        </button>
      </div>

      <ol className="attr-editor">
        {sortedAttributes(entity).map((a, i, list) => (
          <AttributeRow
            key={a.id}
            entity={entity}
            attr={a}
            isPk={pk.has(a.id)}
            isFk={fk.has(a.id)}
            first={i === 0}
            last={i === list.length - 1}
            open={openAttr === a.id}
            onToggle={() => setOpenAttr(openAttr === a.id ? undefined : a.id)}
            apply={apply}
          />
        ))}
      </ol>

      {rels.length > 0 && (
        <>
          <h3 className="panel-section">Beziehungen ({rels.length})</h3>
          <ul className="rel-list">
            {rels.map((r) => (
              <li key={r.id}>
                <button type="button" className="link mono" onClick={() => onSelectRelationship(r.id)}>
                  {r.name ?? 'Beziehung'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="form-hint editor-tip">
        Beziehung anlegen: im Diagramm vom Punkt einer FK-Spalte zur PK-Spalte ziehen. Vom Tabellenkopf auf eine andere
        Tabelle gezogen, legt die FK-Spalten automatisch an.
      </p>

      <div className="editor-footer">
        <DeleteButton
          label="Tabelle löschen"
          onConfirm={() => {
            apply((m) => deleteEntity(m, entity.id));
            onDeleted();
          }}
        />
      </div>
    </div>
  );
}

function AttributeRow(props: {
  entity: Entity;
  attr: Attribute;
  isPk: boolean;
  isFk: boolean;
  first: boolean;
  last: boolean;
  open: boolean;
  onToggle: () => void;
  apply: Apply;
}) {
  const { entity, attr: a, isPk, isFk, apply } = props;
  const key = (f: string) => `attr:${a.id}:${f}`;
  const set = (patch: Partial<Attribute>, f: string) => apply((m) => updateAttribute(m, entity.id, a.id, patch), key(f));
  const dt = a.dataType;
  const physicalError = nameError(a.physicalName, 'Spaltenname');
  const dupe = entity.attributes.some(
    (o) => o.id !== a.id && (o.physicalName ?? o.name).toUpperCase() === (a.physicalName ?? a.name).toUpperCase(),
  );

  return (
    <li className={`attr-item${props.open ? ' is-open' : ''}${physicalError || dupe ? ' has-error' : ''}`}>
      <div className="attr-main">
        <input
          id={`attr-${a.id}-physical`}
          className="mono attr-name"
          aria-label="Technischer Spaltenname"
          value={a.physicalName ?? ''}
          onChange={(e) => set({ physicalName: e.target.value.toUpperCase() }, 'physicalName')}
        />
        <select
          id={`attr-${a.id}-type`}
          className="mono"
          aria-label="Datentyp"
          value={dt.type}
          onChange={(e) => apply((m) => updateDataType(m, entity.id, a.id, { type: e.target.value }), key('type'))}
        >
          {DATA_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {(dt.type === 'string' || dt.type === 'binary') && (
          <input
            id={`attr-${a.id}-len`}
            className="mono num"
            type="number"
            min={1}
            aria-label="Länge"
            value={dt.length ?? ''}
            onChange={(e) => apply((m) => updateDataType(m, entity.id, a.id, { length: int(e.target.value, 1) }), key('len'))}
          />
        )}
        {dt.type === 'decimal' && (
          <span className="prec">
            <input
              id={`attr-${a.id}-prec`}
              className="mono num"
              type="number"
              min={1}
              max={38}
              aria-label="Präzision"
              value={dt.precision ?? ''}
              onChange={(e) =>
                apply((m) => updateDataType(m, entity.id, a.id, { precision: int(e.target.value, 1, 38) }), key('prec'))
              }
            />
            <input
              id={`attr-${a.id}-scale`}
              className="mono num"
              type="number"
              min={0}
              max={37}
              aria-label="Nachkommastellen"
              value={dt.scale ?? ''}
              onChange={(e) =>
                apply((m) => updateDataType(m, entity.id, a.id, { scale: int(e.target.value, 0, 37) }), key('scale'))
              }
            />
          </span>
        )}
      </div>
      {dt.nativeType && <span className="form-hint mono">Originaltyp: {dt.nativeType}</span>}
      {(physicalError || dupe) && <span className="form-error">{physicalError ?? 'Spaltenname doppelt'}</span>}

      <div className="attr-flags">
        <label className="check">
          <input
            id={`attr-${a.id}-pk`}
            type="checkbox"
            checked={isPk}
            onChange={() => apply((m) => togglePrimaryKey(m, entity.id, a.id))}
          />
          PK
        </label>
        <label className="check">
          <input
            id={`attr-${a.id}-nn`}
            type="checkbox"
            checked={a.nullable === false}
            disabled={isPk}
            onChange={(e) => set({ nullable: e.target.checked ? false : undefined }, 'nn')}
          />
          Not null
        </label>
        {isFk && <span className="chip">FK</span>}
        <span className="spacer" />
        <button type="button" className="icon-btn" aria-label="Nach oben" disabled={props.first}
          onClick={() => apply((m) => moveAttribute(m, entity.id, a.id, -1))}>↑</button>
        <button type="button" className="icon-btn" aria-label="Nach unten" disabled={props.last}
          onClick={() => apply((m) => moveAttribute(m, entity.id, a.id, 1))}>↓</button>
        <button type="button" className="icon-btn" aria-expanded={props.open} aria-label="Weitere Angaben" onClick={props.onToggle}>
          {props.open ? '▾' : '▸'}
        </button>
        <button type="button" className="icon-btn is-danger" aria-label="Spalte löschen"
          onClick={() => apply((m) => deleteAttribute(m, entity.id, a.id))}>×</button>
      </div>

      {props.open && (
        <div className="attr-details">
          <Field label="Fachlicher Name">
            <input id={`attr-${a.id}-name`} value={a.name} onChange={(e) => set({ name: e.target.value }, 'name')} />
          </Field>
          <Field label="Beschreibung">
            <textarea
              id={`attr-${a.id}-desc`}
              rows={2}
              value={a.description ?? ''}
              onChange={(e) => set({ description: orUndef(e.target.value) }, 'description')}
            />
          </Field>
          <div className="form-grid">
            <Field label="Klassifizierung">
              <select
                id={`attr-${a.id}-class`}
                value={a.classification ?? ''}
                onChange={(e) => set({ classification: orUndef(e.target.value) }, 'classification')}
              >
                <option value="">– wie Tabelle –</option>
                {CLASSIFICATIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Default">
              <input
                id={`attr-${a.id}-default`}
                className="mono"
                value={a.defaultValue === undefined || a.defaultValue === null ? '' : String(a.defaultValue)}
                onChange={(e) => set({ defaultValue: parseDefault(e.target.value, dt.type) }, 'default')}
              />
            </Field>
          </div>
          <Field label="Glossarbegriff" hint="z. B. DataHub-URN">
            <input
              id={`attr-${a.id}-term`}
              className="mono"
              value={a.businessTerm ?? ''}
              onChange={(e) => set({ businessTerm: orUndef(e.target.value) }, 'term')}
            />
          </Field>
        </div>
      )}
    </li>
  );
}

function nameError(name: string | undefined, what: string): string | undefined {
  if (!name) return `${what} fehlt`;
  if (!PHYSICAL_NAME.test(name)) return 'Nur Buchstaben, Ziffern, _ und $; nicht mit Ziffer beginnen';
  return undefined;
}

function int(v: string, min: number, max = Number.MAX_SAFE_INTEGER): number | undefined {
  if (v === '') return undefined;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
}

function parseDefault(v: string, type: string): Attribute['defaultValue'] {
  if (v === '') return undefined;
  if (type === 'boolean') return v.toLowerCase() === 'true' ? true : v.toLowerCase() === 'false' ? false : v;
  if (['integer', 'decimal', 'float'].includes(type) && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return v;
}

function cleanGov(g: NonNullable<Entity['governance']>): Entity['governance'] {
  const out = Object.fromEntries(
    Object.entries(g).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)),
  );
  return Object.keys(out).length ? (out as Entity['governance']) : undefined;
}
