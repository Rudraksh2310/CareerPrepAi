import { useEffect, useRef, useState } from 'react'
import { ease, reducedMotion } from '../lib/motion'

// A number that counts up once when it scrolls into view. Screen readers get the final value immediately.
export default function CountUp({ to, duration = 1200 }) {
  const ref = useRef(null)
  const [n, setN] = useState(to)

  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion() || typeof IntersectionObserver === 'undefined') return undefined
    let raf = 0
    let started = false
    const run = () => {
      const t0 = performance.now()
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / duration)
        setN(Math.round(to * ease(p)))
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started) {
          started = true
          setN(0)
          run()
          io.disconnect()
        }
      },
      { threshold: 0.6 }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [to, duration])

  return (
    <span ref={ref}>
      <span aria-hidden="true">{n}</span>
      <span className="sr-only">{to}</span>
    </span>
  )
}
