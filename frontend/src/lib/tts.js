// The interviewer's voice, and the signal that drives the avatar's mouth.
//
//   "server"  - audio from POST /voice/tts is played through a Web Audio AnalyserNode. Loudness and the
//               low/high frequency balance of the REAL audio are written to `levelRef` every frame, so the
//               mouth moves with what is actually being said (this is the lip-sync).
//   "browser" - speechSynthesis (device voice). The browser exposes no audio samples, so the mouth is driven
//               by word-boundary events plus a speech-rhythm envelope - convincing, but not sample-accurate.
//
// levelRef.current = { open: 0..1 (jaw), wide: -1..1 (-1 = rounded "oo", +1 = wide "ee") }

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export function createVoice({ getAudioContext, fetchAudio, levelRef, gender = 'f' }) {
  let mode = fetchAudio ? 'server' : 'browser'
  let audio = null
  let raf = 0
  let cancelled = false
  let cancelCurrent = () => {}

  const setLevel = (open, wide = 0) => {
    levelRef.current = { open: clamp(open, 0, 1), wide: clamp(wide, -1, 1) }
  }
  const stopLoop = () => {
    cancelAnimationFrame(raf)
    setLevel(0, 0)
  }

  // ---------------- server audio, analysed for lip-sync
  async function speakServer(text, { onStart, onProgress }) {
    const blob = await fetchAudio(text)
    if (cancelled) return
    const url = URL.createObjectURL(blob)
    audio = new Audio(url)
    audio.crossOrigin = 'anonymous'

    const ctx = getAudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    const src = ctx.createMediaElementSource(audio)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.5
    src.connect(analyser)
    analyser.connect(ctx.destination)
    const time = new Float32Array(analyser.fftSize)
    const freq = new Uint8Array(analyser.frequencyBinCount)
    const hzPerBin = ctx.sampleRate / analyser.fftSize

    const tick = () => {
      analyser.getFloatTimeDomainData(time)
      let sum = 0
      for (let i = 0; i < time.length; i++) sum += time[i] * time[i]
      const rms = Math.sqrt(sum / time.length)

      analyser.getByteFrequencyData(freq)
      const band = (lo, hi) => {
        let s = 0, n = 0
        for (let i = Math.floor(lo / hzPerBin); i < Math.min(freq.length, Math.ceil(hi / hzPerBin)); i++) { s += freq[i]; n++ }
        return n ? s / n / 255 : 0
      }
      const low = band(150, 900)   // open vowels (a, o, u): energy low
      const high = band(2000, 5500) // fricatives / front vowels (s, ee): energy high
      const wide = clamp((high - low) * 3, -1, 1)
      setLevel(rms > 0.012 ? Math.pow(rms * 5.2, 0.75) : 0, wide)
      if (audio?.duration) onProgress?.(audio.currentTime / audio.duration)
      raf = requestAnimationFrame(tick)
    }

    await new Promise((resolve, reject) => {
      cancelCurrent = () => { audio?.pause(); resolve() }
      audio.onplaying = () => { onStart?.(); raf = requestAnimationFrame(tick) }
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('audio playback failed'))
      audio.play().catch(reject)
    }).finally(() => {
      stopLoop()
      try { src.disconnect(); analyser.disconnect() } catch { /* noop */ }
      URL.revokeObjectURL(url)
      audio = null
    })
  }

  // ---------------- browser speechSynthesis, mouth from boundaries + rhythm
  function pickVoice() {
    const voices = window.speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang))
    const prefer = gender === 'm'
      ? [/guy/i, /ryan/i, /david/i, /mark/i, /google uk english male/i, /daniel/i, /alex/i, /\bmale\b/i, /google us english/i]
      : [/aria/i, /jenny/i, /google uk english female/i, /samantha/i, /zira/i, /female/i, /google us english/i]
    for (const re of prefer) {
      const v = voices.find((x) => re.test(x.name))
      if (v) return v
    }
    return voices[0] || null
  }

  function speakBrowser(text, { onStart, onProgress }) {
    const synth = window.speechSynthesis
    if (!synth) return speakSilent(text, { onStart, onProgress })
    // Chrome cuts long utterances; speak sentence by sentence.
    const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text]
    const total = text.length
    let spoken = 0
    let pulse = 0
    let started = false
    let speaking = true
    let settled = false
    const t0 = performance.now()

    const loop = () => {
      if (!speaking) return
      const t = (performance.now() - t0) / 1000
      const rhythm = 0.28 + 0.34 * Math.abs(Math.sin(t * 8.5)) * (0.6 + 0.4 * Math.sin(t * 2.3))
      pulse *= 0.86
      setLevel(rhythm + pulse * 0.45, Math.sin(t * 5.1) * 0.6)
      raf = requestAnimationFrame(loop)
    }

    return new Promise((resolve) => {
      let startWatchdog = 0
      let maxTimer = 0
      const done = () => {
        if (settled) return
        settled = true
        speaking = false
        clearTimeout(startWatchdog)
        clearTimeout(maxTimer)
        stopLoop()
        resolve()
      }
      cancelCurrent = () => { synth.cancel(); done() }

      // Some browsers/devices have no working voice and never fire onstart: do not hang the interview.
      startWatchdog = setTimeout(() => {
        if (started || settled) return
        synth.cancel()
        speaking = false
        settled = true
        clearTimeout(maxTimer)
        speakSilent(text, { onStart, onProgress }).then(resolve)
      }, 3000)
      // ...and never wait forever if speech stalls part-way (a known Chrome bug).
      maxTimer = setTimeout(done, Math.max(8000, text.split(/\s+/).length * 700 + 5000))

      synth.cancel()
      const voice = pickVoice()
      sentences.forEach((s, idx) => {
        const u = new SpeechSynthesisUtterance(s.trim())
        if (voice) u.voice = voice
        u.rate = 1
        u.pitch = gender === 'm' ? 0.95 : 1.05
        u.onstart = () => {
          if (!started) { started = true; onStart?.(); raf = requestAnimationFrame(loop) }
        }
        u.onboundary = (e) => {
          pulse = 1
          onProgress?.(clamp((spoken + (e.charIndex || 0)) / total, 0, 1))
        }
        u.onend = () => {
          spoken += s.length
          onProgress?.(clamp(spoken / total, 0, 1))
          if (idx === sentences.length - 1) done()
        }
        u.onerror = () => { if (idx === sentences.length - 1) done() }
        synth.speak(u)
      })
    })
  }

  // ---------------- no audio possible at all: still animate, then move on
  function speakSilent(text, { onStart, onProgress }) {
    const ms = Math.max(1800, text.split(/\s+/).length * 330)
    const t0 = performance.now()
    onStart?.()
    return new Promise((resolve) => {
      let done = false
      cancelCurrent = () => { done = true; stopLoop(); resolve() }
      const loop = () => {
        if (done) return
        const el = performance.now() - t0
        const t = el / 1000
        setLevel(0.25 + 0.35 * Math.abs(Math.sin(t * 8)), Math.sin(t * 4.7) * 0.5)
        onProgress?.(clamp(el / ms, 0, 1))
        if (el >= ms) { done = true; stopLoop(); resolve() } else raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    })
  }

  return {
    get mode() { return mode },
    async speak(text, handlers = {}) {
      cancelled = false
      if (mode === 'server') {
        try {
          await speakServer(text, handlers)
          return
        } catch (err) {
          if (cancelled) return
          console.warn('Server TTS failed, switching to the browser voice:', err)
          mode = 'browser' // stay on the browser voice for the rest of the session
        }
      }
      if (cancelled) return
      await speakBrowser(text, handlers)
    },
    cancel() {
      cancelled = true
      cancelCurrent()
      stopLoop()
      try { window.speechSynthesis?.cancel() } catch { /* noop */ }
    },
  }
}
