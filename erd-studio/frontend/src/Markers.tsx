/**
 * Krähenfuß-Notation. Die Marker zeichnen am Linienende zur Tabelle hin;
 * orient="auto-start-reverse" spiegelt sie automatisch für den Linienanfang.
 *   1     ||     genau eins
 *   0..1  o|     null oder eins
 *   0..n  o<     null bis viele
 *   1..n  |<     eins bis viele
 */
function MarkerSet({ suffix, colorVar }: { suffix: string; colorVar: string }) {
  const stroke = { stroke: `var(${colorVar})`, strokeWidth: 1.5, fill: 'none' } as const;
  const circle = { stroke: `var(${colorVar})`, strokeWidth: 1.5, fill: 'var(--canvas)' } as const;
  const common = {
    viewBox: '0 0 22 20',
    markerWidth: 22,
    markerHeight: 20,
    refX: 22,
    refY: 10,
    markerUnits: 'userSpaceOnUse' as const,
    orient: 'auto-start-reverse',
  };
  const crow = 'M10 10 L22 3 M10 10 L22 10 M10 10 L22 17';
  return (
    <>
      <marker id={`card-1${suffix}`} {...common}>
        <path d="M0 10 H22 M13 4 V16 M17 4 V16" style={stroke} />
      </marker>
      <marker id={`card-01${suffix}`} {...common}>
        <path d="M0 10 H22 M17 4 V16" style={stroke} />
        <circle cx="8" cy="10" r="3.6" style={circle} />
      </marker>
      <marker id={`card-0n${suffix}`} {...common}>
        <path d={`M0 10 H10 ${crow}`} style={stroke} />
        <circle cx="5" cy="10" r="3.6" style={circle} />
      </marker>
      <marker id={`card-1n${suffix}`} {...common}>
        <path d={`M0 10 H10 M6 4 V16 ${crow}`} style={stroke} />
      </marker>
    </>
  );
}

export default function Markers() {
  return (
    <svg className="marker-defs" aria-hidden="true">
      <defs>
        <MarkerSet suffix="" colorVar="--edge" />
        <MarkerSet suffix="-hl" colorVar="--accent" />
      </defs>
    </svg>
  );
}
