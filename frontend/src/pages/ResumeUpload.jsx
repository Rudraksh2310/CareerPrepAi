import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { resumeApi, interviewApi } from '../api/endpoints'

export default function ResumeUpload() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [role, setRole] = useState('')
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    const okTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!okTypes.includes(selected.type)) {
      setError('Please upload a PDF or DOCX file.')
      return
    }
    setError(null)
    setFile(selected)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file || !role) {
      setError('A resume and target role are required.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data: resumeData } = await resumeApi.upload(file)
      const { data: session } = await interviewApi.start({
        role,
        company: company || null,
        resume_id: resumeData.id
      })
      navigate(`/interview/${session.id}`, { state: { firstQuestion: session.first_question } })
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong starting the interview.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <p className="mb-2 font-mono text-xs uppercase tracking-wide text-teal">Step 1 of 2</p>
      <h1 className="mb-2 font-display text-3xl font-semibold">Set up your mock interview</h1>
      <p className="mb-8 text-sm text-muted">
        Upload your resume and tell us the role — CareerPrepAi grounds every question in this.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm text-muted" htmlFor="resume">Resume (PDF or DOCX)</label>
          <input
            id="resume"
            type="file"
            accept=".pdf,.docx"
            onChange={handleFileChange}
            className="w-full rounded-lg border border-line bg-panel px-4 py-2.5 text-sm text-ink file:mr-4 file:rounded-md file:border-0 file:bg-panel2 file:px-3 file:py-1.5 file:text-ink"
          />
          {file && <p className="mt-1.5 font-mono text-xs text-teal">{file.name}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-muted" htmlFor="role">Target role</label>
          <input
            id="role"
            required
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel px-4 py-2.5 text-ink outline-none focus:border-teal"
            placeholder="e.g. Software Engineer"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-muted" htmlFor="company">Target company (optional)</label>
          <input
            id="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel px-4 py-2.5 text-ink outline-none focus:border-teal"
            placeholder="e.g. Amazon"
          />
        </div>

        {error && <p className="text-sm text-coral">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-amber py-2.5 font-semibold text-[#2A1600] transition hover:brightness-105 disabled:opacity-60"
        >
          {loading ? 'Starting…' : 'Start interview'}
        </button>
      </form>
    </div>
  )
}
