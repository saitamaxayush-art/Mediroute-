import { Mic, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { parseTriage, VOICE_LANGS, type ParsedTriage, type VoiceLang } from '../engine/voice'

interface SpeechResultEvent {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpeechResultEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionCtor = new () => Recognition

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function Waveform({ active }: { active: boolean }) {
  return (
    <svg width="64" height="20" viewBox="0 0 64 20" aria-hidden="true" className="shrink-0">
      {Array.from({ length: 13 }, (_, i) => (
        <rect
          key={i}
          x={i * 5}
          y={4}
          width="2"
          height="12"
          fill={active ? '#0B6B3A' : '#D9D2C3'}
          style={{
            transformOrigin: '50% 50%',
            transformBox: 'fill-box',
            animation: active ? `wave 900ms ${(i * 70) % 600}ms ease-in-out infinite alternate` : undefined,
            transform: active ? undefined : `scaleY(${0.25 + ((i * 7) % 5) / 10})`,
          }}
        />
      ))}
      <style>{'@keyframes wave{from{transform:scaleY(.2)}to{transform:scaleY(1)}}'}</style>
    </svg>
  )
}

export function VoiceTriage({ onParsed, big = false, primary = false, autoStart = false }: { onParsed: (p: ParsedTriage, text: string) => void; big?: boolean; primary?: boolean; autoStart?: boolean }) {
  const Ctor = getCtor()
  const [lang, setLang] = useState<VoiceLang>('en-IN')
  const [listening, setListening] = useState(false)
  const [text, setText] = useState('')
  const [typed, setTyped] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [matched, setMatched] = useState<string[]>([])
  const rec = useRef<Recognition | null>(null)
  const cb = useRef(onParsed)
  cb.current = onParsed

  useEffect(() => () => rec.current?.abort(), [])
  const started = useRef(false)
  useEffect(() => {
    if (autoStart && Ctor && !started.current) {
      started.current = true
      start()
    }
    // Start once when opened from the mic button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  const apply = (t: string) => {
    const p = parseTriage(t)
    setMatched(p.matched)
    cb.current(p, t)
  }

  const start = () => {
    if (!Ctor) return
    setErr(null)
    const r = new Ctor()
    r.lang = lang
    r.interimResults = true
    r.continuous = false
    let finalText = ''
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalText += res[0].transcript + ' '
        else interim += res[0].transcript
      }
      setText((finalText + interim).trim())
      if (finalText) apply(finalText)
    }
    r.onerror = (e) => {
      setErr(e.error === 'not-allowed' ? 'Microphone permission denied. Type instead.' : `Speech error: ${e.error}. Type instead.`)
      setListening(false)
    }
    r.onend = () => setListening(false)
    rec.current = r
    try {
      r.start()
      setListening(true)
    } catch {
      setErr('Could not start the microphone. Type instead.')
    }
  }
  const stop = () => {
    rec.current?.stop()
    setListening(false)
  }

  const h = big ? 'h-14' : 'h-10'
  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-[4px] border border-line bg-white p-1" role="radiogroup" aria-label="Voice language">
        {VOICE_LANGS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={lang === l.id}
            onClick={() => setLang(l.id)}
            className={`flex-1 rounded-[3px] text-[13px] font-medium ${big ? 'h-12' : 'h-9'} ${lang === l.id ? 'bg-route-soft text-route' : 'text-ink hover:text-route'}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      {Ctor ? (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={listening ? stop : start}
            aria-pressed={listening}
            className={`flex ${h} items-center gap-2 rounded-[4px] px-4 text-[14px] font-medium ${listening ? 'border border-signal text-signal' : primary ? 'bg-route text-white hover:bg-[#095a31]' : 'border border-line text-ink hover:border-route hover:text-route'}`}
          >
            {listening ? <Square size={15} aria-hidden /> : <Mic size={16} aria-hidden />}
            {listening ? 'Stop' : 'Speak triage'}
          </button>
          <Waveform active={listening} />
        </div>
      ) : null}
      {text && <p className="border-l-2 border-route bg-white px-3 py-2 text-[14px] italic text-ink-2">&ldquo;{text}&rdquo;</p>}
      {err && <p className="text-[13px] text-signal">{err}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (typed.trim()) apply(typed)
        }}
        className="flex gap-2"
      >
        <label className="sr-only" htmlFor={`triage-text-${big ? 'b' : 's'}`}>
          Type what the paramedic says
        </label>
        <input
          id={`triage-text-${big ? 'b' : 's'}`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={Ctor ? 'Or type what the paramedic says' : 'Type what the paramedic says'}
          className={`${h} min-w-0 flex-1 rounded-[4px] border border-line bg-white px-3 text-[14px] placeholder:text-ink-2 focus:border-ink focus:outline-none`}
        />
        <button type="submit" className={`${h} rounded-[4px] border border-line px-4 text-[14px] font-medium hover:border-route hover:text-route`}>
          Parse
        </button>
      </form>
      {matched.length > 0 && (
        <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-route">Filled from: {matched.join(', ')}</p>
      )}
    </div>
  )
}
