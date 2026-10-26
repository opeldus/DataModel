import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { sortedAttributes, typeLabel, type TableNode as TableNodeType } from './diagram';

const KeyIcon = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <circle cx="5" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8.2 8h6.3M12 8v2.6M14.3 8v1.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const LinkIcon = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <path
      d="M6.6 9.4l2.8-2.8M7.2 4.8l1-1a2.6 2.6 0 013.7 3.7l-1 1M8.8 11.2l-1 1a2.6 2.6 0 01-3.7-3.7l1-1"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

function TableNodeView({ data, selected }: NodeProps<TableNodeType>) {
  const { entity, pkIds, fkIds, activeAttrIds, colorIndex, dimmed, searchHit, domainName, editing } = data;
  const qualifier = entity.schema ? `${entity.schema}.` : '';

  return (
    <div
      className={[
        'table-node',
        `domain-${colorIndex}`,
        selected ? 'is-selected' : '',
        dimmed ? 'is-dimmed' : '',
        searchHit ? 'is-hit' : '',
        editing ? 'is-editing' : '',
      ].join(' ')}
      title={entity.description ?? entity.name}
    >
      <header className="table-head">
        <span className="table-title">
          <span className="table-schema">{qualifier}</span>
          {entity.physicalName ?? entity.name}
        </span>
        {domainName && <span className="table-domain">{domainName}</span>}
        {editing && (
          <>
            <Handle type="source" position={Position.Left} id="head-sL" className="head-handle" title="Auf andere Tabelle ziehen: FK-Spalten anlegen" />
            <Handle type="source" position={Position.Right} id="head-sR" className="head-handle" title="Auf andere Tabelle ziehen: FK-Spalten anlegen" />
          </>
        )}
      </header>
      <ul className="table-rows">
        {sortedAttributes(entity).map((a) => {
          const isPk = pkIds.has(a.id);
          const isFk = fkIds.has(a.id);
          return (
            <li key={a.id} className={`table-row${activeAttrIds.has(a.id) ? ' is-active' : ''}`} title={a.description ?? a.name}>
              <Handle type="target" position={Position.Left} id={`${a.id}-tL`} className="row-handle" isConnectable={editing} />
              <Handle type="source" position={Position.Left} id={`${a.id}-sL`} className="row-handle" isConnectable={editing} />
              <span className="row-key">
                {isPk && (
                  <span className="key pk" aria-label="Primärschlüssel">
                    <KeyIcon />
                  </span>
                )}
                {!isPk && isFk && (
                  <span className="key fk" aria-label="Fremdschlüssel">
                    <LinkIcon />
                  </span>
                )}
              </span>
              <span className={`row-name${isPk ? ' is-pk' : ''}`}>{a.physicalName ?? a.name}</span>
              <span className="row-type">
                {typeLabel(a.dataType)}
                {a.nullable === false && !isPk && <span className="row-nn"> nn</span>}
              </span>
              <Handle type="target" position={Position.Right} id={`${a.id}-tR`} className="row-handle" isConnectable={editing} />
              <Handle type="source" position={Position.Right} id={`${a.id}-sR`} className="row-handle" isConnectable={editing} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default memo(TableNodeView);
