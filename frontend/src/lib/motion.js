// Motion helper: true when the visitor asked the system for reduced motion (or the check is unavailable),
// in which case animated content is shown in its final state instead.
export const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return true
  }
}
