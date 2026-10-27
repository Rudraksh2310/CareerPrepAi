import client from './client'

// Every function here maps 1:1 to an endpoint listed in the project blueprint,
// section 6 "Backend / API Design (Representative Endpoints)". Keeping this as
// a single file makes it easy to update paths once the backend team confirms
// final routes, without touching any page component.

export const authApi = {
  register: (payload) => client.post('/auth/register', payload), // { name, email, password }
  login: (payload) => client.post('/auth/login', payload), // { email, password }
  exportData: () => client.get('/auth/me/export'), // everything stored about the signed-in user (JSON)
  exportPdf: () => client.get('/auth/me/export/pdf', { responseType: 'blob' }), // same data as a PDF
  deleteAccount: (password) => client.delete('/auth/me', { data: { password } }) // removes the account and all its data
}

export const resumeApi = {
  upload: (file) => {
    const form = new FormData()
    form.append('file', file)
    return client.post('/resume/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }
}

export const interviewApi = {
  start: (payload) => client.post('/interview/start', payload), // { role, company, resume_id, interviewer }
  get: (sessionId) => client.get(`/interview/${sessionId}`), // rejoin: open question + transcript so far
  sendMessage: (sessionId, payload) =>
    client.post(`/interview/${sessionId}/message`, payload), // { answer, response_time, input_mode }
  end: (sessionId) => client.post(`/interview/${sessionId}/end`),
  getReport: (sessionId) => client.get(`/interview/${sessionId}/report`)
}

export const dashboardApi = {
  history: () => client.get('/dashboard/history')
}

export const adminApi = {
  stats: () => client.get('/admin/stats') // aggregate counts only; 403 unless the account has is_admin
}

export const voiceApi = {
  config: () => client.get('/voice/config'), // { stt_server, tts_server, ... }
  // Interviewer voice: text -> audio/mpeg Blob (also what drives the avatar's lip-sync)
  tts: async (text, voice) => (await client.post('/voice/tts', { text, voice }, { responseType: 'blob' })).data,
  // Server-side speech-to-text fallback (browsers without SpeechRecognition): audio Blob -> text
  transcribe: async (blob) => {
    const form = new FormData()
    const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'
    form.append('file', blob, `answer.${ext}`)
    const { data } = await client.post('/voice/transcribe', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    return data.text
  }
}