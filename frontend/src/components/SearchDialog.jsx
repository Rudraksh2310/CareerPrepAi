import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GUEST_ITEMS, MEMBER_ITEMS, PUBLIC_ITEMS, searchItems } from '../content/siteIndex'

// Site search in a native <dialog>: the browser provides the focus trap, Escape to close and focus return.
export default function SearchDialog({ open, onClose }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const ref = useRef(null)
  const inputRef = useRef(null)
  const listId = useId()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)

  const items = useMemo(() => [...(user ? MEMBER_ITEMS : GUEST_ITEMS), ...PUBLIC_ITEMS], [user])
  const results = useMemo(() => searchItems(items, q), [items, q])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setQ('')
      setActive(0)
      d.showModal()
      inputRef.current?.focus()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])

  useEffect(() => { setActive(0) }, [q])

  const go = (it) => {
    onClose()
    navigate(it.to)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() } // a type=search field would otherwise just clear itself first
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]) }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }} // click on the backdrop
      aria-label="Search the site"
      className="m-auto mt-[10vh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-card border border-line-strong bg-panel p-0 text-ink shadow-lg backdrop:bg-black/50"
    >
      <div className="border-b border-line p-3">
        <label htmlFor={`${listId}-q`} className="sr-only">Search pages and FAQ</label>
        <input
          id={`${listId}-q`}
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search pages and FAQ"
          className="h-11 w-full rounded-md border border-line-strong bg-bg px-3 text-base text-ink placeholder:text-muted/70 focus:border-teal-ink focus:outline-none focus:ring-2 focus:ring-teal-ink/25 sm:text-sm"
        />
      </div>
      <ul id={listId} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
        {results.map((it, i) => (
          <li
            key={`${it.to}-${it.title}`}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseMove={() => setActive(i)}
            onClick={() => go(it)}
            className={`cursor-pointer rounded-md px-3 py-2.5 ${i === active ? 'bg-panel2' : ''}`}
          >
            <p className="text-sm font-medium text-ink">{it.title}</p>
            <p className="line-clamp-1 text-xs text-muted">{it.description}</p>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-2 text-xs text-muted" role="status" aria-live="polite">
        {results.length === 0 ? `No results for “${q}”.` : `${results.length} result${results.length === 1 ? '' : 's'}. Use the arrow keys and Enter.`}
      </p>
    </dialog>
  )
}
