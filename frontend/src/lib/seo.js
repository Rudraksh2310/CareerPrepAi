import { useEffect } from 'react'

const SITE = (import.meta.env.VITE_SITE_URL || '').replace(/\/+$/, '')
const BASE_TITLE = 'CareerPrepAi'
export const DEFAULT_TITLE = 'CareerPrepAi: AI mock interviews by voice'
const DEFAULT_DESC =
  'Practice interviews with Aria, an AI interviewer. A technical round for your role and a resume round on every project and job you list, then a report for each round. Free during beta.'

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!content) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]')
  if (!href) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Per-route <title>, description, canonical, Open Graph and robots meta. `noindex` is for pages behind a login or
 * with no search value. Canonical/og:url are only written when VITE_SITE_URL is configured (a wrong guess is worse).
 */
export function usePageMeta({ title, description = DEFAULT_DESC, path, noindex = false }) {
  useEffect(() => {
    const full = title ? `${title} · ${BASE_TITLE}` : DEFAULT_TITLE
    document.title = full
    setMeta('name', 'description', description)
    setMeta('name', 'robots', noindex ? 'noindex,nofollow' : null)
    setMeta('property', 'og:title', full)
    setMeta('property', 'og:description', description)
    const url = SITE && path && !noindex ? `${SITE}${path}` : null
    setCanonical(url)
    setMeta('property', 'og:url', url)
  }, [title, description, path, noindex])
}
