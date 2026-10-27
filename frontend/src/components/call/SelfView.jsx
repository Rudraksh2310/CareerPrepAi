import { useEffect, useRef } from 'react'
import { MicOffIcon } from './icons'

// Self-view tile (bottom-right, like Meet/Zoom). The caller's className must position it (relative / absolute). `getLevel` is polled to draw the "you're speaking" ring.
export default function SelfView({ stream, camOn, micOn, name, getLevel, className = '' }) {
  const videoRef = useRef(null)
  const ringRef = useRef(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = camOn && stream ? stream : null
  }, [stream, camOn])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const l = micOn && getLevel ? getLevel() : 0
      if (ringRef.current) {
        ringRef.current.style.boxShadow = l > 0.12 ? `0 0 0 ${2 + Math.min(3, l * 5)}px rgba(52,195,175,${0.5 + Math.min(0.5, l)})` : '0 0 0 1px rgba(255,255,255,0.12)'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getLevel, micOn])

  const initials = (name || 'You').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div ref={ringRef} className={`overflow-hidden rounded-xl bg-[#232A36] ${className}`} data-testid="self-view">
      <video ref={videoRef} autoPlay playsInline muted className={`h-full w-full -scale-x-100 object-cover ${camOn && stream ? '' : 'hidden'}`} />
      {!(camOn && stream) && (
        <div className="flex h-full w-full items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0E8E7E] font-display text-xl font-semibold text-white">{initials}</span>
        </div>
      )}
      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-0.5 text-[11px] text-white">
        {!micOn && <MicOffIcon width={12} height={12} className="text-coral" />}
        {name || 'You'}
      </div>
    </div>
  )
}
