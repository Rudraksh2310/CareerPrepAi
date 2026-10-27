// Speech-to-text: capture the candidate's spoken answer and decide when they are done.
//
// Two engines behind one controller:
//   "browser" - the Web Speech API (Chrome / Edge / Safari). Live interim captions, zero cost.
//   "server"  - MediaRecorder + silence detection, audio sent to POST /voice/transcribe (Whisper).
//               Works in any browser with a microphone (Firefox etc.), but has no live captions.
//
// End-of-turn is detected by silence: once the candidate has said something and then stays quiet for
// `silenceMs`, the answer is submitted. They can also finish early with the "I'm done" button (stop()).

import { errorMessage } from './errors'

export function browserSttSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function serverRecordingSupported() {
  return typeof window !== 'undefined' && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia
}

/**
 * @param {object} o
 * @param {'browser'|'server'} o.mode
 * @param {MediaStream} [o.stream]            mic stream (required for server mode)
 * @param {(text:string)=>void} o.onInterim   live transcript so far (browser mode)
 * @param {(text:string)=>void} o.onFinal     called once with the full answer when the turn ends
 * @param {(err:{code:string,message:string})=>void} o.onError
 * @param {(blob:Blob)=>Promise<string>} [o.transcribe]   server mode: audio -> text
 * @param {()=>void} [o.onSpeechStart]
 */
export function createListener({
  mode,
  stream,
  onInterim = () => {},
  onFinal,
  onError = () => {},
  transcribe,
  onSpeechStart = () => {},
  silenceMs = 2300,
  maxMs = 150000,
}) {
  return mode === 'server'
    ? serverListener({ stream, onFinal, onError, transcribe, onSpeechStart, silenceMs, maxMs, onInterim })
    : browserListener({ onInterim, onFinal, onError, onSpeechStart, silenceMs, maxMs })
}

// ------------------------------------------------------------------ browser (Web Speech API)

function browserListener({ onInterim, onFinal, onError, onSpeechStart, silenceMs, maxMs }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  let rec = null
  let active = false
  let finalText = ''
  let interimText = ''
  let lastActivity = 0
  let startedAt = 0
  let lastSpawn = 0
  let heardAnything = false
  let timer = null

  const current = () => `${finalText} ${interimText}`.replace(/\s+/g, ' ').trim()

  const spawn = () => {
    lastSpawn = Date.now()
    rec = new SR()
    rec.lang = 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += `${r[0].transcript} `
        else interim += r[0].transcript
      }
      interimText = interim
      lastActivity = Date.now()
      if (!heardAnything) {
        heardAnything = true
        onSpeechStart()
      }
      onInterim(current())
    }

    rec.onerror = (e) => {
      // 'no-speech' and 'aborted' are routine; onend restarts the engine.
      if (e.error === 'no-speech' || e.error === 'aborted') return
      active = false
      clearInterval(timer)
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        onError({ code: 'permission', message: 'Microphone access was blocked. Allow it in the browser address bar, or type your answers.' })
      } else if (e.error === 'network') {
        onError({ code: 'network', message: 'The browser speech service could not be reached.' })
      } else {
        onError({ code: e.error, message: `Speech recognition error: ${e.error}` })
      }
    }

    rec.onend = () => {
      if (!active) return
      // Chrome ends the session after a while even in continuous mode - restart, but not in a tight loop.
      const wait = Date.now() - lastSpawn < 400 ? 400 : 0
      setTimeout(() => {
        if (!active) return
        try { spawn() } catch { /* already started */ }
      }, wait)
    }

    try { rec.start() } catch { /* start() throws if called twice; safe to ignore */ }
  }

  const finish = () => {
    if (!active) return ''
    active = false
    clearInterval(timer)
    const text = current()
    try { rec?.stop() } catch { /* noop */ }
    rec = null
    onFinal(text)
    return text
  }

  return {
    engine: 'browser',
    start() {
      active = true
      finalText = ''
      interimText = ''
      heardAnything = false
      startedAt = lastActivity = Date.now()
      spawn()
      timer = setInterval(() => {
        const now = Date.now()
        if (current() && now - lastActivity > silenceMs) finish()
        else if (now - startedAt > maxMs) finish()
      }, 250)
    },
    /** End the turn now and submit whatever was heard. */
    stop: finish,
    /** Abort without submitting. */
    cancel() {
      active = false
      clearInterval(timer)
      try { rec?.abort() } catch { /* noop */ }
      rec = null
    },
    get transcript() { return current() },
  }
}

// ------------------------------------------------------------------ server (MediaRecorder + Whisper)

function pickMime() {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return options.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || ''
}

function serverListener({ stream, onFinal, onError, transcribe, onSpeechStart, onInterim, silenceMs, maxMs }) {
  let recorder = null
  let chunks = []
  let ctx = null
  let analyser = null
  let source = null
  let timer = null
  let active = false
  let speechTicks = 0
  let heard = false
  let lastVoice = 0
  let startedAt = 0

  let speechRms = 0.025 // adapts to the room's background noise during the first half second
  const calib = []

  const cleanup = () => {
    clearInterval(timer)
    try { source?.disconnect() } catch { /* noop */ }
    try { ctx?.close() } catch { /* noop */ }
    ctx = analyser = source = null
  }

  const finish = (submit = true) => {
    if (!active) return
    active = false
    cleanup()
    if (!recorder || recorder.state === 'inactive') return
    recorder.onstop = async () => {
      if (!submit) return
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
      if (!heard || blob.size < 2000) {
        onFinal('')
        return
      }
      onInterim('Transcribing…')
      try {
        onFinal(((await transcribe(blob)) || '').trim())
      } catch (err) {
        onError({ code: 'transcribe', message: errorMessage(err, 'Could not transcribe your answer. You can type it instead.') })
      }
    }
    recorder.stop()
  }

  return {
    engine: 'server',
    start() {
      const audioTracks = stream?.getAudioTracks?.() || []
      if (!audioTracks.length) {
        onError({ code: 'permission', message: 'No microphone available.' })
        return
      }
      active = true
      heard = false
      speechTicks = 0
      chunks = []
      startedAt = lastVoice = Date.now()
      const mime = pickMime()
      recorder = new MediaRecorder(new MediaStream(audioTracks), mime ? { mimeType: mime } : undefined)
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      recorder.start(250)

      const AC = window.AudioContext || window.webkitAudioContext
      ctx = new AC()
      source = ctx.createMediaStreamSource(new MediaStream(audioTracks))
      analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      const buf = new Float32Array(analyser.fftSize)
      onInterim('Listening…')

      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        const rms = Math.sqrt(sum / buf.length)
        const now = Date.now()
        if (calib.length < 5) {
          // Measure the noise floor first so a fan / hum does not count as speech forever.
          calib.push(rms)
          if (calib.length === 5) {
            const floor = [...calib].sort((a, b) => a - b)[2]
            speechRms = Math.min(0.08, Math.max(0.02, floor * 2.5 + 0.01))
          }
          return
        }
        if (rms > speechRms) {
          lastVoice = now
          if (++speechTicks === 3 && !heard) {
            heard = true
            onSpeechStart()
            onInterim('Recording your answer…')
          }
        }
        if (heard && now - lastVoice > silenceMs) finish(true)
        else if (now - startedAt > maxMs) finish(true)
      }, 100)
    },
    stop: () => finish(true),
    cancel: () => finish(false),
    get transcript() { return '' },
  }
}
