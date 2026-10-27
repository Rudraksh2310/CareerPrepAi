import { useCallback, useEffect, useRef, useState } from 'react'
import { createMicMeter } from '../lib/mic'

const MIC_KEY = 'cpai_mic'
const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
const readSavedMic = () => { try { return localStorage.getItem(MIC_KEY) || '' } catch { return '' } }
const saveMic = (id) => { try { id ? localStorage.setItem(MIC_KEY, id) : localStorage.removeItem(MIC_KEY) } catch { /* not remembered */ } }
const audioWith = (id) => (id ? { ...AUDIO, deviceId: { exact: id } } : AUDIO)

// Camera + microphone for the call. Requests both; if there is no camera (or it is denied) falls back to
// audio only; if the microphone itself is unavailable the candidate can still type their answers.
//
// Microphone choice: `devices` lists the inputs the browser knows (labels only appear once permission is granted),
// `deviceId` is '' for "system default" or a specific input, and `selectMic(id)` swaps just the audio track, keeping
// the camera running. The choice is remembered in localStorage.
export default function useCallMedia() {
  const [stream, setStream] = useState(null)
  const [state, setState] = useState({ mic: 'pending', cam: 'pending', micMessage: '' })
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState('')
  const [deviceError, setDeviceError] = useState('')
  const streamRef = useRef(null)
  const meterRef = useRef(null)
  const micOnRef = useRef(true)
  const deviceIdRef = useRef('')
  micOnRef.current = micOn
  deviceIdRef.current = deviceId

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const inputs = all.filter((d) => d.kind === 'audioinput' && d.deviceId && !['default', 'communications'].includes(d.deviceId))
      setDevices(inputs.map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` })))
      return inputs.map((d) => d.deviceId)
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState({ mic: 'error', cam: 'error', micMessage: 'This browser cannot access a microphone (or the page is not on https / localhost). You can type your answers.' })
        return
      }
      let s = null
      let cam = 'ok'
      let used = readSavedMic()
      const video = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      const attempts = [[used, true], [used, false], ...(used ? [['', true], ['', false]] : [])]
      let lastErr = null
      for (const [id, withVideo] of attempts) {
        try {
          s = await navigator.mediaDevices.getUserMedia({ audio: audioWith(id), ...(withVideo ? { video } : {}) })
          used = id
          cam = withVideo ? 'ok' : 'error'
          break
        } catch (e) {
          lastErr = e
          if (e?.name === 'NotAllowedError') break // denied: retrying with other devices cannot help
        }
      }
      if (!s) {
        if (!cancelled) {
          const denied = lastErr?.name === 'NotAllowedError'
          setState({
            mic: 'error', cam: 'error',
            micMessage: denied ? 'Permission denied - allow the microphone in the address bar, or type your answers.' : 'No microphone found - you can type your answers.',
          })
        }
        return
      }
      if (cancelled) { s.getTracks().forEach((t) => t.stop()); return }
      streamRef.current = s
      meterRef.current = createMicMeter(s)
      setStream(s)
      setCamOn(cam === 'ok')
      if (used !== readSavedMic()) saveMic(used) // the remembered microphone is gone: forget it instead of failing on every visit
      setDeviceId(used)
      setState({ mic: 'ok', cam, micMessage: '' })
      refreshDevices() // labels are only available after permission was granted
    })()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      meterRef.current?.close()
      streamRef.current = null
    }
  }, [refreshDevices])

  const setMic = useCallback((on) => {
    setMicOn(on)
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = on })
  }, [])
  const setCam = useCallback((on) => {
    setCamOn(on)
    streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = on })
  }, [])
  const getLevel = useCallback(() => meterRef.current?.level() || 0, [])

  // Switch microphones: new audio track, same camera. '' = the system's default input.
  const selectMic = useCallback(async (id) => {
    setDeviceError('')
    const old = streamRef.current
    if (!old) return false
    let fresh
    try {
      fresh = await navigator.mediaDevices.getUserMedia({ audio: audioWith(id) })
    } catch (e) {
      setDeviceError(e?.name === 'NotAllowedError' ? 'Permission to use that microphone was denied.' : 'Could not use that microphone. It may be unplugged or in use by another app.')
      return false
    }
    fresh.getAudioTracks().forEach((t) => { t.enabled = micOnRef.current })
    const next = new MediaStream([...fresh.getAudioTracks(), ...old.getVideoTracks()])
    old.getAudioTracks().forEach((t) => t.stop())
    meterRef.current?.close()
    meterRef.current = createMicMeter(next)
    streamRef.current = next
    setStream(next)
    setDeviceId(id)
    saveMic(id)
    refreshDevices()
    return true
  }, [refreshDevices])

  // Headphones plugged in / unplugged: refresh the list, and fall back to the default if the chosen one vanished.
  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return undefined
    const onChange = async () => {
      const ids = await refreshDevices()
      if (deviceIdRef.current && !ids.includes(deviceIdRef.current)) selectMic('')
    }
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange)
  }, [refreshDevices, selectMic])

  return { stream, streamRef, state, micOn, camOn, setMic, setCam, getLevel, devices, deviceId, selectMic, deviceError }
}
