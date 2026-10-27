import { Link } from 'react-router-dom'
import { usePageMeta } from '../lib/seo'

const CONTACT = (import.meta.env.VITE_CONTACT_EMAIL || '').trim()
const REVIEWED = import.meta.env.VITE_LEGAL_REVIEWED === 'true'

export const ContactLine = () =>
  CONTACT ? (
    <a href={`mailto:${CONTACT}`} className="font-semibold text-teal-ink underline underline-offset-2">{CONTACT}</a>
  ) : (
    <em>[contact address not configured yet: the site owner must set VITE_CONTACT_EMAIL]</em>
  )

// Shared layout for the Privacy Policy and Terms. The text states only what the app actually does; the legal
// identity, jurisdiction and contact details belong to the site owner and are marked until they are supplied.
export default function LegalPage({ title, path, description, updated, children }) {
  usePageMeta({ title, description, path })
  return (
    <div className="page py-10 sm:py-14">
      <article className="mx-auto max-w-3xl">
        <p className="eyebrow mb-2">Legal</p>
        <h1 className="h2 sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated: {updated}</p>

        {!REVIEWED && (
          <div role="note" className="mt-6 rounded-md border border-amber-ink/40 bg-amber-soft px-4 py-3 text-sm text-ink">
            <strong className="font-semibold">Draft.</strong> This page describes how the app works today. Before launch the site owner must
            review it, add the legal entity name, contact address, governing law and any other required details, and then set
            <code className="mx-1 rounded bg-panel2 px-1 font-mono text-xs">VITE_LEGAL_REVIEWED=true</code>to remove this notice. It is not legal advice.
          </div>
        )}

        <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-ink [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1.5 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>

        <p className="mt-10 border-t border-line pt-5 text-sm text-muted">
          <Link to="/" className="font-semibold text-teal-ink hover:underline">Back to home</Link>
        </p>
      </article>
    </div>
  )
}
