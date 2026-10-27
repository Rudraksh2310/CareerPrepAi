import { CamIcon, CamOffIcon, CcIcon, ChatIcon, CheckIcon, KeyboardIcon, MicIcon, MicOffIcon, PhoneOffIcon } from './icons'

function RoundBtn({ on = true, danger, label, onClick, disabled, children, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={typeof on === 'boolean' ? on : undefined}
      title={label}
      data-testid={testId}
      className={`flex h-11 w-11 items-center justify-center rounded-full text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#34C3AF] disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'bg-coral hover:brightness-110 w-14 rounded-full' : on ? 'bg-white/12 hover:bg-white/20' : 'bg-white/90 text-[#12151B] hover:bg-white'
      }`}
    >
      {children}
    </button>
  )
}

export default function ControlBar({
  micOn, camOn, captionsOn, transcriptOn, typeMode, listening, micAvailable, camAvailable, canSkip,
  onMic, onCam, onCaptions, onTranscript, onType, onDone, onSkip, onEnd,
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3" data-testid="control-bar">
      <RoundBtn on={micOn} label={micOn ? 'Mute microphone' : 'Unmute microphone'} onClick={onMic} disabled={!micAvailable} testId="btn-mic">
        {micOn ? <MicIcon /> : <MicOffIcon className="text-coral" />}
      </RoundBtn>
      <RoundBtn on={camOn} label={camOn ? 'Turn camera off' : 'Turn camera on'} onClick={onCam} disabled={!camAvailable} testId="btn-cam">
        {camOn ? <CamIcon /> : <CamOffIcon className="text-coral" />}
      </RoundBtn>
      <RoundBtn on={captionsOn} label={captionsOn ? 'Hide captions' : 'Show captions'} onClick={onCaptions} testId="btn-captions"><CcIcon /></RoundBtn>
      <RoundBtn on={typeMode} label={typeMode ? 'Switch back to voice' : 'Type your answer instead'} onClick={onType} testId="btn-type"><KeyboardIcon /></RoundBtn>
      <RoundBtn on={transcriptOn} label={transcriptOn ? 'Hide transcript' : 'Show transcript'} onClick={onTranscript} testId="btn-transcript"><ChatIcon /></RoundBtn>

      {listening && !typeMode && (
        <button
          type="button"
          onClick={onDone}
          data-testid="btn-done"
          className="flex h-11 items-center gap-2 rounded-full bg-amber px-5 text-sm font-semibold text-[#2A1600] transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <CheckIcon width={18} height={18} /> I&apos;m done answering
        </button>
      )}
      {canSkip && (
        <button
          type="button"
          onClick={onSkip}
          data-testid="btn-skip"
          className="h-11 rounded-full bg-white/12 px-4 text-sm text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#34C3AF]"
        >
          Skip ahead
        </button>
      )}

      <RoundBtn danger label="End interview" onClick={onEnd} testId="btn-end"><PhoneOffIcon /></RoundBtn>
    </div>
  )
}
