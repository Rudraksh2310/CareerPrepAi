// Tiny microphone level meter (drives the "you are speaking" ring and the lobby mic check).

export function createMicMeter(stream) {
  const AC = window.AudioContext || window.webkitAudioContext
  const tracks = stream?.getAudioTracks?.() || []
  if (!AC || !tracks.length) return { level: () => 0, close() {} }
  const ctx = new AC()
  const src = ctx.createMediaStreamSource(new MediaStream(tracks))
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  src.connect(analyser)
  const buf = new Float32Array(analyser.fftSize)
  return {
    /** 0..1 */
    level() {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      return Math.min(1, Math.sqrt(sum / buf.length) * 6)
    },
    close() {
      try { src.disconnect() } catch { /* noop */ }
      try { ctx.close() } catch { /* noop */ }
    },
  }
}
