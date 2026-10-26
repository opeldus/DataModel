import { useCallback, useRef, useState } from 'react';

const LIMIT = 100;
const COALESCE_MS = 1200;

interface State<T> {
  past: T[];
  present: T;
  future: T[];
}

/**
 * Undo/Redo-Verlauf. Änderungen mit gleichem `coalesceKey` kurz hintereinander
 * (z. B. Tippen in ein Feld) werden zu einem Schritt zusammengefasst.
 *
 * Die Änderungsfunktion läuft genau einmal und synchron (nicht im React-Updater),
 * damit erzeugte IDs stabil sind und der Aufrufer das Ergebnis sofort kennt.
 */
export function useHistory<T>(initial: T) {
  const ref = useRef<State<T>>({ past: [], present: initial, future: [] });
  const [state, setState] = useState(ref.current);
  const last = useRef<{ key?: string; at: number }>({ at: 0 });

  const commit = (next: State<T>) => {
    ref.current = next;
    setState(next);
  };

  const apply = useCallback((update: (current: T) => T, coalesceKey?: string): T => {
    const s = ref.current;
    const next = update(s.present);
    if (next === s.present) return next;
    const now = Date.now();
    const merge = coalesceKey !== undefined && last.current.key === coalesceKey && now - last.current.at < COALESCE_MS;
    last.current = { key: coalesceKey, at: now };
    commit({ past: merge ? s.past : [...s.past, s.present].slice(-LIMIT), present: next, future: [] });
    return next;
  }, []);

  /** Neuen Ausgangszustand setzen (z. B. nach Laden), Verlauf leeren. */
  const reset = useCallback((value: T) => {
    last.current = { at: 0 };
    commit({ past: [], present: value, future: [] });
  }, []);

  const undo = useCallback(() => {
    const s = ref.current;
    if (!s.past.length) return;
    last.current = { at: 0 };
    commit({ past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] });
  }, []);

  const redo = useCallback(() => {
    const s = ref.current;
    if (!s.future.length) return;
    last.current = { at: 0 };
    commit({ past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) });
  }, []);

  return {
    value: state.present,
    apply,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
