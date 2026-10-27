import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import { Alert, Button, Field } from '../components/ui'
import ThemeToggle from '../components/ThemeToggle'
import { usePageMeta } from '../lib/seo'
import { errorMessage } from '../lib/errors'

export default function Account() {
  usePageMeta({ title: 'Account', noindex: true })
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const dialogRef = useRef(null)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState(null) // { tone, text }
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  useEffect(() => {
    const d = dialogRef.current
    const reset = () => { setPassword(''); setDeleteError(null) }
    d?.addEventListener('close', reset)
    return () => d?.removeEventListener('close', reset)
  }, [])

  const download = async () => {
    setExporting(true)
    setExportMsg(null)
    try {
      const { data } = await authApi.exportPdf()
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'careerprepai-my-data.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setExportMsg({ tone: 'success', text: 'Your data was downloaded as careerprepai-my-data.pdf.' })
    } catch (err) {
      setExportMsg({ tone: 'error', text: errorMessage(err, 'Could not export your data. Please try again.') })
    } finally {
      setExporting(false)
    }
  }

  const confirmDelete = async (e) => {
    e.preventDefault()
    setDeleting(true)
    setDeleteError(null)
    try {
      await authApi.deleteAccount(password)
      logout()
      navigate('/login', { replace: true, state: { notice: 'Your account and all of its data were deleted.' } })
    } catch (err) {
      setDeleteError(errorMessage(err, 'Could not delete the account. Please try again.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow mb-2">Account</p>
        <h1 className="h2 sm:text-3xl">Your account</h1>

        <dl className="mt-6 glass divide-y divide-line rounded-card text-sm">
          <div className="flex flex-wrap justify-between gap-2 px-4 py-3"><dt className="text-muted">Name</dt><dd className="font-medium">{user?.name}</dd></div>
          <div className="flex flex-wrap justify-between gap-2 px-4 py-3"><dt className="text-muted">Email</dt><dd className="break-all font-medium">{user?.email}</dd></div>
          <div className="flex items-center justify-between gap-2 px-4 py-2"><dt className="text-muted">Theme</dt><dd><ThemeToggle /></dd></div>
        </dl>

        <section className="mt-10" aria-labelledby="export-h">
          <h2 id="export-h" className="h3 text-lg">Download your data</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Get everything stored about you as a PDF file: your account details, parsed resumes, interview transcripts and reports.
          </p>
          <div className="mt-4 space-y-3">
            <Button variant="secondary" onClick={download} loading={exporting}>{exporting ? 'Preparing…' : 'Download my data'}</Button>
            {exportMsg && <Alert tone={exportMsg.tone}>{exportMsg.text}</Alert>}
          </div>
        </section>

        <section className="glass mt-10 rounded-card !border-coral-ink/40 p-5" aria-labelledby="delete-h">
          <h2 id="delete-h" className="h3 text-lg text-coral-ink">Delete your account</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Permanently deletes your account together with your resumes, interviews, transcripts and reports. This cannot be undone.
            Download your data first if you want a copy.
          </p>
          <Button variant="secondary" className="mt-4 border-coral-ink/50 text-coral-ink hover:border-coral-ink" onClick={() => dialogRef.current?.showModal()}>
            Delete my account&hellip;
          </Button>
        </section>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="del-title"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-line-strong bg-panel p-0 text-ink shadow-lg backdrop:bg-black/50"
      >
        <form onSubmit={confirmDelete} className="space-y-4 p-5">
          <h2 id="del-title" className="h3 text-lg">Delete your account?</h2>
          <p className="text-sm text-muted">Enter your password to confirm. Everything linked to this account will be erased.</p>
          <Field id="del-pw" type="password" label="Password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {deleteError && <Alert tone="error">{deleteError}</Alert>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => dialogRef.current?.close()}>Cancel</Button>
            <Button type="submit" loading={deleting} disabled={!password} className="!bg-coral !text-white hover:!brightness-110">
              {deleting ? 'Deleting…' : 'Delete everything'}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  )
}