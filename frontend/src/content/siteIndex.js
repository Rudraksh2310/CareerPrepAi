import { FAQS } from './faqs'

// What the site search can find. Static on purpose: it indexes the site's own pages and FAQ, nothing user-specific.
export const PUBLIC_ITEMS = [
  { title: 'Home', description: 'What CareerPrepAi is and how to start', to: '/', keywords: 'overview landing start' },
  { title: 'How a session works', description: 'Set up, join the call room, answer the interviewer, read your report', to: '/#how', keywords: 'steps process lobby' },
  { title: 'The two rounds', description: 'A technical round and a resume round', to: '/#rounds', keywords: 'technical resume round interview questions skip' },
  { title: 'Your report', description: 'Scores per round, weak topics and feedback on every answer', to: '/#report', keywords: 'score feedback results' },
  { title: 'Choose your interviewer', description: 'Five characters, each with their own voice', to: '/#interviewers', keywords: 'avatar voice character aria arjun meera daniel marcus' },
  { title: 'Interview words, explained', description: 'STAR method, time complexity, trade-offs and other terms, with a tip for each', to: '/#glossary', keywords: 'glossary definitions terms vocabulary tips star behavioural' },
  { title: 'FAQ', description: 'Pricing, resumes, voice, companies', to: '/#faq', keywords: 'help questions' },
  { title: 'Privacy Policy', description: 'What data is stored and who processes it', to: '/privacy', keywords: 'data privacy gdpr delete personal' },
  { title: 'Terms of Use', description: 'Rules for using CareerPrepAi', to: '/terms', keywords: 'terms conditions legal' },
  ...FAQS.map((f) => ({ title: f.q, description: f.a, to: '/#faq', keywords: 'faq' }))
]
export const GUEST_ITEMS = [
  { title: 'Log in', description: 'Access your interviews and reports', to: '/login', keywords: 'sign in account' },
  { title: 'Create an account', description: 'Free during beta', to: '/register', keywords: 'sign up register' }
]
export const MEMBER_ITEMS = [
  { title: 'Dashboard', description: 'Your interviews, scores and reports', to: '/dashboard', keywords: 'history sessions scores' },
  { title: 'New interview', description: 'Upload a resume and start a mock interview', to: '/upload', keywords: 'start upload resume practice' },
  { title: 'Account', description: 'Download your data or delete your account', to: '/account', keywords: 'delete export download settings profile theme' }
]

export function searchItems(items, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return items.slice(0, 7)
  return items
    .map((it) => {
      const t = it.title.toLowerCase()
      const k = (it.keywords || '').toLowerCase()
      const d = it.description.toLowerCase()
      let score = 0
      for (const w of terms) {
        const hit = t.includes(w) ? 3 : k.includes(w) ? 2 : d.includes(w) ? 1 : 0
        if (!hit) return { it, score: 0 }
        score += hit
      }
      return { it, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.it)
}
