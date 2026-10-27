import { useLayoutEffect, useRef, useState } from 'react'
import { reducedMotion } from '../lib/motion'

// Fades and lifts its children in when they scroll into view. Content that is already on screen at load
// is left alone (the hero has its own entrance), and with reduced motion or no IntersectionObserver it
// is never hidden, so nothing can get stuck invisible.
export default function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const ref = useRef(null)
  const [hidden, setHidden] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || reducedMotion() || typeof IntersectionObserver === 'undefined') return undefined
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return undefined
    setHidden(true)
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setHidden(false)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag ref={ref} className={`reveal ${hidden ? 'reveal-hidden' : ''} ${className}`} style={{ '--d': `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  )
}
