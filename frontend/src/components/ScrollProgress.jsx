import { useEffect, useRef } from 'react'

// A thin bar under the header showing how far down the page you are.
export default function ScrollProgress() {
  const bar = useRef(null)
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const h = document.documentElement
      const max = h.scrollHeight - h.clientHeight
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? Math.min(1, h.scrollTop / max) : 0})`
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])
  return <div className="scroll-progress" aria-hidden="true"><span ref={bar} /></div>
}
