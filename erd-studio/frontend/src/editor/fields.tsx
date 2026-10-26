import { useState, type ReactNode } from 'react';
import type { Kernmodell } from '../types';

/** Änderungsfunktion des Editors. Gleicher `key` kurz hintereinander = ein Undo-Schritt. */
export type Apply = (update: (m: Kernmodell) => Kernmodell, key?: string) => void;

export const CLASSIFICATIONS = [
  ['oeffentlich', 'öffentlich'],
  ['intern', 'intern'],
  ['vertraulich', 'vertraulich'],
  ['streng_vertraulich', 'streng vertraulich'],
] as const;

export const STATUSES = [
  ['entwurf', 'Entwurf'],
  ['in_pruefung', 'In Prüfung'],
  ['freigegeben', 'Freigegeben'],
  ['abgekuendigt', 'Abgekündigt'],
] as const;

export const DATA_TYPES = [
  'string', 'integer', 'decimal', 'float', 'boolean', 'date', 'time',
  'timestamp', 'timestamp_tz', 'binary', 'json', 'array', 'uuid',
] as const;

export const CARDINALITIES = [
  ['1', 'genau eins (1)'],
  ['0..1', 'null oder eins (0..1)'],
  ['0..n', 'null bis viele (0..n)'],
  ['1..n', 'eins bis viele (1..n)'],
] as const;

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className={`form-field${error ? ' has-error' : ''}`}>
      <span className="form-label">{label}</span>
      {children}
      {error ? <span className="form-error">{error}</span> : hint ? <span className="form-hint">{hint}</span> : null}
    </label>
  );
}

/** Leere Eingabe → undefined, damit keine leeren Strings ins Modell gelangen. */
export const orUndef = (v: string) => (v.trim() === '' ? undefined : v);

/** Zweistufiger Löschknopf statt Bestätigungsdialog. */
export function DeleteButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <span className="delete-confirm">
      <button type="button" className="btn is-danger" onClick={onConfirm}>
        Wirklich löschen
      </button>
      <button type="button" className="btn" onClick={() => setArmed(false)}>
        Abbrechen
      </button>
    </span>
  ) : (
    <button type="button" className="btn is-danger-outline" onClick={() => setArmed(true)}>
      {label}
    </button>
  );
}
