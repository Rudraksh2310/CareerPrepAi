import client from './client'

// Every function here maps 1:1 to an endpoint listed in the project blueprint,
// section 6 "Backend / API Design (Representative Endpoints)". Keeping this as
// a single file makes it easy to update paths once the backend team confirms
// final routes, without touching any page component.

export const authApi = {
  register: (payload) => client.post('/auth/register', payload), // { name, email, password }
  login: (payload) => client.post('/auth/login', payload) // { email, password }
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
  start: (payload) => client.post('/interview/start', payload), // { role, company, resume_id }
  sendMessage: (sessionId, payload) =>
    client.post(`/interview/${sessionId}/message`, payload), // { answer, response_time }
  end: (sessionId) => client.post(`/interview/${sessionId}/end`),
  getReport: (sessionId) => client.get(`/interview/${sessionId}/report`)
}

export const dashboardApi = {
  history: () => client.get('/dashboard/history')
}
