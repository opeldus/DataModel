/* Oberfläche des Datenmodell-Editors. */
(function () {
  'use strict';
  const DM = window.DataModel;
  const STORAGE_KEY = 'datamodel-editor:model';
  const LAYOUT_KEY = 'datamodel-editor:layout';

  const state = {
    model: null,
    fileName: '',
    fileHandle: null,
    selected: null, // null = Modell-Übersicht, sonst Entitätsname
    tab: 'editor',
    expanded: new Set(), // aufgeklappte Eigenschaften "Entität.feld"
    undo: [],
    redo: [],
    snapshot: '',
    filter: '',
    exampleEntity: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const view = $('#view');

  // ---------------------------------------------------------------------------
  // DOM-Helfer
  // ---------------------------------------------------------------------------

  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k === 'class') node.className = v;
      else if (k === 'value') node.value = v;
      else if (k === 'checked') node.checked = !!v;
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return node;
  }

  function field(label, input, hint) {
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input,
      hint ? h('span', { class: 'hint' }, hint) : null);
  }

  /** Textfeld, das bei Eingabe live schreibt und beim Verlassen ein Undo-Schritt wird. */
  function text(key, value, onInput, attrs = {}) {
    const tag = attrs.multiline ? 'textarea' : 'input';
    const a = Object.assign({ 'data-key': key, value: value == null ? '' : value }, attrs);
    delete a.multiline;
    if (tag === 'input' && !a.type) a.type = 'text';
    return h(tag, Object.assign(a, {
      oninput: (e) => { onInput(e.target.value); softRefresh(); },
      onchange: () => commit(),
    }));
  }

  /** Feld, dessen Wert erst beim Verlassen übernommen wird (z. B. Namen). */
  function lazyText(key, value, onCommit, attrs = {}) {
    return h('input', Object.assign({ type: 'text', 'data-key': key, value }, attrs, {
      onchange: (e) => {
        try { onCommit(e.target.value.trim()); commit(); }
        catch (err) { toast(err.message, 'error'); e.target.value = value; }
      },
      onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = value; e.target.blur(); } },
    }));
  }

  function numberField(key, obj, prop, label) {
    return field(label, h('input', {
      type: 'number', step: 'any', 'data-key': key, value: obj[prop] ?? '',
      onchange: (e) => {
        const v = e.target.value;
        if (v === '') delete obj[prop]; else obj[prop] = Number(v);
        commit();
      },
    }));
  }

  function checkbox(key, checked, onChange, label, title) {
    return h('label', { class: 'check', title },
      h('input', { type: 'checkbox', 'data-key': key, checked, onchange: (e) => { onChange(e.target.checked); commit(); } }),
      label ? h('span', {}, label) : null);
  }

  function setOrDelete(obj, prop, value) {
    if (value === '' || value == null) delete obj[prop]; else obj[prop] = value;
  }

  function toast(msg, kind = 'info') {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast show ' + kind;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.className = 'toast'), 3200);
  }

  // ---------------------------------------------------------------------------
  // Zustand, Verlauf, Speicherung
  // ---------------------------------------------------------------------------

  function loadModel(model, fileName = '', handle = null) {
    state.model = DM.normalizeModel(model);
    state.fileName = fileName;
    state.fileHandle = handle;
    state.selected = Object.keys(state.model.$defs)[0] || null;
    state.expanded.clear();
    state.undo = []; state.redo = [];
    state.snapshot = JSON.stringify(state.model);
    persist();
    render();
  }

  /** Schließt eine Änderung ab: Verlaufsschritt anlegen, speichern, neu zeichnen. */
  function commit() {
    const snap = JSON.stringify(state.model);
    if (snap !== state.snapshot) {
      state.undo.push(state.snapshot);
      if (state.undo.length > 200) state.undo.shift();
      state.redo = [];
      state.snapshot = snap;
      persist();
    }
    scheduleRender();
  }

  function undo() {
    if (!state.undo.length) return;
    state.redo.push(state.snapshot);
    state.snapshot = state.undo.pop();
    state.model = JSON.parse(state.snapshot);
    fixSelection(); persist(); render();
  }

  function redo() {
    if (!state.redo.length) return;
    state.undo.push(state.snapshot);
    state.snapshot = state.redo.pop();
    state.model = JSON.parse(state.snapshot);
    fixSelection(); persist(); render();
  }

  function fixSelection() {
    if (state.selected && !state.model.$defs[state.selected]) state.selected = null;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ model: state.model, fileName: state.fileName }));
    } catch (e) { /* Speicher voll oder gesperrt – ignorieren */ }
  }

  function layoutPositions() {
    try { return (JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {})[state.model.$id || ''] || {}; }
    catch (e) { return {}; }
  }

  function saveLayoutPosition(name, x, y) {
    try {
      const all = JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {};
      const key = state.model.$id || '';
      all[key] = Object.assign(all[key] || {}, { [name]: { x, y } });
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(all));
    } catch (e) { /* ignorieren */ }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    // Verzögert, damit der Fokus beim Tabben schon auf dem nächsten Feld liegt.
    setTimeout(() => { renderQueued = false; render(); }, 0);
  }

  function render() {
    const active = document.activeElement;
    const focusKey = active && active.getAttribute && active.getAttribute('data-key');
    const selStart = active && 'selectionStart' in active ? safe(() => active.selectionStart) : null;
    const scroll = view.scrollTop;

    renderHeader();
    renderSidebar();
    renderView();
    renderIssues();

    view.scrollTop = scroll;
    if (focusKey) {
      const next = document.querySelector('[data-key="' + CSS.escape(focusKey) + '"]');
      if (next) {
        next.focus();
        if (selStart != null) safe(() => next.setSelectionRange(selStart, selStart));
      }
    }
  }

  function safe(fn) { try { return fn(); } catch (e) { return null; } }

  /** Leichte Aktualisierung während des Tippens (ohne Formular neu aufzubauen). */
  let softTimer = null;
  function softRefresh() {
    clearTimeout(softTimer);
    softTimer = setTimeout(() => {
      renderHeader(); renderSidebar(); renderIssues();
      persist();
    }, 150);
  }

  function renderHeader() {
    $('#fileName').textContent = state.fileName ? '— ' + state.fileName : '';
    $('#btnUndo').disabled = !state.undo.length;
    $('#btnRedo').disabled = !state.redo.length;
    document.title = (state.model.title || 'Datenmodell') + ' – Datenmodell-Editor';
    for (const b of document.querySelectorAll('.tabs [data-tab]')) {
      b.classList.toggle('active', b.dataset.tab === state.tab);
      b.setAttribute('aria-selected', b.dataset.tab === state.tab);
    }
  }

  function renderSidebar() {
    $('#navModelTitle').textContent = state.model.title || 'Modell';
    $('#navModel').classList.toggle('active', state.selected === null);
    const list = $('#entityList');
    list.innerHTML = '';
    const issues = DM.validateModel(state.model);
    const f = state.filter.toLowerCase();
    for (const [name, entity] of Object.entries(state.model.$defs)) {
      if (f && !name.toLowerCase().includes(f) && !(entity.title || '').toLowerCase().includes(f)) continue;
      const hasError = issues.some((i) => i.level === 'error' && (i.path === name || i.path.startsWith(name + '.')));
      const count = Object.keys(entity.properties || {}).length;
      list.appendChild(h('li', {},
        h('button', {
          class: 'nav-item' + (state.selected === name ? ' active' : ''),
          onclick: () => select(name),
          title: entity.description || name,
        },
        h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, '▤'),
        h('span', { class: 'nav-name' }, name),
        hasError ? h('span', { class: 'dot error', title: 'Fehler' }) : null,
        h('span', { class: 'count' }, count))));
    }
  }

  function select(name) {
    state.selected = name;
    if (state.tab !== 'editor' && state.tab !== 'diagram') state.tab = 'editor';
    if (name) state.exampleEntity = name;
    render();
  }

  function renderView() {
    view.innerHTML = '';
    view.dataset.tab = state.tab;
    if (state.tab === 'editor') {
      view.appendChild(state.selected ? entityEditor(state.selected) : modelEditor());
    } else if (state.tab === 'diagram') {
      view.appendChild(diagramView());
    } else if (state.tab === 'json') {
      view.appendChild(jsonView());
    } else if (state.tab === 'example') {
      view.appendChild(exampleView());
    }
  }

  // --- Modell-Übersicht -------------------------------------------------------

  function modelEditor() {
    const m = state.model;
    const names = Object.keys(m.$defs);
    const rootRef = DM.refTarget(m.$ref);
    return h('div', { class: 'panel' },
      h('h1', {}, 'Modell'),
      h('div', { class: 'grid2' },
        field('Titel', text('m.title', m.title, (v) => setOrDelete(m, 'title', v))),
        field('$id (URI)', text('m.id', m.$id, (v) => setOrDelete(m, '$id', v), { placeholder: 'https://example.org/schemas/modell.schema.json' }),
          'Eindeutige Kennung des Schemas.'),
      ),
      field('Beschreibung', text('m.description', m.description, (v) => (m.description = v), { multiline: true, rows: 3 })),
      h('div', { class: 'grid2' },
        field('Wurzel-Entität', h('select', {
          'data-key': 'm.root',
          onchange: (e) => {
            if (e.target.value) m.$ref = DM.refTo(e.target.value); else delete m.$ref;
            commit();
          },
        }, h('option', { value: '' }, '— keine (nur Definitionen) —'),
        names.map((n) => h('option', { value: n, selected: n === rootRef }, n))),
        'Optional: Dokumente werden dann gegen diese Entität validiert.'),
        field('Dialekt ($schema)', h('input', { type: 'text', value: m.$schema || '', readonly: true })),
      ),
      h('h2', {}, 'Entitäten (' + names.length + ')'),
      names.length ? h('div', { class: 'cards' }, names.map((n) => {
        const e = m.$defs[n];
        return h('button', { class: 'card', onclick: () => select(n) },
          h('strong', {}, n),
          e.title && e.title !== n ? h('span', { class: 'muted' }, ' – ' + e.title) : null,
          h('p', {}, e.description || h('em', { class: 'muted' }, 'Keine Beschreibung')),
          h('span', { class: 'muted small' }, Object.keys(e.properties || {}).length + ' Eigenschaften'));
      })) : h('p', { class: 'empty' }, 'Noch keine Entitäten. ', h('button', { class: 'link', onclick: addEntity }, 'Erste Entität anlegen')),
      h('h2', {}, 'Standards'),
      h('p', { class: 'muted' },
        'Das Modell wird als ', h('a', { href: 'https://json-schema.org/draft/2020-12', target: '_blank', rel: 'noopener' }, 'JSON Schema 2020-12'),
        ' gespeichert. Entitäten liegen unter „$defs“, Beziehungen sind „$ref“-Verweise. Export nach ',
        h('a', { href: 'https://spec.openapis.org/oas/v3.1.0', target: '_blank', rel: 'noopener' }, 'OpenAPI 3.1'),
        ' ist möglich; beim Öffnen werden auch ältere Drafts („definitions“) und OpenAPI-Dokumente übernommen.'),
    );
  }

  // --- Entitäts-Editor --------------------------------------------------------

  function entityEditor(name) {
    const m = state.model;
    const e = m.$defs[name];
    if (!e) return h('p', {}, 'Entität nicht gefunden.');
    const refs = DM.findReferences(m, name).filter((r) => !r.startsWith(name + '.'));
    const isObject = e.type === 'object' || e.properties;

    const head = h('div', { class: 'entity-head' },
      h('div', { class: 'grid2' },
        field('Name (technisch)', lazyText('e.name', name, (v) => {
          const newName = DM.renameEntity(m, name, v);
          renameExpanded(name, newName);
          state.selected = newName;
        }, { pattern: DM.NAME_PATTERN.source, spellcheck: false }), 'Schlüssel in $defs, z. B. „Kunde“.'),
        field('Titel', text('e.title', e.title, (v) => setOrDelete(e, 'title', v))),
      ),
      field('Beschreibung', text('e.description', e.description, (v) => (e.description = v), { multiline: true, rows: 2 })),
      h('div', { class: 'row' },
        isObject ? checkbox('e.additional', e.additionalProperties === false,
          (v) => { if (v) e.additionalProperties = false; else delete e.additionalProperties; },
          'Keine zusätzlichen Eigenschaften erlauben', 'additionalProperties: false') : null,
        checkbox('e.deprecated', e.deprecated === true, (v) => { if (v) e.deprecated = true; else delete e.deprecated; }, 'Veraltet'),
        h('span', { class: 'spacer' }),
        h('button', { onclick: () => { DM.moveEntity(m, name, -1); commit(); }, title: 'Nach oben' }, '↑'),
        h('button', { onclick: () => { DM.moveEntity(m, name, 1); commit(); }, title: 'Nach unten' }, '↓'),
        h('button', { onclick: () => { state.selected = DM.duplicateEntity(m, name); commit(); } }, 'Duplizieren'),
        h('button', { class: 'danger', onclick: () => removeEntity(name) }, 'Löschen'),
      ),
      refs.length ? h('p', { class: 'muted small' }, 'Verwendet in: ',
        refs.map((r, i) => [i ? ', ' : '', h('button', { class: 'link', onclick: () => select(r.split('.')[0]) }, r)])) : null,
    );

    if (!isObject) {
      return h('div', { class: 'panel' }, h('h1', {}, name), head,
        h('h2', {}, 'Schema'),
        h('p', { class: 'muted' }, 'Diese Definition ist kein Objekt-Typ. Sie kann direkt als JSON bearbeitet werden.'),
        rawSchemaEditor('e.raw', e, (v) => { m.$defs[name] = v; }));
    }

    const props = Object.entries(e.properties || {});
    const table = h('div', { class: 'props' },
      h('div', { class: 'prop-row prop-header' },
        h('span', {}, 'Name'), h('span', {}, 'Typ'), h('span', { title: 'Liste (array)' }, 'Liste'),
        h('span', { title: 'Pflichtfeld (required)' }, 'Pflicht'), h('span', {}, 'Beschreibung'), h('span', {})),
      props.map(([pname, ps], i) => propertyRow(name, e, pname, ps, i, props.length)),
    );

    return h('div', { class: 'panel' },
      h('h1', {}, e.title && e.title !== name ? [name, h('span', { class: 'muted' }, ' · ' + e.title)] : name),
      head,
      h('div', { class: 'section-head' },
        h('h2', {}, 'Eigenschaften (' + props.length + ')'),
        h('button', { class: 'primary small', onclick: () => {
          DM.addProperty(e, 'feld');
          const index = Object.keys(e.properties).length - 1;
          commit();
          setTimeout(() => { const i = document.querySelector('[data-key="p.' + index + '.name"]'); if (i) { i.focus(); i.select(); } }, 10);
        } }, '+ Eigenschaft')),
      props.length ? table : h('p', { class: 'empty' }, 'Noch keine Eigenschaften.'),
    );
  }

  function renameExpanded(oldEntity, newEntity) {
    for (const k of [...state.expanded]) {
      if (k.startsWith(oldEntity + '.')) { state.expanded.delete(k); state.expanded.add(newEntity + k.slice(oldEntity.length)); }
    }
  }

  async function removeEntity(name) {
    const refs = DM.findReferences(state.model, name).filter((r) => !r.startsWith(name + '.'));
    const msg = refs.length
      ? 'Entität „' + name + '“ wird noch verwendet in: ' + refs.join(', ') + '. Die Verweise werden dann ungültig.'
      : 'Entität „' + name + '“ wird mit allen Eigenschaften entfernt.';
    if (!(await ask('Entität löschen?', msg, 'Löschen', true))) return;
    const names = Object.keys(state.model.$defs);
    const idx = names.indexOf(name);
    DM.deleteEntity(state.model, name);
    const rest = Object.keys(state.model.$defs);
    state.selected = rest[Math.min(idx, rest.length - 1)] || null;
    commit();
  }

  function typeSelect(key, desc, onChange) {
    const names = Object.keys(state.model.$defs);
    const value = desc.kind === 'ref' ? 'ref:' + desc.ref : desc.kind === 'custom' ? 'custom' : desc.type;
    const labels = { string: 'Text (string)', integer: 'Ganzzahl (integer)', number: 'Zahl (number)', boolean: 'Wahrheitswert (boolean)', object: 'Objekt (frei)', any: 'Beliebig' };
    return h('select', { 'data-key': key, onchange: (e) => onChange(e.target.value) },
      h('optgroup', { label: 'Einfache Typen' },
        Object.entries(labels).map(([v, l]) => h('option', { value: v, selected: v === value }, l))),
      names.length ? h('optgroup', { label: 'Beziehung zu Entität' },
        names.map((n) => h('option', { value: 'ref:' + n, selected: value === 'ref:' + n }, '→ ' + n))) : null,
      desc.kind === 'custom' ? h('option', { value: 'custom', selected: true }, 'Komplex (JSON)') : null,
    );
  }

  function propertyRow(entityName, e, pname, ps, index, total) {
    const desc = DM.describeProperty(ps);
    // Schlüssel nach Position, damit der Fokus ein Umbenennen übersteht.
    const key = 'p.' + index;
    const expKey = entityName + '.' + pname;
    const open = state.expanded.has(expKey);
    const required = (e.required || []).includes(pname);

    const applyType = (patch) => {
      const next = Object.assign({ type: desc.type, ref: desc.ref, list: desc.list, nullable: desc.nullable }, patch);
      if (desc.kind === 'custom' && !patch.type && !patch.ref) return;
      e.properties[pname] = DM.setPropertyType(ps, next);
    };

    const row = h('div', { class: 'prop-row' + (open ? ' open' : '') },
      lazyText(key + '.name', pname, (v) => {
        DM.renameProperty(e, pname, v);
        if (state.expanded.delete(expKey)) state.expanded.add(entityName + '.' + v);
      }, { spellcheck: false, 'aria-label': 'Name' }),
      typeSelect(key + '.type', desc, (v) => {
        if (v === 'custom') return;
        if (v.startsWith('ref:')) applyType({ ref: v.slice(4), type: null });
        else applyType({ type: v, ref: null });
        commit();
      }),
      h('span', { class: 'center' }, desc.kind === 'custom' ? '–' :
        checkbox(key + '.list', desc.list, (v) => applyType({ list: v }), 'Liste', 'Liste (array)')),
      h('span', { class: 'center' }, checkbox(key + '.req', required, (v) => DM.setRequired(e, pname, v), 'Pflicht', 'Pflichtfeld')),
      text(key + '.desc', ps.description, (v) => setOrDelete(e.properties[pname], 'description', v), { placeholder: 'Beschreibung', 'aria-label': 'Beschreibung' }),
      h('span', { class: 'row-actions' },
        h('button', { class: 'icon' + (open ? ' active' : ''), title: 'Details', 'aria-expanded': open,
          onclick: () => { if (open) state.expanded.delete(expKey); else state.expanded.add(expKey); render(); } }, '⚙'),
        h('button', { class: 'icon', title: 'Nach oben', disabled: index === 0, onclick: () => { DM.moveProperty(e, pname, -1); commit(); } }, '↑'),
        h('button', { class: 'icon', title: 'Nach unten', disabled: index === total - 1, onclick: () => { DM.moveProperty(e, pname, 1); commit(); } }, '↓'),
        h('button', { class: 'icon danger', title: 'Löschen', onclick: () => { DM.deleteProperty(e, pname); state.expanded.delete(expKey); commit(); } }, '✕'),
      ),
    );
    return open ? h('div', { class: 'prop-group' }, row, propertyDetails(entityName, e, pname, ps, desc, applyType, index)) : row;
  }

  function propertyDetails(entityName, e, pname, ps, desc, applyType, index) {
    const key = 'p.' + index + '.d.';
    const vs = desc.list ? (ps.items = ps.items || {}) : ps;
    const parts = [];

    const flags = h('div', { class: 'row' },
      desc.kind !== 'custom' ? checkbox(key + 'nullable', desc.nullable, (v) => applyType({ nullable: v }), 'Darf null sein') : null,
      checkbox(key + 'readOnly', ps.readOnly === true, (v) => { if (v) ps.readOnly = true; else delete ps.readOnly; }, 'Nur lesen'),
      checkbox(key + 'writeOnly', ps.writeOnly === true, (v) => { if (v) ps.writeOnly = true; else delete ps.writeOnly; }, 'Nur schreiben'),
      checkbox(key + 'deprecated', ps.deprecated === true, (v) => { if (v) ps.deprecated = true; else delete ps.deprecated; }, 'Veraltet'),
    );
    parts.push(flags);

    if (desc.kind === 'primitive' && desc.type === 'string') {
      parts.push(h('div', { class: 'grid4' },
        field('Format', h('select', { 'data-key': key + 'format', onchange: (ev) => { setOrDelete(vs, 'format', ev.target.value); commit(); } },
          h('option', { value: '' }, '— keines —'),
          DM.STRING_FORMATS.map((f) => h('option', { value: f, selected: vs.format === f }, f)),
          vs.format && !DM.STRING_FORMATS.includes(vs.format) ? h('option', { value: vs.format, selected: true }, vs.format) : null)),
        numberField(key + 'minLength', vs, 'minLength', 'Min. Länge'),
        numberField(key + 'maxLength', vs, 'maxLength', 'Max. Länge'),
        field('Muster (Regex)', text(key + 'pattern', vs.pattern, (v) => setOrDelete(vs, 'pattern', v), { placeholder: '^[A-Z]{2}$', spellcheck: false })),
      ));
    }
    if (desc.kind === 'primitive' && (desc.type === 'integer' || desc.type === 'number')) {
      parts.push(h('div', { class: 'grid4' },
        numberField(key + 'minimum', vs, 'minimum', 'Minimum'),
        numberField(key + 'maximum', vs, 'maximum', 'Maximum'),
        numberField(key + 'exclusiveMinimum', vs, 'exclusiveMinimum', 'Exkl. Minimum'),
        numberField(key + 'multipleOf', vs, 'multipleOf', 'Vielfaches von'),
      ));
    }
    if (desc.list) {
      parts.push(h('div', { class: 'grid4' },
        numberField(key + 'minItems', ps, 'minItems', 'Min. Einträge'),
        numberField(key + 'maxItems', ps, 'maxItems', 'Max. Einträge'),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, ' '),
          checkbox(key + 'unique', ps.uniqueItems === true, (v) => { if (v) ps.uniqueItems = true; else delete ps.uniqueItems; }, 'Einträge eindeutig')),
      ));
    }
    if (desc.kind === 'primitive' && ['string', 'integer', 'number'].includes(desc.type)) {
      parts.push(h('div', { class: 'grid2' },
        field('Erlaubte Werte (enum)', valueList(key + 'enum', vs, 'enum', desc.type), 'Ein Wert pro Zeile. Leer = keine Einschränkung.'),
        field('Standardwert (default)', h('input', {
          type: 'text', 'data-key': key + 'default', value: vs.default === undefined ? '' : String(vs.default),
          onchange: (ev) => { const v = parseScalar(ev.target.value, desc.type); if (v === undefined) delete vs.default; else vs.default = v; commit(); },
        })),
      ));
    }
    if (desc.kind === 'primitive' && desc.type === 'boolean') {
      parts.push(field('Standardwert (default)', h('select', {
        'data-key': key + 'default',
        onchange: (ev) => { const v = ev.target.value; if (v === '') delete vs.default; else vs.default = v === 'true'; commit(); },
      }, h('option', { value: '' }, '—'), h('option', { value: 'true', selected: vs.default === true }, 'true'),
      h('option', { value: 'false', selected: vs.default === false }, 'false'))));
    }
    parts.push(h('details', { class: 'raw', open: desc.kind === 'custom' || undefined },
      h('summary', {}, 'Schema dieser Eigenschaft als JSON'),
      rawSchemaEditor(key + 'raw', ps, (v) => { e.properties[pname] = v; })));
    return h('div', { class: 'prop-details' }, parts);
  }

  function valueList(key, obj, prop, type) {
    return h('textarea', {
      'data-key': key, rows: 3, spellcheck: false,
      value: Array.isArray(obj[prop]) ? obj[prop].map(String).join('\n') : '',
      onchange: (ev) => {
        const values = ev.target.value.split('\n').map((s) => s.trim()).filter(Boolean).map((s) => parseScalar(s, type));
        if (values.length) obj[prop] = values; else delete obj[prop];
        commit();
      },
    });
  }

  function parseScalar(s, type) {
    s = String(s).trim();
    if (s === '') return undefined;
    if (type === 'integer' || type === 'number') {
      const n = Number(s.replace(',', '.'));
      return Number.isFinite(n) ? n : s;
    }
    return s;
  }

  function rawSchemaEditor(key, value, apply) {
    const ta = h('textarea', { 'data-key': key, class: 'code', rows: 8, spellcheck: false, value: JSON.stringify(value, null, 2) });
    const err = h('span', { class: 'error-text' });
    return h('div', { class: 'raw-editor' }, ta,
      h('div', { class: 'row' },
        h('button', { class: 'small', onclick: () => {
          try {
            const v = JSON.parse(ta.value);
            if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Ein Schema muss ein JSON-Objekt sein.');
            apply(v); commit(); toast('Schema übernommen');
          } catch (ex) { err.textContent = ex.message; }
        } }, 'Übernehmen'), err));
  }

  // --- Diagramm ---------------------------------------------------------------

  function diagramView() {
    const wrap = h('div', { class: 'diagram-wrap' });
    window.Diagram.render(wrap, state.model, {
      positions: layoutPositions(),
      selected: state.selected,
      onMove: saveLayoutPosition,
      onSelect: (name) => { state.selected = name; state.tab = 'editor'; render(); },
    });
    return h('div', { class: 'panel wide' },
      h('div', { class: 'section-head' },
        h('h1', {}, 'Diagramm'),
        h('span', { class: 'muted small' }, 'Kästen ziehen zum Anordnen · Klick öffnet die Entität · ● = Pflichtfeld'),
        h('button', { class: 'small', onclick: () => {
          try { const all = JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; delete all[state.model.$id || '']; localStorage.setItem(LAYOUT_KEY, JSON.stringify(all)); } catch (e) { /* ignorieren */ }
          render();
        } }, 'Anordnung zurücksetzen')),
      wrap);
  }

  // --- JSON -------------------------------------------------------------------

  function jsonView() {
    const ta = h('textarea', { class: 'code json-full', spellcheck: false, 'data-key': 'json.full', value: JSON.stringify(state.model, null, 2) });
    const err = h('span', { class: 'error-text' });
    return h('div', { class: 'panel wide' },
      h('div', { class: 'section-head' },
        h('h1', {}, 'JSON Schema'),
        h('span', { class: 'spacer' }),
        h('button', { onclick: () => copyText(ta.value, ta) }, 'Kopieren'),
        h('button', { class: 'primary', onclick: () => {
          try {
            state.model = DM.normalizeModel(JSON.parse(ta.value));
            fixSelection(); commit(); toast('JSON übernommen');
          } catch (ex) { err.textContent = ex.message; }
        } }, 'Übernehmen')),
      h('p', { class: 'muted small' }, 'Direkte Bearbeitung des gespeicherten Dokuments. Änderungen werden mit „Übernehmen“ in den Editor geladen.'),
      err, ta);
  }

  // --- Beispieldaten ----------------------------------------------------------

  function exampleView() {
    const names = Object.keys(state.model.$defs);
    if (!names.length) return h('div', { class: 'panel' }, h('p', { class: 'empty' }, 'Keine Entitäten vorhanden.'));
    if (!names.includes(state.exampleEntity)) state.exampleEntity = state.selected && names.includes(state.selected) ? state.selected : names[0];
    const sample = DM.generateExample(state.model, state.exampleEntity, 2);
    const json = JSON.stringify(sample, null, 2);
    return h('div', { class: 'panel wide' },
      h('div', { class: 'section-head' },
        h('h1', {}, 'Beispieldaten'),
        h('select', { onchange: (e) => { state.exampleEntity = e.target.value; render(); } },
          names.map((n) => h('option', { value: n, selected: n === state.exampleEntity }, n))),
        h('span', { class: 'spacer' }),
        h('button', { onclick: () => copyText(json) }, 'Kopieren')),
      h('p', { class: 'muted small' }, 'Automatisch aus dem Schema erzeugt (Standardwerte, Beispiele, Aufzählungen und Formate werden berücksichtigt).'),
      h('pre', { class: 'code' }, json));
  }

  // --- Prüfung ----------------------------------------------------------------

  function renderIssues() {
    const issues = DM.validateModel(state.model);
    const errors = issues.filter((i) => i.level === 'error').length;
    const badge = $('#issueCount');
    badge.textContent = issues.length;
    badge.className = 'badge' + (errors ? ' error' : issues.length ? ' warn' : ' ok');
    const list = $('#issueList');
    list.innerHTML = '';
    if (!issues.length) { list.appendChild(h('li', { class: 'ok' }, '✓ Keine Probleme gefunden.')); return; }
    const icon = { error: '✕', warn: '!', info: 'i' };
    for (const i of issues) {
      const entity = i.path.split('.')[0];
      list.appendChild(h('li', { class: i.level },
        h('span', { class: 'issue-icon' }, icon[i.level]),
        h('div', {},
          i.path ? h('button', { class: 'link', onclick: () => {
            const [ent, prop] = i.path.split('.');
            if (prop) state.expanded.add(ent + '.' + prop);
            select(entity);
          } }, i.path) : null,
          h('div', {}, i.message))));
    }
  }

  // ---------------------------------------------------------------------------
  // Aktionen
  // ---------------------------------------------------------------------------

  function addEntity() {
    const name = DM.addEntity(state.model, 'NeueEntitaet');
    state.selected = name;
    state.tab = 'editor';
    commit();
    setTimeout(() => { const i = document.querySelector('[data-key="e.name"]'); if (i) { i.focus(); i.select(); } }, 10);
  }

  /** Bietet ein Dokument zum Kopieren oder Herunterladen an. */
  function download(name, data) {
    const content = JSON.stringify(data, null, 2) + '\n';
    const dlg = $('#exportDialog');
    $('#exportName').textContent = name;
    const ta = $('#exportText');
    ta.value = content;
    ta.scrollTop = 0;
    $('#exportCopy').onclick = () => copyText(content, ta);
    $('#exportDownload').onclick = () => {
      const blob = new Blob([content], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    dlg.showModal();
    ta.scrollTop = 0;
  }

  function copyText(value, fallbackField) {
    const done = () => toast('In Zwischenablage kopiert');
    const fallback = () => {
      if (fallbackField) { fallbackField.focus(); fallbackField.select(); }
      toast('Text ist markiert – bitte manuell kopieren.');
    };
    try { navigator.clipboard.writeText(value).then(done, fallback); } catch (e) { fallback(); }
  }

  /** Bestätigungsdialog innerhalb der Seite (statt window.confirm). */
  function ask(title, message, okLabel = 'OK', danger = false) {
    const dlg = $('#askDialog');
    $('#askTitle').textContent = title;
    $('#askText').textContent = message;
    const ok = $('#askOk');
    ok.textContent = okLabel;
    ok.className = danger ? 'primary danger-fill' : 'primary';
    return new Promise((resolve) => {
      dlg.onclose = () => resolve(dlg.returnValue === 'ok');
      dlg.returnValue = '';
      dlg.showModal();
    });
  }

  function baseName() {
    return (state.fileName || DM.slug(state.model.title) + '.schema.json').replace(/(\.schema)?\.json$/i, '');
  }

  async function save() {
    const data = DM.toJSONSchema(state.model);
    const content = JSON.stringify(data, null, 2) + '\n';
    if (window.showSaveFilePicker) {
      try {
        if (!state.fileHandle) {
          state.fileHandle = await window.showSaveFilePicker({
            suggestedName: baseName() + '.schema.json',
            types: [{ description: 'JSON Schema', accept: { 'application/schema+json': ['.json'] } }],
          });
        }
        const w = await state.fileHandle.createWritable();
        await w.write(content); await w.close();
        state.fileName = state.fileHandle.name;
        persist(); renderHeader(); toast('Gespeichert: ' + state.fileName);
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
        state.fileHandle = null;
      }
    }
    download(baseName() + '.schema.json', data);
  }

  async function open() {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({ types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
        const file = await handle.getFile();
        readFile(file, handle);
        return;
      } catch (e) { if (e.name === 'AbortError') return; }
    }
    $('#fileInput').click();
  }

  function readFile(file, handle = null) {
    file.text().then((txt) => {
      try {
        const doc = JSON.parse(txt);
        const isOpenApi = !!doc.openapi;
        loadModel(doc, isOpenApi ? '' : file.name, isOpenApi ? null : handle);
        toast((isOpenApi ? 'OpenAPI importiert: ' : 'Geöffnet: ') + file.name);
      } catch (e) { toast('Datei konnte nicht gelesen werden: ' + e.message, 'error'); }
    });
  }

  async function confirmDiscard() {
    return !state.undo.length ||
      ask('Änderungen verwerfen?', 'Das aktuelle Modell wird ersetzt. Speichere es vorher, wenn du es behalten möchtest.', 'Verwerfen', true);
  }

  async function loadSample(skipConfirm) {
    if (skipConfirm !== true && !(await confirmDiscard())) return false;
    let doc;
    try {
      const res = await fetch('examples/bibliothek.schema.json');
      doc = await res.json();
    } catch (e) {
      if (skipConfirm !== true) toast('Beispiel konnte nicht geladen werden (Seite über einen Webserver öffnen).', 'error');
      return false;
    }
    loadModel(doc, '');
    toast('Beispielmodell geladen');
    return true;
  }

  function exportAs(kind) {
    const base = baseName();
    if (kind === 'schema') download(base + '.schema.json', DM.toJSONSchema(state.model));
    if (kind === 'openapi') download(base + '.openapi.json', DM.toOpenAPI(DM.toJSONSchema(state.model)));
    if (kind === 'example') {
      const name = state.selected || Object.keys(state.model.$defs)[0];
      if (!name) return toast('Keine Entität vorhanden', 'error');
      download(base + '.' + name + '.example.json', DM.generateExample(state.model, name, 2));
    }
  }

  // ---------------------------------------------------------------------------
  // Ereignisse
  // ---------------------------------------------------------------------------

  function bind() {
    $('#btnNew').onclick = async () => { if (await confirmDiscard()) loadModel(DM.createModel()); };
    $('#btnOpen').onclick = open;
    $('#btnSave').onclick = save;
    $('#btnUndo').onclick = undo;
    $('#btnRedo').onclick = redo;
    $('#btnSample').onclick = () => loadSample();
    $('#btnAddEntity').onclick = addEntity;
    $('#navModel').onclick = () => select(null);
    $('#entityFilter').oninput = (e) => { state.filter = e.target.value; renderSidebar(); };
    $('#fileInput').onchange = (e) => { if (e.target.files[0]) readFile(e.target.files[0]); e.target.value = ''; };

    const menu = $('#exportMenu'), menuBtn = $('#btnExport');
    menuBtn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; menuBtn.setAttribute('aria-expanded', !menu.hidden); };
    menu.onclick = (e) => { const k = e.target.dataset.export; if (k) { exportAs(k); menu.hidden = true; } };
    document.addEventListener('click', () => { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); });

    for (const b of document.querySelectorAll('.tabs [data-tab]')) {
      b.onclick = () => { state.tab = b.dataset.tab; render(); };
    }

    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (k === 's') { e.preventDefault(); if (inField) document.activeElement.blur(); setTimeout(save, 0); }
      else if (k === 'o') { e.preventDefault(); open(); }
      else if (k === 'z' && !inField) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (k === 'y' && !inField) { e.preventDefault(); redo(); }
    });

    // Dateien per Drag & Drop öffnen.
    document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
    document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
    document.addEventListener('drop', (e) => {
      e.preventDefault(); document.body.classList.remove('dragging');
      const f = e.dataTransfer.files[0];
      if (f) confirmDiscard().then((ok) => ok && readFile(f));
    });
  }

  function init() {
    bind();
    let restored = null;
    try { restored = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { /* ignorieren */ }
    if (restored && restored.model) {
      try { loadModel(restored.model, restored.fileName || ''); return; } catch (e) { /* neu anfangen */ }
    }
    // Erster Start: mit dem Beispielmodell beginnen, damit man gleich etwas sieht.
    loadModel(DM.createModel());
    loadSample(true);
  }

  init();
})();
