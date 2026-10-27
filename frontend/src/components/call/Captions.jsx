// Live captions under the interviewer tile.
//  - while the interviewer speaks: the question, words lighting up in step with the audio
//  - while the candidate answers: their words as they are recognised
export default function Captions({ who, name = 'Aria', text, progress = 1, hint }) {
  if (!text && !hint) return null
  const words = (text || '').split(/\s+/).filter(Boolean)
  const lit = who === 'ai' ? Math.ceil(words.length * Math.min(1, progress + 0.04)) : words.length
  return (
    <div className="pointer-events-none absolute inset-x-3 top-14 flex justify-center sm:inset-x-auto sm:top-auto sm:bottom-3 sm:left-56 sm:right-64" data-testid="captions">
      <p className="max-w-3xl rounded-xl bg-black/70 px-4 py-2.5 text-center text-[15px] leading-snug text-white backdrop-blur sm:text-base">
        <span className={`mr-2 font-mono text-[10px] uppercase tracking-wider ${who === 'ai' ? 'text-amber' : 'text-[#34C3AF]'}`}>
          {who === 'ai' ? name : 'You'}
        </span>
        {text ? (
          words.map((w, i) => (
            <span key={i} className={i < lit ? 'opacity-100' : 'opacity-40'}>{w} </span>
          ))
        ) : (
          <span className="italic text-white/70">{hint}</span>
        )}
      </p>
    </div>
  )
}
