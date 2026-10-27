import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TERMS } from '../content/glossary'
import { reducedMotion } from '../lib/motion'

// Interview words drifting slowly behind the page. They stop while hovered or focused; click (or Enter) opens the meaning
// and a tip. It is an extra layer: the same terms are written out in the glossary section, motion can be paused with the
// button, and nothing moves at all when the visitor asked for reduced motion.
const LANES = [9, 17, 25, 33, 41, 50, 58, 66, 74, 82, 90, 21]
const SPEED = [78, 96, 70, 110, 84, 66, 102, 90, 74, 116, 80, 92] // seconds to cross the screen

export default function FloatingTerms() {
  const [still] = useState(reducedMotion)
  const [paused, setPaused] = useState(false)
  const [open, setOpen] = useState(null) // { term, left, top }
  const card = useRef(null)
  const opener = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    const onDown = (e) => {
      if (!card.current?.contains(e.target) && !e.target.closest?.('.float-chip')) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  // Words never sit on top of the page's text: while a word overlaps a heading, paragraph, button, image or panel it
  // fades out (and stops catching the pointer), and it fades back in once it reaches empty space.
  useEffect(() => {
    if (still) return undefined
    const BLOCKS = 'main :is(h1, h2, h3, p, li, dt, dd, summary, a, button, img, figure, svg, .stage, .pane)'
    const pad = 16
    const tick = () => {
      if (document.hidden) return
      const rects = []
      document.querySelectorAll(BLOCKS).forEach((el) => {
        if (el.closest('.field, .term-card, .field-toggle')) return
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > window.innerHeight) return
        rects.push(r)
      })
      document.querySelectorAll('.float-chip').forEach((chip) => {
        const c = chip.getBoundingClientRect()
        const hit = rects.some((r) => c.left < r.right + pad && c.right > r.left - pad && c.top < r.bottom + pad && c.bottom > r.top - pad)
        chip.classList.toggle('ghost', hit)
      })
    }
    tick()
    const id = setInterval(tick, 100)
    let raf = 0
    const soon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; tick() }) } // scrolling moves the page under the words
    window.addEventListener('scroll', soon, { passive: true })
    window.addEventListener('resize', soon)
    return () => {
      clearInterval(id)
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', soon)
      window.removeEventListener('resize', soon)
    }
  }, [still])

  // once the card exists, keep it fully on screen whatever its height turned out to be, then move focus into it
  useLayoutEffect(() => {
    const el = card.current
    if (!open || !el) return
    const h = el.getBoundingClientRect().height
    el.style.top = `${Math.max(12, Math.min(open.top, window.innerHeight - h - 12))}px`
    el.focus({ preventScroll: true })
  }, [open])

  function close() {
    setOpen(null)
    opener.current?.focus?.({ preventScroll: true })
  }

  function show(t, e) {
    const r = e.currentTarget.getBoundingClientRect()
    const w = Math.min(352, window.innerWidth - 24)
    opener.current = e.currentTarget
    setOpen({
      term: t,
      left: Math.max(12, Math.min(r.left, window.innerWidth - w - 12)),
      top: r.bottom + 220 > window.innerHeight ? Math.max(12, r.top - 210) : r.bottom + 10
    })
  }

  if (still) return null

  return (
    <>
      <aside aria-label="Interview words" className={`field ${paused || open ? 'is-paused' : ''}`}>
        {TERMS.map((t, i) => (
          <span
            key={t.term}
            className={`float-chip ${i % 2 ? 'rtl' : ''}`}
            style={{ '--top': `${LANES[i]}%`, '--dur': `${SPEED[i]}s`, '--delay': `-${(i * 37) % SPEED[i]}s`, '--bob': `${5 + (i % 4)}s` }}
          >
            <button type="button" onClick={(e) => show(t, e)} aria-haspopup="true" aria-expanded={open?.term === t}>
              {t.term}
            </button>
          </span>
        ))}
      </aside>

      <button
        type="button"
        className="field-toggle"
        aria-pressed={paused}
        onClick={() => setPaused((p) => !p)}
      >
        {paused ? 'Play moving words' : 'Pause moving words'}
      </button>

      {open && (
        <div
          ref={card}
          tabIndex={-1}
          role="group"
          aria-label={open.term.term}
          className="term-card"
          style={{ left: open.left, top: open.top }}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-xl font-bold leading-tight tracking-tight text-ink">{open.term.term}</h3>
            <button type="button" onClick={close} className="-mr-1 -mt-1 rounded-md px-2 py-1 text-sm font-semibold text-muted hover:text-ink">
              Close
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink">{open.term.meaning}</p>
          <p className="mt-3 rounded-md bg-amber-soft px-3 py-2 text-sm leading-relaxed text-ink">
            <span className="font-semibold">Tip: </span>
            {open.term.tip}
          </p>
        </div>
      )}
    </>
  )
}
