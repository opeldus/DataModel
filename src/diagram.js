/*
 * Einfaches Entitäten-Diagramm als SVG. Positionen lassen sich per Ziehen ändern
 * und werden nur lokal (localStorage) gemerkt, damit das Modell standardkonform bleibt.
 */
(function (root) {
  'use strict';
  const DM = root.DataModel;
  const NS = 'http://www.w3.org/2000/svg';
  const BOX_W = 250, HEAD_H = 30, ROW_H = 20, GAP_X = 70, GAP_Y = 50;

  function el(name, attrs, text) {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  }

  function typeLabel(schema) {
    const d = DM.describeProperty(schema);
    let t = d.kind === 'ref' ? d.ref : d.kind === 'custom' ? 'komplex' : d.type;
    const inner = d.list ? schema.items || {} : schema;
    if (d.kind === 'primitive' && inner.format) t += ' (' + inner.format + ')';
    if (d.list) t += '[]';
    if (d.nullable) t += '?';
    return t;
  }

  /**
   * Zeichnet das Diagramm in container.
   * opts: { positions, onMove(name, x, y), onSelect(name), selected }
   */
  function render(container, model, opts) {
    container.innerHTML = '';
    const defs = model.$defs || {};
    const names = Object.keys(defs);
    if (!names.length) {
      container.innerHTML = '<p class="empty">Noch keine Entitäten – lege links eine an.</p>';
      return;
    }
    const pos = opts.positions || {};
    const cols = Math.max(1, Math.ceil(Math.sqrt(names.length)));
    const boxes = {};
    let rowY = 20, col = 0, rowMax = 0;
    for (const name of names) {
      const props = Object.keys(defs[name].properties || {});
      const h = HEAD_H + Math.max(1, props.length) * ROW_H + 8;
      if (pos[name]) {
        boxes[name] = { x: pos[name].x, y: pos[name].y, w: BOX_W, h };
      } else {
        boxes[name] = { x: 20 + col * (BOX_W + GAP_X), y: rowY, w: BOX_W, h };
      }
      rowMax = Math.max(rowMax, h);
      if (++col >= cols) { col = 0; rowY += rowMax + GAP_Y; rowMax = 0; }
    }
    const width = Math.max(...Object.values(boxes).map((b) => b.x + b.w)) + 40;
    const height = Math.max(...Object.values(boxes).map((b) => b.y + b.h)) + 40;
    const svg = el('svg', { width, height, class: 'diagram', role: 'img', 'aria-label': 'Entitäten-Diagramm' });
    const marker = el('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 10, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse' });
    marker.appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'arrow-head' }));
    const defsEl = el('defs'); defsEl.appendChild(marker); svg.appendChild(defsEl);

    const edgeLayer = el('g'), boxLayer = el('g');
    svg.appendChild(edgeLayer); svg.appendChild(boxLayer);

    function drawEdges() {
      edgeLayer.innerHTML = '';
      for (const name of names) {
        const props = Object.entries(defs[name].properties || {});
        props.forEach(([pname, ps], i) => {
          for (const ref of DM.collectRefs(ps)) {
            const target = DM.refTarget(ref);
            if (!target || !boxes[target]) continue;
            const a = boxes[name], b = boxes[target];
            const y1 = a.y + HEAD_H + i * ROW_H + ROW_H / 2;
            const rightward = b.x + b.w / 2 >= a.x + a.w / 2;
            const x1 = rightward ? a.x + a.w : a.x;
            let x2, y2 = b.y + HEAD_H / 2;
            if (target === name) {
              const d = `M ${a.x + a.w} ${y1} C ${a.x + a.w + 50} ${y1}, ${a.x + a.w + 50} ${y2}, ${a.x + a.w} ${y2}`;
              edgeLayer.appendChild(el('path', { d, class: 'edge', 'marker-end': 'url(#arrow)' }));
              continue;
            }
            x2 = rightward ? b.x : b.x + b.w;
            if (Math.abs(x1 - x2) < 30) x2 = rightward ? b.x + b.w : b.x;
            const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (rightward ? 1 : -1);
            const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
            const path = el('path', { d, class: 'edge', 'marker-end': 'url(#arrow)' });
            path.appendChild(el('title', {}, name + '.' + pname + ' → ' + target));
            edgeLayer.appendChild(path);
          }
        });
      }
    }

    for (const name of names) {
      const entity = defs[name], b = boxes[name];
      const g = el('g', { class: 'box' + (opts.selected === name ? ' selected' : ''), transform: `translate(${b.x},${b.y})`, tabindex: 0 });
      g.appendChild(el('rect', { width: b.w, height: b.h, rx: 6, class: 'box-body' }));
      g.appendChild(el('rect', { width: b.w, height: HEAD_H, rx: 6, class: 'box-head' }));
      g.appendChild(el('rect', { y: HEAD_H - 6, width: b.w, height: 6, class: 'box-head' }));
      g.appendChild(el('text', { x: 10, y: 20, class: 'box-title' }, name));
      const required = new Set(entity.required || []);
      const props = Object.entries(entity.properties || {});
      if (!props.length) g.appendChild(el('text', { x: 10, y: HEAD_H + 15, class: 'box-empty' }, 'keine Eigenschaften'));
      props.forEach(([pname, ps], i) => {
        const y = HEAD_H + i * ROW_H + 15;
        g.appendChild(el('text', { x: 10, y, class: 'box-prop' + (required.has(pname) ? ' req' : '') },
          (required.has(pname) ? '● ' : '○ ') + pname));
        g.appendChild(el('text', { x: b.w - 10, y, class: 'box-type', 'text-anchor': 'end' }, clip(typeLabel(ps), Math.max(6, Math.floor((b.w - 30) / 6.8) - pname.length - 2))));
      });
      if (entity.description) g.appendChild(el('title', {}, entity.description));
      makeDraggable(g, b, name);
      boxLayer.appendChild(g);
    }
    drawEdges();
    container.appendChild(svg);

    function makeDraggable(g, b, name) {
      let start = null, moved = false;
      g.addEventListener('pointerdown', (e) => {
        start = { px: e.clientX, py: e.clientY, x: b.x, y: b.y }; moved = false;
        g.setPointerCapture(e.pointerId);
      });
      g.addEventListener('pointermove', (e) => {
        if (!start) return;
        const dx = e.clientX - start.px, dy = e.clientY - start.py;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        b.x = Math.max(0, start.x + dx); b.y = Math.max(0, start.y + dy);
        g.setAttribute('transform', `translate(${b.x},${b.y})`);
        svg.setAttribute('width', Math.max(+svg.getAttribute('width'), b.x + b.w + 40));
        svg.setAttribute('height', Math.max(+svg.getAttribute('height'), b.y + b.h + 40));
        drawEdges();
      });
      g.addEventListener('pointerup', () => {
        if (start && moved && opts.onMove) opts.onMove(name, Math.round(b.x), Math.round(b.y));
        if (start && !moved && opts.onSelect) opts.onSelect(name);
        start = null;
      });
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' && opts.onSelect) opts.onSelect(name); });
    }
  }

  function clip(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  root.Diagram = { render, typeLabel };
})(self);
