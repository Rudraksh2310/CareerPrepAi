import { Link } from 'react-router-dom'
import LegalPage, { ContactLine } from '../components/LegalPage'

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      path="/privacy"
      updated="20 October 2026"
      description="What data CareerPrepAi stores, which services process it, and how to download or delete it."
    >
      <section>
        <h2>What we store</h2>
        <ul>
          <li><strong>Account:</strong> your name, your email address and a bcrypt hash of your password (never the password itself).</li>
          <li><strong>Resumes:</strong> the file name and the information extracted from the file (skills, projects, experience, education and similar). The uploaded file itself is read in memory and is not kept.</li>
          <li><strong>Interviews:</strong> the role and company you entered, each question, your answer (spoken answers are stored as the transcribed text), how you answered (voice or typed), response times, the analysis of each answer, and the report with its scores and feedback.</li>
        </ul>
        <p>Everything is kept in the application&apos;s database until you delete your account. There is no automatic expiry.</p>
      </section>

      <section>
        <h2>Who else processes your data</h2>
        <p>To run an interview the app sends data to services chosen by whoever operates it. Depending on that configuration:</p>
        <ul>
          <li><strong>AI model provider</strong> (Anthropic, OpenAI or Groq): the text of your resume, your answers and the interview context, to extract your profile, write follow-up questions and score answers. If no provider is configured the app uses a built-in offline mode and nothing is sent.</li>
          <li><strong>Speech recognition:</strong> in Chrome and Edge your browser&apos;s own speech recognition is used, which the browser vendor processes under its own terms. In other browsers, short audio recordings of your answers are sent to the transcription provider (Groq or OpenAI) and are not stored by us. You can always type instead.</li>
          <li><strong>Interviewer voice:</strong> the question text is sent to the text-to-speech service in use (Microsoft Edge text-to-speech, OpenAI or ElevenLabs), or your browser&apos;s built-in voice is used.</li>
        </ul>
        <p>Your camera, if you turn it on, is only shown back to you in the call room. It is not recorded or uploaded.</p>
      </section>

      <section>
        <h2>Cookies, local storage and analytics</h2>
        <p>The site sets no cookies and runs no analytics or advertising trackers. It stores a few things in your browser&apos;s local storage, all needed for the site to work the way you set it up: your sign-in token and basic profile so you stay logged in, your light/dark theme choice, the interviewer you picked, and the microphone you chose. Clearing your browser data removes them. Fonts are served from this site, not from a third party. Because nothing optional is stored or measured, no consent banner is shown. If analytics is ever added, it will be disclosed here and will wait for your consent first.</p>
      </section>

      <section>
        <h2>Your choices</h2>
        <ul>
          <li><strong>Download your data:</strong> the <Link to="/account" className="font-semibold text-teal-ink underline underline-offset-2">Account page</Link> exports everything stored about you as a JSON file.</li>
          <li><strong>Delete your data:</strong> the Account page deletes your account together with your resumes, interviews, transcripts and reports. This cannot be undone.</li>
        </ul>
      </section>

      <section>
        <h2>Security</h2>
        <p>Passwords are hashed, traffic should be served over HTTPS in production, and each user can only read their own interviews and reports. No system is perfectly secure, so please do not put information in your resume or answers that you would not want processed by the services above.</p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Questions about your data: <ContactLine />.</p>
      </section>
    </LegalPage>
  )
}
