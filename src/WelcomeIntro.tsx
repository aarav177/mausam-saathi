import { useCallback, useEffect, useRef, useState } from 'react'
import PortalIcon from './PortalIcon'
import './welcome.css'

type Language = 'hi' | 'en' | 'hr'

type WelcomeCopy = {
  title: string
  description: string
  kicker: string
  features: [string, string, string]
  start: string
  listen: string
  listening: string
  speech: string
  voiceUnavailable: string
  stop: string
}

type Coverage = {
  districts: { name: string; village_count: number }[]
  district_count: number
  village_count: number
  is_live_forecast: boolean
}

const copy: Record<Language, WelcomeCopy> = {
  hi: {
    title: 'खेती के लिए स्मार्ट मौसम साथी।',
    description: 'गाँव के मौसम, फसल की स्थिति और आसान सलाह — सब एक जगह पर।',
    kicker: 'किसान मौसम साथी',
    features: ['गाँव का नक्शा', 'फसल की सलाह', 'हिंदी में पूछें'],
    start: 'शुरू करें',
    listen: 'परिचय सुनें',
    listening: 'आवाज़ चल रही है',
    speech: 'मौसम साथी में आपका स्वागत है। यहाँ आप अपने गाँव का नक्शा देख सकते हैं, फसल की स्थिति को समझ सकते हैं और हिंदी में सवाल पूछकर सरल सलाह पा सकते हैं। आगे बढ़ने के लिए, शुरू करें दबाएँ।',
    voiceUnavailable: 'आवाज़ शुरू नहीं हुई? परिचय सुनने के लिए बटन दबाएँ।',
    stop: 'रोकें',
  },
  en: {
    title: 'Weather intelligence for every farm.',
    description: 'Track village conditions, understand crop risk, and get reliable guidance in a language that feels local.',
    kicker: 'MAUSAM SAATHI FARMER PORTAL',
    features: ['Village map', 'Crop guidance', 'Voice support'],
    start: 'Get started',
    listen: 'Listen',
    listening: 'Speaking',
    speech: 'Welcome to Mausam Saathi. Explore your village map, understand crop risk, and ask questions in Hindi to get clear, local guidance. Select Get started to continue.',
    voiceUnavailable: 'If audio did not start, press Listen to hear the introduction.',
    stop: 'Stop',
  },
  hr: {
    title: 'खेती लई स्मार्ट मौसम समझ।',
    description: 'गाँव का मौसम, फसल की स्थिति अर सीधी सलाह — सब एक जगह।',
    kicker: 'किसान मौसम साथी',
    features: ['गाँव का नक्शा', 'फसल की सलाह', 'अपणी बोली में पूछो'],
    start: 'शुरू कराँ',
    listen: 'परिचय सुणो',
    listening: 'आवाज़ चालै सै',
    speech: 'मौसम साथी मैं आप सबका स्वागत सै। अपणे गाँव का नक्शा देखो, फसल की स्थिति समझो अर सीधी सलाह पाओ। आगे बढ़ण खातर, शुरू करो दबाओ।',
    voiceUnavailable: 'आवाज़ ना चालै तो परिचय सुणण खातर बटन दबाओ।',
    stop: 'रोक्को',
  },
}

function FarmIllustration() {
  return (
    <svg className="intro-landscape" viewBox="0 0 800 760" aria-hidden="true">
      <defs>
        <linearGradient id="intro-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c7e0e3" />
          <stop offset=".64" stopColor="#e8ead6" />
          <stop offset="1" stopColor="#f1e6bd" />
        </linearGradient>
        <linearGradient id="intro-field" x1="0" y1="0" x2=".9" y2="1">
          <stop offset="0" stopColor="#739d67" />
          <stop offset="1" stopColor="#244f3e" />
        </linearGradient>
        <linearGradient id="intro-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6e8d1" stopOpacity=".78" />
          <stop offset="1" stopColor="#84ad82" stopOpacity=".12" />
        </linearGradient>
        <radialGradient id="intro-sun-glow">
          <stop stopColor="#f8e5a6" stopOpacity=".82" />
          <stop offset="1" stopColor="#f8e5a6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="800" height="760" fill="url(#intro-sky)" />
      <circle cx="626" cy="157" r="130" fill="url(#intro-sun-glow)" />
      <circle cx="626" cy="157" r="39" fill="#f2d58b" />
      <g fill="#fff" opacity=".76">
        <path d="M108 167c0-20 17-36 38-36 11-24 47-25 60 0 21-4 38 11 38 31H108Z" />
        <path d="M347 116c0-13 11-24 25-24 8-17 34-17 42 1 14-3 26 8 26 23H347Z" opacity=".66" />
      </g>
      <path d="M0 362c111-82 211-92 316-21 94-79 214-87 315-16 61-38 119-38 169-17v143H0Z" fill="#a8c39c" />
      <path d="M0 418c116-75 229-66 343-5 117-69 266-64 457 7v97H0Z" fill="#829f76" />
      <path d="M0 481c151-71 280-58 408 2 138-59 254-45 392 13v264H0Z" fill="url(#intro-field)" />
      <path d="M0 494c138-53 257-40 388 15-128 26-239 87-388 127V494Z" fill="#91ae79" opacity=".78" />
      <path d="M0 603c150-43 289-99 416-94 148 5 254 51 384 91v160H0Z" fill="#315e45" opacity=".65" />
      <path d="M21 760c155-117 271-172 407-181 131-9 237 33 372 112" fill="none" stroke="url(#intro-water)" strokeWidth="18" />
      <g fill="none" stroke="#c7d591" strokeWidth="3" opacity=".62">
        <path d="M-55 532c158-68 283-61 441-2s268 67 475 28" />
        <path d="M-50 572c158-67 282-59 438-1s271 69 480 32" />
        <path d="M-42 614c157-64 278-56 432 3s274 72 485 38" />
        <path d="M-31 657c155-61 275-52 426 7s278 76 491 44" />
        <path d="M-17 703c153-58 271-48 419 12s282 80 495 50" />
      </g>
      <g transform="translate(102 347)">
        <path d="M0 58 62 12l67 46v72H0Z" fill="#ead9b7" />
        <path d="m-11 61 73-56 77 56" fill="none" stroke="#875f48" strokeWidth="11" strokeLinejoin="round" />
        <path d="M51 81h27v49H51z" fill="#8b674a" />
        <path d="M18 77h20v19H18zm73 0h20v19H91z" fill="#bed4cb" />
        <path d="M62 6V-12h25V26" fill="#ae7957" />
      </g>
      <g fill="#476f4d">
        <circle cx="86" cy="375" r="31" /><circle cx="133" cy="365" r="37" />
        <circle cx="745" cy="408" r="38" /><circle cx="704" cy="393" r="30" />
      </g>
      <g transform="translate(500 430)" stroke="#294b3a" strokeLinecap="round" strokeLinejoin="round">
        <path d="M27 29c-7-17-3-31 11-39 12 13 11 27 1 39" fill="#d5a46c" strokeWidth="4" />
        <path d="M19 27h40l-5 10H24Z" fill="#8a6840" strokeWidth="4" />
        <path d="m32 53-4 41m19-41 12 39" fill="none" strokeWidth="8" />
        <path d="m32 94-13 22m40-22 16 20" fill="none" strokeWidth="7" />
        <path d="M33 39c8-7 23-7 31 0l7 23-39 2-7-17Z" fill="#547d54" strokeWidth="4" />
        <path d="M68 47 89 73" fill="none" strokeWidth="5" />
        <path d="M91 72v24m-7-13h14" fill="none" stroke="#986e47" strokeWidth="4" />
      </g>
      <g fill="#c4d887" opacity=".8">
        <path d="M263 482c-17-22-14-46 4-68 19 25 20 47 4 69Zm25 9c-3-28 10-47 37-57 2 29-9 48-34 59Z" />
        <path d="M649 508c-19-19-20-42-4-67 21 22 24 43 9 67Zm27 9c-1-26 14-44 40-52 0 27-12 45-37 54Z" />
      </g>
    </svg>
  )
}

export default function WelcomeIntro({
  language,
  onLanguageChange,
  onComplete,
}: {
  language: Language
  onLanguageChange: (language: Language) => void
  onComplete: () => void
}) {
  const [speaking, setSpeaking] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState('')
  const [coverage, setCoverage] = useState<Coverage>()
  const autoSpeechAttempted = useRef(false)
  const narrationRef = useRef<HTMLAudioElement | null>(null)
  const current = copy[language]
  const areaText = coverage?.districts.map((district) => district.name).join(' · ') || 'Haryana, India'

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/coverage', { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<Coverage> : undefined)
      .then((result) => { if (result) setCoverage(result) })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  const stopSpeech = useCallback(() => {
    if (narrationRef.current) {
      narrationRef.current.pause()
      narrationRef.current.currentTime = 0
      narrationRef.current.onended = null
      narrationRef.current.onerror = null
      narrationRef.current = null
    }
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }, [])

  const readWelcome = useCallback(() => {
    autoSpeechAttempted.current = true
    setVoiceMessage('')
    stopSpeech()

    const speakWithBrowser = () => {
      if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
        setVoiceMessage(current.voiceUnavailable)
        return
      }
      const utterance = new SpeechSynthesisUtterance(current.speech)
      utterance.lang = language === 'en' ? 'en-IN' : 'hi-IN'
      utterance.rate = 0.88
      const voices = window.speechSynthesis.getVoices()
      const preferredVoice = voices.find((voice) => voice.lang.toLowerCase() === utterance.lang.toLowerCase())
        ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(language === 'en' ? 'en' : 'hi'))
      if (preferredVoice) utterance.voice = preferredVoice
      utterance.onstart = () => setSpeaking(true)
      utterance.onend = () => setSpeaking(false)
      utterance.onerror = (event) => {
        setSpeaking(false)
        if (event.error !== 'canceled' && event.error !== 'interrupted') setVoiceMessage(current.voiceUnavailable)
      }
      window.speechSynthesis.speak(utterance)
    }

    if (language !== 'en') {
      const narration = new Audio(`/audio/welcome-${language}.mp3`)
      narrationRef.current = narration
      let fallbackStarted = false
      const fallback = () => {
        if (fallbackStarted) return
        fallbackStarted = true
        if (narrationRef.current === narration) narrationRef.current = null
        speakWithBrowser()
      }
      narration.onplay = () => setSpeaking(true)
      narration.onended = () => {
        setSpeaking(false)
        if (narrationRef.current === narration) narrationRef.current = null
      }
      narration.onerror = fallback
      try {
        void narration.play().catch(fallback)
      } catch {
        fallback()
      }
      return
    }

    speakWithBrowser()
  }, [current, language, stopSpeech])

  useEffect(() => stopSpeech, [stopSpeech])

  useEffect(() => {
    if (autoSpeechAttempted.current) return
    const timer = window.setTimeout(() => {
      if (autoSpeechAttempted.current) return
      autoSpeechAttempted.current = true
      readWelcome()
    }, 700)
    return () => window.clearTimeout(timer)
  }, [readWelcome])

  return (
    <main className="intro-screen" lang={language === 'hr' ? 'hi' : language}>
      <header className="intro-header">
        <a className="intro-brand" href="#welcome" aria-label="Mausam Saathi home">
          <span className="intro-brand-mark"><PortalIcon name="plant" size={24} /></span>
          <span><strong>मौसम साथी</strong><small>किसान मौसम सलाह</small></span>
        </a>
        <div className="intro-header-actions">
          <label className="intro-language">
            <span className="sr-only">Choose language</span>
            <select aria-label="Language" value={language} onChange={(event) => {
              stopSpeech()
              onLanguageChange(event.target.value as Language)
              setVoiceMessage('')
            }}>
              <option value="hi">हिंदी</option>
              <option value="hr">हरियाणवी</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
      </header>

      <section className="intro-hero" id="welcome">
        <div className="intro-visual">
          <FarmIllustration />
          <div className="intro-location"><PortalIcon name="map" size={16} /><span>{areaText}</span></div>
          <ul className="intro-features" aria-label={current.kicker}>
            <li><PortalIcon name="map" size={18} />{current.features[0]}</li>
            <li><PortalIcon name="plant" size={18} />{current.features[1]}</li>
            <li><PortalIcon name="assistant" size={18} />{current.features[2]}</li>
          </ul>
        </div>

        <div className="intro-copy">
          <p className="intro-eyebrow"><span />{current.kicker}</p>
          <h1>{current.title}</h1>
          <p className="intro-description">{current.description}</p>

          <div className="intro-metrics" aria-label="Portal highlights">
            <div className="intro-stat">
              <strong>{coverage?.village_count ? `${coverage.village_count}+` : '281+'}</strong>
              <span>{language === 'en' ? 'Villages' : language === 'hi' ? 'गाँव' : 'गाँवां'}</span>
            </div>
            <div className="intro-stat">
              <strong>7–30</strong>
              <span>{language === 'en' ? 'day outlook' : language === 'hi' ? 'दिन का आउटलुक' : 'दिनों दी राय'}</span>
            </div>
            <div className="intro-stat">
              <strong>3</strong>
              <span>{language === 'en' ? 'languages' : language === 'hi' ? 'भाषाएँ' : 'भाशाएँ'}</span>
            </div>
          </div>

          <div className="intro-actions">
            <button className="intro-primary" type="button" onClick={onComplete}>
              {current.start}<PortalIcon name="arrow" size={18} />
            </button>
            <button className="intro-listen" type="button" onClick={speaking ? stopSpeech : readWelcome} aria-pressed={speaking}>
              <PortalIcon name={speaking ? 'stop' : 'sound'} size={18} />
              {speaking ? current.stop : current.listen}
            </button>
          </div>

          {voiceMessage && <p className="intro-voice-note" role="status">{voiceMessage}</p>}
        </div>
      </section>
    </main>
  )
}
