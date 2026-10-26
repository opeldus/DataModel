import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type FinalConnectionState,
  type NodeChange,
  type OnDelete,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ApiError, api } from './api';
import DetailPanel from './DetailPanel';
import { autoLayout, buildEdges, buildNodes, matchesSearch, type TableNode as TableNodeType, type ViewState } from './diagram';
import EntityEditor from './editor/EntityEditor';
import ModelEditor from './editor/ModelEditor';
import RelationshipEditor from './editor/RelationshipEditor';
import { addEntity, connectAttributes, connectEntities, deleteEntity, deleteRelationship, emptyModel, type ConnectResult } from './editor/ops';
import { useHistory } from './editor/useHistory';
import Markers from './Markers';
import TableNode from './TableNode';
import type { FormatInfo, Kernmodell, ModelSummary, Position, ValidationIssue } from './types';

const nodeTypes = { table: TableNode };
const LAST_MODEL_KEY = 'erd-studio:last-model';

type Mode = 'view' | 'edit';

type Panel =
  | { kind: 'none' }
  | { kind: 'details' }
  | { kind: 'model' }
  | { kind: 'issues'; title: string; issues: ValidationIssue[] };

interface Conflict {
  id: string;
  json: unknown;
}

/** Anschlusspunkt-ID zerlegen: "<attrId>-sL" oder "head-sR" */
function parseHandle(handle: string | null | undefined): { head: boolean; attrId?: string } {
  if (!handle) return { head: true };
  if (handle.startsWith('head-')) return { head: true };
  return { head: false, attrId: handle.slice(0, handle.lastIndexOf('-')) };
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Speicher nicht verfügbar */
  }
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

function Studio() {
  const flow = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const history = useHistory<Kernmodell | undefined>(undefined);
  const model = history.value;

  const [models, setModels] = useState<ModelSummary[]>([]);
  const [modelId, setModelId] = useState<string>();
  const [mode, setMode] = useState<Mode>('view');
  const [savedJson, setSavedJson] = useState('');
  const [storedIssues, setStoredIssues] = useState<ValidationIssue[]>([]);
  const [liveIssues, setLiveIssues] = useState<ValidationIssue[]>();
  const [formats, setFormats] = useState<FormatInfo[]>([]);
  const [nodes, setNodes] = useState<TableNodeType[]>([]);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [panel, setPanel] = useState<Panel>({ kind: 'none' });
  const [toast, setToast] = useState<string>();
  const [conflict, setConflict] = useState<Conflict>();
  const [pendingSwitch, setPendingSwitch] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewState>({ hiddenDomains: new Set(), search: '' });
  const positions = useRef<Record<string, Position>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const modelDirty = useMemo(() => !!model && JSON.stringify(model) !== savedJson, [model, savedJson]);
  const dirty = modelDirty || layoutDirty;
  const issues = modelDirty && liveIssues ? liveIssues : storedIssues;
  const editing = mode === 'edit';

  const notify = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((t) => (t === text ? undefined : t)), 4000);
  }, []);

  const refreshModels = useCallback(async () => {
    const list = await api.listModels();
    setModels(list);
    return list;
  }, []);

  useEffect(() => {
    Promise.all([refreshModels(), api.formats()])
      .then(([list, fmts]) => {
        setFormats(fmts);
        const last = storageGet(LAST_MODEL_KEY);
        setModelId(list.find((m) => m.id === last)?.id ?? list[0]?.id);
      })
      .catch((e: Error) => notify(`Backend nicht erreichbar: ${e.message}`));
  }, [refreshModels, notify]);

  // Modell mit Layout und Prüfergebnis laden
  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    storageSet(LAST_MODEL_KEY, modelId);
    Promise.all([api.getModel(modelId), api.getLayout(modelId), api.validation(modelId)])
      .then(([m, layout, found]) => {
        if (cancelled) return;
        positions.current = { ...autoLayout(m), ...layout.positions };
        history.reset(m);
        setSavedJson(JSON.stringify(m));
        setStoredIssues(found);
        setLiveIssues(undefined);
        setLayoutDirty(false);
        setView({ hiddenDomains: new Set(), search: '' });
        setPanel({ kind: 'none' });
        setLayoutVersion((v) => v + 1);
        window.setTimeout(() => flow.fitView({ padding: 0.15, duration: 300 }), 60);
      })
      .catch((e: Error) => notify(e.message));
    return () => {
      cancelled = true;
    };
  }, [modelId, flow, notify]);

  // Knoten neu aufbauen; gemessene Größen bleiben erhalten
  useEffect(() => {
    if (!model) return;
    setNodes((prev) => {
      const measured = new Map(prev.map((n) => [n.id, n.measured]));
      return buildNodes(model, positions.current, view, editing).map((n) => ({ ...n, measured: measured.get(n.id) }));
    });
  }, [model, view, layoutVersion, editing]);

  // Nach Modelländerungen Anschlusspunkte neu vermessen (Spalten verschoben, hinzugefügt, gelöscht)
  useEffect(() => {
    if (!model) return;
    const ids = model.entities.map((e) => e.id);
    const raf = requestAnimationFrame(() => updateNodeInternals(ids));
    return () => cancelAnimationFrame(raf);
  }, [model, editing, updateNodeInternals]);

  // Live-Prüfung beim Bearbeiten (verzögert, damit nicht jeder Tastendruck eine Anfrage auslöst)
  useEffect(() => {
    if (!model || !modelDirty) return;
    const t = window.setTimeout(() => {
      api.validate(model).then(setLiveIssues).catch(() => undefined);
    }, 600);
    return () => window.clearTimeout(t);
  }, [model, modelDirty]);

  // Warnung beim Schließen mit ungespeicherten Änderungen
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const edges = useMemo(() => (model ? buildEdges(model, nodes, view) : []), [model, nodes, view]);

  const onNodesChange = useCallback((changes: NodeChange<TableNodeType>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    for (const c of changes) {
      if (c.type === 'position' && c.position) {
        positions.current[c.id] = c.position;
        setLayoutDirty(true);
      }
    }
  }, []);

  const selectEntity = useCallback(
    (id: string, center = true) => {
      setView((v) => ({ ...v, selectedEntityId: id, selectedRelationshipId: undefined }));
      setPanel({ kind: 'details' });
      const n = flow.getNode(id);
      if (n && center) {
        const w = n.measured?.width ?? 280;
        const h = n.measured?.height ?? 200;
        flow.setCenter(n.position.x + w / 2, n.position.y + h / 2, { duration: 300, zoom: flow.getZoom() });
      }
    },
    [flow],
  );

  const selectRelationship = useCallback((id: string) => {
    setView((v) => ({ ...v, selectedRelationshipId: id, selectedEntityId: undefined }));
    setPanel({ kind: 'details' });
  }, []);

  const clearSelection = useCallback(() => {
    setView((v) => ({ ...v, selectedEntityId: undefined, selectedRelationshipId: undefined }));
    setPanel((p) => (p.kind === 'details' ? { kind: 'none' } : p));
  }, []);

  // ---------- Speichern / Verwerfen ----------

  const save = useCallback(async () => {
    if (!model || !modelId || saving) return;
    setSaving(true);
    try {
      if (modelDirty) {
        const saved = await api.replaceModel(modelId, model);
        setSavedJson(JSON.stringify(saved));
        setStoredIssues([]);
        setLiveIssues(undefined);
        await refreshModels();
      }
      if (layoutDirty) {
        await api.saveLayout(modelId, { positions: positions.current });
        setLayoutDirty(false);
      }
      notify('Gespeichert.');
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        setPanel({ kind: 'issues', title: 'Speichern abgelehnt', issues: e.issues });
        notify('Nicht gespeichert: Das Modell hat Befunde.');
      } else {
        notify((e as Error).message);
      }
    } finally {
      setSaving(false);
    }
  }, [model, modelId, modelDirty, layoutDirty, saving, refreshModels, notify]);

  const discard = useCallback(() => {
    if (!savedJson) return;
    history.reset(JSON.parse(savedJson));
    setLiveIssues(undefined);
    clearSelection();
    notify('Änderungen verworfen.');
  }, [savedJson, clearSelection, notify]);

  const switchModel = (id: string) => {
    if (dirty) setPendingSwitch(id);
    else setModelId(id);
  };

  // ---------- Bearbeiten ----------

  const runConnect = useCallback(
    (result: ConnectResult) => {
      if (result.model !== model) {
        history.apply(() => result.model);
        if (result.relationship) selectRelationship(result.relationship.id);
      }
      if (result.message) notify(result.message);
    },
    [model, selectRelationship, notify],
  );

  const singlePk = (entityId: string) => {
    const e = model?.entities.find((x) => x.id === entityId);
    const ids = e?.primaryKey?.attributeIds ?? [];
    return ids.length === 1 ? ids[0] : undefined;
  };

  const onConnect = useCallback(
    (c: Connection) => {
      if (!model) return;
      const s = parseHandle(c.sourceHandle);
      const t = parseHandle(c.targetHandle);
      if (s.head) {
        runConnect(connectEntities(model, c.source, c.target));
      } else if (t.head) {
        const pk = singlePk(c.target);
        runConnect(
          pk
            ? connectAttributes(model, { entityId: c.source, attrId: s.attrId! }, { entityId: c.target, attrId: pk })
            : { model, message: 'Auf eine Spalte der Zieltabelle ziehen.' },
        );
      } else {
        runConnect(
          connectAttributes(model, { entityId: c.source, attrId: s.attrId! }, { entityId: c.target, attrId: t.attrId! }),
        );
      }
    },
    [model, runConnect],
  );

  /** Loslassen über einer Tabelle (nicht genau auf einem Punkt) */
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (!model || state.isValid || !state.fromNode || !state.fromHandle) return;
      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      const el = document.elementFromPoint(point.clientX, point.clientY)?.closest('.react-flow__node');
      const targetId = el?.getAttribute('data-id');
      if (!targetId) return;
      const from = parseHandle(state.fromHandle.id);
      if (from.head) {
        runConnect(connectEntities(model, state.fromNode.id, targetId));
      } else {
        const pk = singlePk(targetId);
        if (pk && targetId !== state.fromNode.id) {
          runConnect(connectAttributes(model, { entityId: state.fromNode.id, attrId: from.attrId! }, { entityId: targetId, attrId: pk }));
        }
      }
    },
    [model, runConnect],
  );

  const onDelete: OnDelete = useCallback(
    ({ nodes: delNodes, edges: delEdges }) => {
      if (!editing || (!delNodes.length && !delEdges.length)) return;
      history.apply((m) => {
        if (!m) return m;
        let next = m;
        for (const e of delEdges) next = deleteRelationship(next, e.id);
        for (const n of delNodes) next = deleteEntity(next, n.id);
        return next;
      });
      clearSelection();
    },
    [editing, clearSelection],
  );

  const addTable = () => {
    if (!model) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = rect
      ? flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 0, y: 0 };
    const visibleDomain = (model.domains ?? []).find((d) => !view.hiddenDomains.has(d.id))?.id;
    const { model: next, entity } = addEntity(model, visibleDomain);
    const offset = (model.entities.length % 5) * 24;
    positions.current[entity.id] = { x: Math.round(center.x - 140 + offset), y: Math.round(center.y - 40 + offset) };
    setLayoutDirty(true);
    history.apply(() => next);
    setView((v) => ({ ...v, selectedEntityId: entity.id, selectedRelationshipId: undefined }));
    setPanel({ kind: 'details' });
    window.setTimeout(() => (document.getElementById(`ent-${entity.id}-physical`) as HTMLInputElement | null)?.select(), 60);
  };

  const createModel = async () => {
    try {
      const created = await api.createModel(emptyModel('Neues Modell'));
      await refreshModels();
      setMode('edit');
      switchModel(created.model.id);
      window.setTimeout(() => setPanel({ kind: 'model' }), 300);
      notify('Neues Modell angelegt.');
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const runAutoLayout = useCallback(() => {
    if (!model) return;
    positions.current = autoLayout(model);
    setLayoutVersion((v) => v + 1);
    setLayoutDirty(true);
    window.setTimeout(() => flow.fitView({ padding: 0.15, duration: 300 }), 60);
  }, [model, flow]);

  // Tastatur
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') clearSelection();
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
      if (!editing || isTyping(e.target)) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearSelection, save, editing]);

  // ---------- Import / Export ----------

  const onExport = async (format: string) => {
    if (!model || !modelId || !format) return;
    if (modelDirty && format !== 'json') {
      notify('Erst speichern: Der Export nutzt den gespeicherten Stand.');
      return;
    }
    const base = model.model.name.replace(/[^A-Za-z0-9_-]+/g, '_');
    if (format === 'json') {
      download(`${base}.json`, JSON.stringify(model, null, 2));
      return;
    }
    try {
      const fmt = formats.find((f) => f.format === format);
      download(`${base}.${fmt?.fileExtension ?? 'txt'}`, await api.exportModel(modelId, format));
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      notify(`${file.name} ist kein gültiges JSON.`);
      return;
    }
    await importModel(json, false);
  };

  const importModel = async (json: unknown, replace: boolean) => {
    try {
      const id = (json as Kernmodell).model?.id;
      const created = replace ? await api.replaceModel(id, json) : await api.createModel(json);
      setConflict(undefined);
      await refreshModels();
      if (created.model.id === modelId) {
        setModelId(undefined);
        window.setTimeout(() => setModelId(created.model.id), 0);
      } else {
        setModelId(created.model.id);
      }
      notify(`„${created.model.name}“ ${replace ? 'ersetzt' : 'importiert'}.`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        setPanel({ kind: 'issues', title: 'Import abgelehnt', issues: e.issues });
      } else if (e instanceof ApiError && e.status === 409) {
        setConflict({ id: (json as Kernmodell).model.id, json });
      } else {
        notify((e as Error).message);
      }
    }
  };

  // ---------- Suche / Filter ----------

  const searchHits = useMemo(
    () => (model && view.search ? model.entities.filter((e) => matchesSearch(e, view.search)) : []),
    [model, view.search],
  );

  const focusHits = () => {
    if (searchHits.length) {
      flow.fitView({ nodes: searchHits.map((e) => ({ id: e.id })), padding: 0.4, duration: 300 });
    }
  };

  const toggleDomain = (id: string) =>
    setView((v) => {
      const hidden = new Set(v.hiddenDomains);
      if (hidden.has(id)) hidden.delete(id);
      else hidden.add(id);
      return { ...v, hiddenDomains: hidden };
    });

  const selectedEntity = model?.entities.find((e) => e.id === view.selectedEntityId);
  const selectedRel = (model?.relationships ?? []).find((r) => r.id === view.selectedRelationshipId);
  const hasSelection = !!selectedEntity || !!selectedRel;
  const applyModel = useCallback(
    (update: (m: Kernmodell) => Kernmodell, key?: string) => history.apply((m) => (m ? update(m) : m), key),
    [],
  );

  const showViewPanel = !editing && (panel.kind === 'issues' || (panel.kind === 'details' && hasSelection));
  const showEditPanel = editing && (panel.kind === 'issues' || panel.kind === 'model' || (panel.kind === 'details' && hasSelection));

  return (
    <div className={`app${editing ? ' is-editing' : ''}`}>
      <header className="toolbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          ERD Studio
        </div>

        <label className="field">
          <span className="sr-only">Modell</span>
          <select id="model-select" value={modelId ?? ''} onChange={(e) => switchModel(e.target.value)}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · v{m.version}
              </option>
            ))}
          </select>
        </label>

        <div className="segmented" role="group" aria-label="Modus">
          <button className={!editing ? 'is-on' : ''} aria-pressed={!editing} onClick={() => setMode('view')}>
            Ansicht
          </button>
          <button className={editing ? 'is-on' : ''} aria-pressed={editing} onClick={() => setMode('edit')} disabled={!model}>
            Bearbeiten
          </button>
        </div>

        {model && (
          <button
            className={`badge ${issues.length ? 'is-bad' : 'is-good'}`}
            onClick={() => setPanel({ kind: 'issues', title: modelDirty ? 'Prüfung (ungespeichert)' : 'Prüfergebnis', issues })}
            title="Prüfergebnis anzeigen"
          >
            {issues.length ? `${issues.length} Befunde` : 'Gültig'}
          </button>
        )}

        {editing ? (
          <>
            <button className="btn" onClick={addTable} disabled={!model}>
              + Tabelle
            </button>
            <button className={`btn${panel.kind === 'model' ? ' is-on' : ''}`} onClick={() => setPanel({ kind: 'model' })} disabled={!model}>
              Modell & Domänen
            </button>
            <div className="btn-group">
              <button className="btn icon" onClick={history.undo} disabled={!history.canUndo} title="Rückgängig (Strg+Z)" aria-label="Rückgängig">
                ↶
              </button>
              <button className="btn icon" onClick={history.redo} disabled={!history.canRedo} title="Wiederholen (Strg+Y)" aria-label="Wiederholen">
                ↷
              </button>
            </div>
          </>
        ) : (
          <label className="field search">
            <span className="sr-only">Tabellen und Spalten suchen</span>
            <input
              id="search"
              type="search"
              placeholder="Tabelle oder Spalte suchen"
              value={view.search}
              onChange={(e) => setView((v) => ({ ...v, search: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && focusHits()}
            />
            {view.search && <span className="search-count">{searchHits.length}</span>}
          </label>
        )}

        <div className="spacer" />

        <button className="btn" onClick={runAutoLayout} disabled={!model}>
          Auto-Layout
        </button>
        {modelDirty && (
          <button className="btn" onClick={discard}>
            Verwerfen
          </button>
        )}
        <button className={`btn ${dirty ? 'is-primary' : ''}`} onClick={save} disabled={!model || !dirty || saving} title="Strg+S">
          {saving ? 'Speichert …' : dirty ? 'Speichern' : 'Gespeichert'}
        </button>

        <label className="field">
          <span className="sr-only">Exportieren</span>
          <select
            id="export-select"
            value=""
            onChange={(e) => {
              void onExport(e.target.value);
              e.target.value = '';
            }}
            disabled={!model}
          >
            <option value="">Export …</option>
            {formats.map((f) => (
              <option key={f.format} value={f.format}>
                {f.label}
              </option>
            ))}
            <option value="json">Kernmodell (JSON)</option>
          </select>
        </label>

        <div className="btn-group">
          <button className="btn" onClick={() => fileInput.current?.click()}>
            Importieren
          </button>
          <button className="btn" onClick={createModel} title="Leeres Modell anlegen">
            Neu
          </button>
        </div>
        <input ref={fileInput} id="import-file" type="file" accept=".json,application/json" hidden onChange={onImportFile} />
      </header>

      {model && (
        <div className="legend" role="group" aria-label="Domänen ein- und ausblenden">
          {(model.domains ?? []).map((d, i) => {
            const count = model.entities.filter((e) => e.domainId === d.id).length;
            const off = view.hiddenDomains.has(d.id);
            return (
              <button
                key={d.id}
                className={`legend-chip domain-${i % 6} ${off ? 'is-off' : ''}`}
                onClick={() => toggleDomain(d.id)}
                aria-pressed={!off}
              >
                <span className="legend-dot" />
                {d.name}
                <span className="legend-count">{count}</span>
              </button>
            );
          })}
          <span className="legend-meta">
            {editing && <span className="edit-hint">Spaltenpunkt auf Spalte ziehen = Beziehung · Entf = löschen · </span>}
            {model.entities.length} Tabellen · {(model.relationships ?? []).length} Beziehungen
            {model.model.targetPlatform ? ` · ${model.model.targetPlatform}` : ''}
            {modelDirty && <span className="unsaved"> · ungespeichert</span>}
          </span>
        </div>
      )}

      {conflict && (
        <div className="notice" role="alert">
          Ein Modell mit dieser ID existiert bereits.
          <button className="btn is-primary" onClick={() => importModel(conflict.json, true)}>
            Ersetzen
          </button>
          <button className="btn" onClick={() => setConflict(undefined)}>
            Abbrechen
          </button>
        </div>
      )}

      {pendingSwitch && (
        <div className="notice" role="alert">
          Es gibt ungespeicherte Änderungen.
          <button
            className="btn is-primary"
            onClick={async () => {
              await save();
              setModelId(pendingSwitch);
              setPendingSwitch(undefined);
            }}
          >
            Speichern und wechseln
          </button>
          <button
            className="btn"
            onClick={() => {
              setLayoutDirty(false);
              setModelId(pendingSwitch);
              setPendingSwitch(undefined);
            }}
          >
            Verwerfen und wechseln
          </button>
          <button className="btn" onClick={() => setPendingSwitch(undefined)}>
            Abbrechen
          </button>
        </div>
      )}

      <main className="workspace">
        <div className="canvas" ref={canvasRef}>
          <Markers />
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, n) => selectEntity(n.id, !editing)}
            onEdgeClick={(_, e) => selectRelationship(e.id)}
            onPaneClick={clearSelection}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            onDelete={onDelete}
            deleteKeyCode={editing ? ['Delete', 'Backspace'] : null}
            nodesConnectable={editing}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={28}
            connectionLineStyle={{ stroke: 'var(--accent)', strokeWidth: 2 }}
            elementsSelectable
            minZoom={0.15}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeClassName={(n) => `domain-${(n.data as { colorIndex: number }).colorIndex}`} />
          </ReactFlow>
          {model && model.entities.length === 0 && (
            <div className="empty">
              <p>Das Modell ist noch leer.</p>
              {editing ? (
                <button className="btn is-primary" onClick={addTable}>
                  Erste Tabelle anlegen
                </button>
              ) : (
                <button className="btn is-primary" onClick={() => setMode('edit')}>
                  Bearbeiten
                </button>
              )}
            </div>
          )}
          {!model && <div className="empty">Kein Modell geladen. Über „Importieren“ oder „Neu“ beginnen.</div>}
        </div>

        {model && showViewPanel && (
          <DetailPanel
            model={model}
            entityId={view.selectedEntityId}
            relationshipId={view.selectedRelationshipId}
            issues={panel.kind === 'issues' ? panel.issues : undefined}
            issuesTitle={panel.kind === 'issues' ? panel.title : undefined}
            onSelectEntity={selectEntity}
            onSelectRelationship={selectRelationship}
            onClose={() => {
              setPanel({ kind: 'none' });
              clearSelection();
            }}
          />
        )}

        {model && showEditPanel && (
          panel.kind === 'issues' ? (
            <DetailPanel
              model={model}
              issues={panel.issues}
              issuesTitle={panel.title}
              onSelectEntity={selectEntity}
              onSelectRelationship={selectRelationship}
              onClose={() => setPanel({ kind: 'none' })}
            />
          ) : (
            <aside className="panel is-editor" aria-label="Editor">
              <button
                className="panel-close"
                onClick={() => {
                  setPanel({ kind: 'none' });
                  clearSelection();
                }}
                aria-label="Editor schließen"
              >
                ×
              </button>
              {panel.kind === 'model' && <ModelEditor model={model} apply={applyModel} />}
              {panel.kind === 'details' && selectedEntity && (
                <EntityEditor
                  key={selectedEntity.id}
                  model={model}
                  entity={selectedEntity}
                  apply={applyModel}
                  onDeleted={clearSelection}
                  onSelectRelationship={selectRelationship}
                />
              )}
              {panel.kind === 'details' && selectedRel && (
                <RelationshipEditor
                  key={selectedRel.id}
                  model={model}
                  rel={selectedRel}
                  apply={applyModel}
                  onDeleted={clearSelection}
                  onSelectEntity={(id) => selectEntity(id)}
                />
              )}
            </aside>
          )
        )}
      </main>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Studio />
    </ReactFlowProvider>
  );
}
