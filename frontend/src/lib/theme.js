// Light/dark theme. With no saved choice the OS setting applies (CSS media query); a choice is saved in localStorage.
const KEY = 'cpai_theme'

export function getStoredTheme() {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : null
  } catch {
    return null
  }
}

export function effectiveTheme() {
  const t = document.documentElement.getAttribute('data-theme')
  if (t === 'light' || t === 'dark') return t
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t)
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* storage can be blocked (private mode); the choice then lasts for this visit only */
  }
}
