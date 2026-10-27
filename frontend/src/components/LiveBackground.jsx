// Sound-wave lines behind every page: two slow layers drifting in opposite directions. Pure SVG, fixed, ignores
// clicks, hidden from assistive tech, and still when the visitor asks for reduced motion.
const W = 2400 // one tile; the SVG is twice as wide and translates by half, so the loop is seamless
const H = 1000

function path(y, amp, cycles, phase) {
  const pts = []
  for (let x = 0; x <= W; x += 20) {
    const t = (x / W) * Math.PI * 2 * cycles + phase
    pts.push(`${x},${(y + Math.sin(t) * amp + Math.sin(t * 2 + phase) * amp * 0.35).toFixed(1)}`)
  }
  return `M${pts.join(' L')}`
}

const INK = [
  [210, 38, 3, 0], [300, 52, 2, 1], [400, 30, 4, 2.2], [520, 60, 2, 0.6], [640, 40, 3, 3.1], [760, 56, 2, 1.7], [870, 34, 4, 4]
]
const COBALT = [[340, 70, 2, 0.4], [720, 64, 3, 2.6]]

function Layer({ lines, cls }) {
  return (
    <svg viewBox={`0 0 ${W * 2} ${H}`} preserveAspectRatio="none">
      {[0, 1].map((tile) => (
        <g key={tile} transform={`translate(${tile * W} 0)`}>
          {lines.map(([y, a, c, p]) => <path key={y} d={path(y, a, c, p)} className={`wave ${cls}`} />)}
        </g>
      ))}
    </svg>
  )
}

export default function LiveBackground() {
  return (
    <div className="live-bg" aria-hidden="true">
      <Layer lines={INK} cls="wave-ink" />
      <Layer lines={COBALT} cls="wave-cobalt" />
    </div>
  )
}
