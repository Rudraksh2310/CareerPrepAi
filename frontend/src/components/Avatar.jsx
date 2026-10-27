import { useEffect, useId, useRef } from 'react'

// The AI interviewer ("Aria"): an animated vector figure.
//
// Lip-sync: `levelRef.current = { open, wide }` is written every frame by lib/tts.js from the audio that is
// actually playing (open = loudness -> jaw, wide = spectral balance -> rounded "oo" vs wide "ee"). This
// component reads it inside its own requestAnimationFrame loop and rewrites the mouth path directly on the
// SVG, so there are no React re-renders at 60fps.
//
// Everything else is "alive" behaviour layered on top: blinking, eye saccades, breathing, a head that sways
// while speaking, nods while listening, and a glance up when thinking.
//
// Swapping in a photoreal avatar API (Simli / Tavus / D-ID) only means replacing this component with one
// that renders their video stream; the call page only passes `state` and `levelRef`.

import { DEFAULT_PERSONA } from '../lib/personas'

const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function mouthPaths(open, wide, smile) {
  const cx = 240
  const y = 247
  const hw = 22 * (1 + wide * 0.22 - open * 0.12) // rounded vowels are narrower, "ee" is wider
  const lx = cx - hw
  const rx = cx + hw
  const corner = y - smile * 3.2
  const drop = open * 21
  const upperY = y - 3 - open * 1.5

  if (open < 0.06) {
    // closed: a gentle smile
    const d = `M${lx} ${corner} Q${cx} ${y + 4 + smile * 4} ${rx} ${corner}`
    return { fill: '', teeth: '', upper: d, lower: '', closed: d }
  }
  const fill =
    `M${lx} ${corner} Q${cx} ${upperY - 2} ${rx} ${corner} ` +
    `Q${cx + hw * 0.7} ${y + drop + 7} ${cx} ${y + drop + 8} Q${cx - hw * 0.7} ${y + drop + 7} ${lx} ${corner} Z`
  const teeth = `M${lx + 4} ${corner - 0.5} Q${cx} ${upperY - 1} ${rx - 4} ${corner - 0.5} L${rx - 5} ${corner + 5 + open * 2} Q${cx} ${corner + 6 + open * 2} ${lx + 5} ${corner + 5 + open * 2} Z`
  const upper = `M${lx} ${corner} Q${cx - hw * 0.45} ${upperY - 3} ${cx} ${upperY - 1} Q${cx + hw * 0.45} ${upperY - 3} ${rx} ${corner}`
  const lower = `M${lx} ${corner} Q${cx} ${y + drop + 12} ${rx} ${corner}`
  return { fill, teeth, upper, lower, closed: '' }
}

const STATIC_MOUTH = mouthPaths(0, 0, 0.55).closed

export default function Avatar({ state = 'idle', levelRef, className = '', persona = DEFAULT_PERSONA, animate = true, viewBox = '0 64 480 366' }) {
  const L = persona.look
  const uid = useId().replace(/:/g, '')
  const stateRef = useRef(state)
  stateRef.current = state

  const r = {
    head: useRef(null), torso: useRef(null),
    mouthFill: useRef(null), teeth: useRef(null), upper: useRef(null), lower: useRef(null), closed: useRef(null),
    lidL: useRef(null), lidR: useRef(null),
    pupilL: useRef(null), pupilR: useRef(null),
    browL: useRef(null), browR: useRef(null),
  }

  useEffect(() => {
    if (!animate) return undefined // static preview (character picker): the closed-mouth path below is enough
    let raf = 0
    let last = performance.now()
    let open = 0
    let wide = 0
    let nextBlink = last + 1800
    let blinkT = -1
    let nextSaccade = last + 1500
    let gaze = { x: 0, y: 0, tx: 0, ty: 0 }
    let nodStart = -1
    let nextNod = last + 3000
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = now / 1000
      const st = stateRef.current
      const lvl = levelRef?.current || { open: 0, wide: 0 }
      const speaking = st === 'speaking'

      // ---- mouth: fast attack, slower release (looks like a jaw, not a flicker)
      const targetOpen = speaking ? clamp(lvl.open, 0, 1) : 0
      open += (targetOpen - open) * (targetOpen > open ? 0.6 : 0.3)
      wide += (clamp(speaking ? lvl.wide : 0, -1, 1) - wide) * 0.25
      const smile = st === 'listening' ? 0.9 : st === 'thinking' ? 0.2 : 0.55
      const m = mouthPaths(open, wide, smile)
      r.mouthFill.current?.setAttribute('d', m.fill)
      r.teeth.current?.setAttribute('d', m.teeth)
      r.upper.current?.setAttribute('d', m.upper)
      r.lower.current?.setAttribute('d', m.lower)
      r.closed.current?.setAttribute('d', m.closed)
      r.mouthFill.current?.setAttribute('data-open', open.toFixed(3)) // handy for tests/debugging

      // ---- blink
      let blink = 1
      if (!reduce) {
        if (blinkT < 0 && now > nextBlink) { blinkT = 0; nextBlink = now + 2200 + Math.random() * 3500 }
        if (blinkT >= 0) {
          blinkT += dt
          const p = blinkT / 0.17
          blink = p < 0.5 ? 1 - p * 2 * 0.95 : 0.05 + (p - 0.5) * 2 * 0.95
          if (p >= 1) { blinkT = -1; blink = 1 }
        }
      }
      for (const lid of [r.lidL, r.lidR]) {
        const cx = lid === r.lidL ? 212 : 268
        lid.current?.setAttribute('transform', `translate(${cx} 196) scale(1 ${clamp(blink, 0.05, 1)}) translate(${-cx} -196)`)
      }

      // ---- gaze
      if (now > nextSaccade) {
        nextSaccade = now + 1200 + Math.random() * 2400
        gaze.tx = (Math.random() - 0.5) * 2.4
        gaze.ty = (Math.random() - 0.5) * 1.6
      }
      if (st === 'thinking') { gaze.tx = 3.2; gaze.ty = -3 }
      gaze.x = lerp(gaze.x, gaze.tx, 0.12)
      gaze.y = lerp(gaze.y, gaze.ty, 0.12)
      for (const [p] of [[r.pupilL, 212], [r.pupilR, 268]]) {
        p.current?.setAttribute('transform', `translate(${gaze.x} ${gaze.y})`)
      }

      // ---- brows
      const lift = speaking ? open * 2.2 : st === 'thinking' ? 2.5 : st === 'listening' ? 1 : 0
      r.browL.current?.setAttribute('transform', `translate(0 ${-lift})`)
      r.browR.current?.setAttribute('transform', `translate(0 ${-(st === 'thinking' ? lift + 1.5 : lift)})`)

      // ---- head motion: sway while speaking, nods while listening, slow idle drift
      let dx = 0, dy = 0, rot = 0
      if (!reduce) {
        rot = Math.sin(t * 0.7) * 0.6
        dy = Math.sin(t * 1.1) * 0.8
        if (speaking) {
          rot += Math.sin(t * 2.3) * 1.2 * (0.4 + open)
          dx += Math.sin(t * 1.7) * 1.5
          dy += open * 1.6
        }
        if (st === 'listening') {
          if (nodStart < 0 && now > nextNod) { nodStart = now; nextNod = now + 2800 + Math.random() * 2600 }
          if (nodStart >= 0) {
            const p = (now - nodStart) / 650
            if (p >= 1) nodStart = -1
            else dy += Math.sin(p * Math.PI) * 4.5
          }
          rot += 1.2
        }
      }
      r.head.current?.setAttribute('transform', `translate(${dx} ${dy}) rotate(${rot} 240 300)`)

      // ---- breathing
      const breathe = reduce ? 1 : 1 + Math.sin(t * 1.5) * 0.004
      r.torso.current?.setAttribute('transform', `translate(240 430) scale(1 ${breathe}) translate(-240 -430)`)

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  // `r` only holds stable DOM refs created once per mount, so the animation loop is intentionally started once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelRef, animate])

  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="xMidYMax meet"
      className={className}
      style={{ overflow: 'visible' }}
      role="img"
      aria-label={`${persona.name}, your AI interviewer`}
      data-testid="avatar"
      data-persona={persona.id}
      data-state={state}
    >
      <defs>
        <linearGradient id={`blazer-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={L.blazer[0]} />
          <stop offset="1" stopColor={L.blazer[1]} />
        </linearGradient>
        <radialGradient id={`faceShade-${uid}`} cx="0.5" cy="0.42" r="0.65">
          <stop offset="0.6" stopColor={L.skin} stopOpacity="0" />
          <stop offset="1" stopColor={L.skinShade} stopOpacity="0.55" />
        </radialGradient>
      </defs>

      {/* shoulders & blazer (extends past the viewBox so it fills wide tiles) */}
      <g ref={r.torso}>
        <path d="M-120 440 C-70 345 80 312 178 296 L302 296 C400 312 550 345 600 440 Z" fill={`url(#blazer-${uid})`} />
        <path d="M205 296 L240 392 L275 296 Z" fill={L.shirt} />
        <path d="M178 296 L240 402 L206 298 Z" fill={L.lapel} />
        <path d="M302 296 L240 402 L274 298 Z" fill={L.lapel} />
        <path d="M226 300 Q240 318 254 300" fill="none" stroke="#000" strokeOpacity="0.12" strokeWidth="2" />
        {L.pin && <circle cx="240" cy="376" r="3.2" fill={L.pin} />}
      </g>

      {/* head group (rotates about the neck) */}
      <g ref={r.head}>
        {/* hair behind */}
        {L.hairStyle === 'side' && (
          <path d="M158 190 C150 120 190 92 240 92 C292 92 332 122 322 190 C326 250 338 292 318 330 L162 330 C142 292 154 250 158 190 Z" fill={L.hair} />
        )}
        {L.hairStyle === 'long' && (
          <>
            <path d="M158 190 C150 120 190 90 240 90 C292 90 330 120 322 190 L322 262 L158 262 Z" fill={L.hair} />
            <path d="M158 190 C146 250 142 330 146 392 C164 400 190 396 204 384 C196 340 192 296 186 262 Z" fill={L.hair} />
            <path d="M322 190 C334 250 338 330 334 392 C316 400 290 396 276 384 C284 340 288 296 294 262 Z" fill={L.hair} />
          </>
        )}
        {(L.hairStyle === 'short' || L.hairStyle === 'cropped') && (
          <path d="M166 188 C160 124 196 94 240 94 C286 94 322 124 314 188 L312 204 L168 204 Z" fill={L.hair} />
        )}
        {/* neck */}
        <path d="M212 252 L212 306 C226 322 254 322 268 306 L268 252 Z" fill={L.skinShade} />
        {/* ears */}
        <ellipse cx="168" cy="208" rx="9" ry="15" fill={L.skinShade} />
        <ellipse cx="312" cy="208" rx="9" ry="15" fill={L.skinShade} />
        {L.earrings && <circle cx="168" cy="224" r="3" fill={L.earrings} />}
        {L.earrings && <circle cx="312" cy="224" r="3" fill={L.earrings} />}
        {/* face */}
        <path d="M168 186 C168 130 202 108 240 108 C278 108 312 130 312 186 C312 238 282 278 240 280 C198 278 168 238 168 186 Z" fill={L.skin} />
        <path d="M168 186 C168 130 202 108 240 108 C278 108 312 130 312 186 C312 238 282 278 240 280 C198 278 168 238 168 186 Z" fill={`url(#faceShade-${uid})`} />
        {/* cheeks */}
        <ellipse cx="196" cy="236" rx="16" ry="9" fill="#E58E86" opacity="0.2" />
        <ellipse cx="284" cy="236" rx="16" ry="9" fill="#E58E86" opacity="0.2" />

        {/* facial hair (under the mouth, which is drawn on top) */}
        {L.beard && (
          <path
            d="M169 208 C168 262 200 290 240 291 C280 290 312 262 311 208 C304 244 284 262 240 262 C196 262 176 244 169 208 Z"
            fill={L.hair}
            opacity={L.beard === 'stubble' ? 0.32 : 0.95}
          />
        )}
        {L.beard === 'full' && <path d="M218 238 Q240 230 262 238 Q240 244 218 238 Z" fill={L.hair} opacity="0.9" />}

        {/* brows */}
        <path ref={r.browL} d="M193 172 Q211 163 230 171" fill="none" stroke={L.hair} strokeWidth="5" strokeLinecap="round" />
        <path ref={r.browR} d="M250 171 Q269 163 287 172" fill="none" stroke={L.hair} strokeWidth="5" strokeLinecap="round" />

        {/* eyes */}
        {[212, 268].map((cx, i) => (
          <g key={cx} ref={i === 0 ? r.lidL : r.lidR}>
            <ellipse cx={cx} cy="196" rx="14" ry="9" fill="#FBF7F2" />
            <g ref={i === 0 ? r.pupilL : r.pupilR}>
              <circle cx={cx} cy="196" r="6.6" fill={L.eye} />
              <circle cx={cx} cy="196" r="3" fill="#1B120D" />
              <circle cx={cx + 2.2} cy="193.6" r="1.5" fill="#fff" />
            </g>
            <path d={`M${cx - 15} 196 Q${cx} ${183} ${cx + 15} 196`} fill="none" stroke={L.hair} strokeWidth="2.6" strokeLinecap="round" />
          </g>
        ))}

        {/* glasses */}
        {L.glasses && (
          <g fill="none" stroke="#2B2B30" strokeWidth="3" strokeLinecap="round">
            <rect x="190" y="180" width="44" height="32" rx="13" />
            <rect x="246" y="180" width="44" height="32" rx="13" />
            <path d="M234 194 Q240 190 246 194" />
            <path d="M190 192 L170 188 M290 192 L310 188" />
          </g>
        )}

        {/* nose */}
        <path d="M240 200 C236 220 231 228 237 233 M240 233 C243 234 246 233 247 231" fill="none" stroke={L.skinShade} strokeWidth="2.4" strokeLinecap="round" />

        {/* mouth */}
        <path ref={r.mouthFill} d="" fill="#5B1F27" data-testid="mouth" />
        <path ref={r.teeth} d="" fill="#FBF7F2" />
        <path ref={r.upper} d="" fill="none" stroke={L.lip} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
        <path ref={r.lower} d="" fill="none" stroke={L.lip} strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round" />
        <path ref={r.closed} d={STATIC_MOUTH} fill="none" stroke={L.lip} strokeWidth="4.6" strokeLinecap="round" />

        {/* hair front */}
        {L.hairStyle === 'side' && (
          <>
            <path d="M166 192 C160 128 200 96 244 98 C292 100 322 132 314 192 C306 156 292 134 262 126 C232 150 196 158 166 192 Z" fill={L.hair} />
            <path d="M172 150 C176 122 204 104 238 104" fill="none" stroke={L.hairHi} strokeWidth="2" opacity="0.5" />
          </>
        )}
        {L.hairStyle === 'long' && (
          <>
            <path d="M166 196 C158 132 198 98 240 98 C282 98 322 132 314 196 C304 156 280 126 244 122 C206 126 178 156 166 196 Z" fill={L.hair} />
            <path d="M240 100 C238 112 232 122 222 130" fill="none" stroke={L.hairHi} strokeWidth="2" opacity="0.5" />
          </>
        )}
        {L.hairStyle === 'short' && (
          <>
            <path d="M164 186 C156 124 196 92 242 92 C288 92 326 124 316 186 C312 160 304 142 288 132 C262 144 214 142 190 130 C174 144 166 162 164 186 Z" fill={L.hair} />
            <path d="M176 140 C186 118 212 104 240 102" fill="none" stroke={L.hairHi} strokeWidth="2" opacity="0.5" />
          </>
        )}
        {L.hairStyle === 'cropped' && (
          <path d="M167 174 C165 126 200 102 240 102 C280 102 315 126 313 174 C302 144 278 130 240 130 C202 130 178 144 167 174 Z" fill={L.hair} />
        )}
      </g>
    </svg>
  )
}
