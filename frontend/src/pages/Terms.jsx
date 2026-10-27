import LegalPage, { ContactLine } from '../components/LegalPage'

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Use"
      path="/terms"
      updated="20 October 2026"
      description="The rules for using CareerPrepAi, the AI mock interview practice tool."
    >
      <section>
        <h2>The service</h2>
        <p>CareerPrepAi is a practice tool that runs mock interviews with an AI interviewer and produces a report on your answers. It is provided free of charge while in beta, as is, and may change, be interrupted or be withdrawn.</p>
      </section>

      <section>
        <h2>AI-generated content</h2>
        <p>Questions, scores and feedback are produced by AI models and by built-in rules. They can be wrong, incomplete or unsuited to a particular employer. They are for practice only and do not predict or guarantee the outcome of any real interview, application or job offer.</p>
      </section>

      <section>
        <h2>Your account</h2>
        <ul>
          <li>Keep your password private. You are responsible for activity under your account.</li>
          <li>Give accurate information. Only upload a resume that is yours or that you have the right to use.</li>
          <li>You can delete your account and its data at any time from the Account page.</li>
        </ul>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Do not upload malware, attempt to break into or overload the service, or try to access other people&apos;s data.</li>
          <li>Do not use automated tools to send large volumes of requests. The service rate-limits requests and may suspend accounts that abuse it.</li>
        </ul>
      </section>

      <section>
        <h2>Your content</h2>
        <p>You keep ownership of your resume and answers. By using the service you allow it to process them as described in the Privacy Policy so that interviews and reports can be produced.</p>
      </section>

      <section>
        <h2>Liability, governing law and operator details</h2>
        <p><em>[To be completed by the site owner: the legal entity operating the service, limitation of liability, and the governing law and courts that apply. These cannot be written for them.]</em></p>
      </section>

      <section>
        <h2>Contact</h2>
        <p><ContactLine /></p>
      </section>
    </LegalPage>
  )
}
