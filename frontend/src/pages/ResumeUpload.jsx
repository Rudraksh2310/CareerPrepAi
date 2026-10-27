import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { resumeApi, interviewApi } from '../api/endpoints'
import { Alert, Button, Field } from '../components/ui'
import { usePageMeta } from '../lib/seo'
import { errorMessage } from '../lib/errors'
import InterviewerPicker from '../components/InterviewerPicker'
import { loadInterviewerChoice, saveInterviewerChoice } from '../lib/personas'

// Client-side checks are only for fast feedback; the server re-validates the real file contents and size.
const MAX_MB = 5
const EXT = /\.(pdf|docx)$/i

export default function ResumeUpload() {
  usePageMeta({ title: 'New interview', noindex: true })
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [role, setRole] = useState('')
  const [company, setCompany] = useState('')
  const [interviewer, setInterviewer] = useState(loadInterviewerChoice)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState(null) // progress / success text while submitting

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    if (!EXT.test(selected.name)) {
      setError('Please upload a PDF or DOCX file.')
      e.target.value = ''
      return
    }
    if (selected.size > MAX_MB * 1024 * 1024) {
      setError(`That file is larger than ${MAX_MB} MB. Please upload a smaller one.`)
      e.target.value = ''
      return
    }
    setError(null)
    setFile(selected)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!role.trim()) {
      setError('A target role is required.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      // The resume drives Round 2 (every experience and project gets asked about). Without one, Round 2 asks general background questions.
      let resumeData = null
      if (file) {
        setStatus('Reading your resume\u2026')
        resumeData = (await resumeApi.upload(file)).data
        const found = [
          resumeData.parsed_skills?.length && `${resumeData.parsed_skills.length} skills`,
          resumeData.parsed_experience?.length && `${resumeData.parsed_experience.length} experience entries`,
          resumeData.parsed_projects?.length && `${resumeData.parsed_projects.length} projects`
        ].filter(Boolean)
        setStatus(`Resume read${found.length ? `: found ${found.join(', ')}` : ''}. Starting your interview\u2026`)
      } else {
        setStatus('Starting your interview\u2026')
      }
      const { data: session } = await interviewApi.start({
        role: role.trim(),
        company: company.trim() || null,
        resume_id: resumeData?.id || null,
        interviewer
      })
      saveInterviewerChoice(interviewer)
      navigate(`/interview/${session.id}`)
    } catch (err) {
      setStatus(null)
      setError(errorMessage(err, 'Something went wrong starting the interview.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page py-10 sm:py-14">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
       <div>
        <p className="eyebrow mb-2">New interview</p>
        <h1 className="h2 mb-2 sm:text-3xl">Set up your mock interview</h1>
        <p className="mb-8 text-sm leading-relaxed text-muted">
          Upload your resume and tell us the role. Pick an AI interviewer. They run two rounds by voice: a technical round on what the role requires (10 questions), then a resume round on the experience and projects you list (5 questions). They follow up on what you actually say.
        </p>

        <form onSubmit={handleSubmit} className="glass space-y-5 rounded-2xl p-5 sm:p-7">
          <div>
            <label htmlFor="resume" className="mb-1.5 block text-sm font-medium text-ink">Resume</label>
            <input
              id="resume"
              type="file"
              accept=".pdf,.docx"
              onChange={handleFileChange}
              aria-describedby="resume-hint"
              className="block w-full rounded-md border border-line-strong bg-panel text-sm text-muted transition-colors hover:border-muted focus:border-teal-ink focus:outline-none focus:ring-2 focus:ring-teal-ink/25 file:mr-4 file:h-11 file:cursor-pointer file:border-0 file:border-r file:border-line-strong file:bg-panel2 file:px-4 file:text-sm file:font-semibold file:text-ink"
            />
            <p id="resume-hint" className="mt-1.5 text-xs text-muted">
              {file ? <span className="font-mono text-teal-ink">{file.name}</span> : `PDF or DOCX, up to ${MAX_MB} MB. Optional, but Round 2 is built from it.`}
            </p>
          </div>

          <Field id="role" label="Target role" required value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Software Engineer" />
          <Field id="company" label="Target company (optional)" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Amazon" />

          <InterviewerPicker value={interviewer} onChange={setInterviewer} />

          {status && !error && <Alert tone="success">{status}</Alert>}
          {error && <Alert tone="error">{error}</Alert>}

          <Button type="submit" size="lg" loading={loading} className="w-full">
            {loading ? 'Preparing your interview room\u2026' : 'Continue to interview room'}
          </Button>
        </form>
       </div>

        <aside aria-labelledby="next-h" className="self-start lg:sticky lg:top-24">
          <h2 id="next-h" className="h3 text-lg">What happens next</h2>
          <ol className="mt-4 space-y-3">
            {[
              ['Lobby', 'Pick your microphone, check your camera and join the call.'],
              ['Round 1: technical', 'Ten questions across five topics for your role, with follow-ups where an answer was thin.'],
              ['Round 2: resume', 'Five questions on the jobs and projects you list. No resume? They ask about your background.'],
              ['Your report', 'A score and feedback for each round, and the topics to study before the real interview.']
            ].map(([t, d], i) => (
              <li key={t} className="glass flex gap-4 rounded-xl p-4">
                <span className="font-display text-2xl font-semibold leading-none text-teal-ink/80" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <span className="block text-sm font-semibold text-ink">{t}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-muted">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  )
}
