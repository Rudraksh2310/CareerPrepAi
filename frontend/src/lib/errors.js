// Turn an axios error into a message safe to render. FastAPI sends `detail` as a string for HTTPException but as a
// list of {msg, loc, ...} for request-validation errors (422); rendering that list directly would crash React.
export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const res = err?.response
  if (!res) return err?.code === 'ERR_NETWORK' || err?.request ? 'Could not reach the server. Check your connection and try again.' : fallback
  const d = res.data?.detail
  if (typeof d === 'string' && d) return d
  if (Array.isArray(d) && d[0]?.msg) {
    const field = Array.isArray(d[0].loc) ? d[0].loc[d[0].loc.length - 1] : null
    const msg = String(d[0].msg).replace(/^Value error,\s*/i, '')
    return field && !/^[A-Z]/.test(msg) ? `${field}: ${msg}` : msg
  }
  if (res.status === 413) return 'That is too large to send.'
  if (res.status === 429) return 'Too many requests. Please wait a bit and try again.'
  return fallback
}
