import { useState } from 'react';
import type { Kernmodell } from '../types';
import { DeleteButton, Field, STATUSES, orUndef, type Apply } from './fields';
import { addDomain, deleteDomain, updateDomain, updateModelInfo } from './ops';

const SEMVER = /^\d+\.\d+\.\d+$/;

export default function ModelEditor({ model, apply }: { model: Kernmodell; apply: Apply }) {
  const info = model.model;
  const set = (patch: Partial<Kernmodell['model']>, f: string) => apply((m) => updateModelInfo(m, patch), `model:${f}`);
  const gov = info.governance ?? {};
  const [newDomain, setNewDomain] = useState('');

  return (
    <div className="editor">
      <p className="eyebrow">Modell bearbeiten</p>
      <div className="form-grid">
        <Field label="Name" error={info.name.trim() ? undefined : 'Pflichtfeld'}>
          <input id="model-name" value={info.name} onChange={(e) => set({ name: e.target.value }, 'name')} />
        </Field>
        <Field label="Version" error={SEMVER.test(info.version) ? undefined : 'Format 1.2.3'}>
          <input id="model-version" className="mono" value={info.version} onChange={(e) => set({ version: e.target.value }, 'version')} />
        </Field>
        <Field label="Ebene">
          <select id="model-level" value={info.level ?? ''} onChange={(e) => set({ level: orUndef(e.target.value) }, 'level')}>
            <option value="">– nicht gesetzt –</option>
            <option value="konzeptionell">konzeptionell</option>
            <option value="logisch">logisch</option>
            <option value="physisch">physisch</option>
          </select>
        </Field>
        <Field label="Zielplattform">
          <input
            id="model-platform"
            value={info.targetPlatform ?? ''}
            onChange={(e) => set({ targetPlatform: orUndef(e.target.value) }, 'platform')}
          />
        </Field>
        <Field label="Status">
          <select
            id="model-status"
            value={gov.status ?? ''}
            onChange={(e) => set({ governance: { ...gov, status: orUndef(e.target.value) as typeof gov.status } }, 'status')}
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
          <input
            id="model-owner"
            value={gov.owner ?? ''}
            onChange={(e) => set({ governance: { ...gov, owner: orUndef(e.target.value) } }, 'owner')}
          />
        </Field>
      </div>
      <Field label="Beschreibung">
        <textarea
          id="model-desc"
          rows={3}
          value={info.description ?? ''}
          onChange={(e) => set({ description: orUndef(e.target.value) }, 'description')}
        />
      </Field>

      <h3 className="panel-section">Domänen</h3>
      <ul className="domain-list">
        {(model.domains ?? []).map((d, i) => {
          const used = model.entities.filter((e) => e.domainId === d.id).length;
          return (
            <li key={d.id} className={`domain-row domain-${i % 6}`}>
              <span className="legend-dot" />
              <input
                id={`domain-${d.id}-name`}
                aria-label="Domänenname"
                value={d.name}
                onChange={(e) => apply((m) => updateDomain(m, d.id, { name: e.target.value }), `dom:${d.id}`)}
              />
              <span className="muted legend-count">{used}</span>
              <DeleteButton label="Entfernen" onConfirm={() => apply((m) => deleteDomain(m, d.id))} />
            </li>
          );
        })}
      </ul>
      <form
        className="domain-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newDomain.trim()) return;
          apply((m) => addDomain(m, newDomain.trim()));
          setNewDomain('');
        }}
      >
        <input id="domain-new" placeholder="Neue Domäne" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
        <button type="submit" className="btn" disabled={!newDomain.trim()}>
          Hinzufügen
        </button>
      </form>
      <p className="form-hint">Beim Entfernen einer Domäne bleiben ihre Tabellen erhalten, nur die Zuordnung entfällt.</p>
    </div>
  );
}
