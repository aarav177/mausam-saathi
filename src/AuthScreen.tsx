import { useState, type FormEvent } from 'react'

import PortalIcon from './PortalIcon'

type Language = 'hi' | 'en' | 'hr'

const copy = {
  hi: {
    eyebrow: 'मौसम साथी • किसान सहायता',
    title: 'आपका स्वागत है',
    registerTitle: 'किसान खाता बनाएँ',
    subtitle: 'अपना स्थानीय खाता बनाएँ या साइन इन करें।',
    registerSubtitle: 'शुरू करने के लिए केवल नाम, यूज़रनेम और पासवर्ड चाहिए।',
    fullName: 'आपका नाम',
    username: 'यूज़रनेम',
    password: 'पासवर्ड',
    phone: 'मोबाइल नंबर (वैकल्पिक)',
    phoneHelp: 'SMS अलर्ट के लिए मोबाइल नंबर सत्यापित होगा।',
    alertOptIn: 'मोबाइल नंबर सत्यापित करने के बाद SMS अलर्ट पाने की सहमति है',
    alertsNotReady: 'SMS अलर्ट अभी चालू नहीं हैं।',
    signIn: 'साइन इन',
    register: 'खाता बनाएँ',
    switchToRegister: 'नया खाता बनाएँ',
    switchToLogin: 'पहले से खाता है? साइन इन करें',
    newPassword: 'कम से कम 12 अक्षर का पासवर्ड रखें।',
    secureNote: 'आपका खाता इसी कंप्यूटर पर सुरक्षित रूप से सहेजा जाता है।',
    loading: 'कृपया प्रतीक्षा करें…',
    backendUnavailable:
      'सर्वर से संपर्क नहीं हो रहा। पोर्टल फ़ोल्डर में backend चालू करें, फिर दोबारा कोशिश करें। आपका खाता अभी नहीं बना है।',
  },
  en: {
    eyebrow: 'MAUSAM SAATHI • FARMER SUPPORT',
    title: 'Welcome back',
    registerTitle: 'Create your farmer account',
    subtitle: 'Sign in or create your local farmer account.',
    registerSubtitle: 'To get started, you only need a name, username, and password.',
    fullName: 'Your name',
    username: 'Username',
    password: 'Password',
    phone: 'Mobile number (optional)',
    phoneHelp: 'Your mobile number will be verified before SMS alerts can be sent.',
    alertOptIn: 'I agree to receive SMS alerts after verifying my phone number',
    alertsNotReady: 'SMS alerts are not active yet.',
    signIn: 'Sign in',
    register: 'Create account',
    switchToRegister: 'Create a new account',
    switchToLogin: 'Already have an account? Sign in',
    newPassword: 'Use a password with at least 12 characters.',
    secureNote: 'Your account is securely stored on this computer.',
    loading: 'Please wait…',
    backendUnavailable:
      'The backend server is not responding. Start it from the portal folder, then try again. Your account has not been created yet.',
  },
  hr: {
    eyebrow: 'मौसम साथी • किसान की मदद',
    title: 'राम-राम, फेर तै स्वागत सै',
    registerTitle: 'किसान खाता बणाओ',
    subtitle: 'खाता खोलो या आपणे खाते मैं साइन इन करो।',
    registerSubtitle: 'शुरू करण खातर नाम, यूज़रनेम अर पासवर्ड चाहिए।',
    fullName: 'थारा नाम',
    username: 'यूज़रनेम',
    password: 'पासवर्ड',
    phone: 'मोबाइल नंबर (जरूरी ना सै)',
    phoneHelp: 'SMS अलर्ट खातर मोबाइल नंबर सत्यापित होवैगा।',
    alertOptIn: 'मोबाइल नंबर सत्यापित कराण पाछै SMS अलर्ट खातर मेरी सहमति सै',
    alertsNotReady: 'SMS अलर्ट अभी चालू ना सैं।',
    signIn: 'साइन इन',
    register: 'खाता बणाओ',
    switchToRegister: 'नया खाता बणाओ',
    switchToLogin: 'खाता सै? साइन इन करो',
    newPassword: 'पासवर्ड मैं कम तै कम 12 अक्षर रखो।',
    secureNote: 'थारा खाता इसी कंप्यूटर पै सुरक्षित रहवै सै।',
    loading: 'जरा रुक्को…',
    backendUnavailable:
      'सर्वर तै संपर्क ना होया। पोर्टल फोल्डर मैं backend चालू करके फेर कोशिश करो। खाता अभी ना बण्या सै।',
  },
}

async function authRequest(
  path: string,
  username: string,
  password: string,
  backendUnavailable: string,
  profile?: { full_name: string; phone_number: string; sms_alert_opt_in: boolean },
): Promise<{
  username: string
  full_name?: string
  phone_number?: string | null
  sms_alert_opt_in?: boolean
}> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, ...profile }),
    })
  } catch {
    throw new Error(backendUnavailable)
  }
  const responseText = await response.text()
  type AuthResponse = {
    detail?: string | { message?: string }
    username?: string
    full_name?: string
    phone_number?: string | null
    sms_alert_opt_in?: boolean
    authenticated?: boolean
  }
  let body: AuthResponse | null = null
  try {
    const parsed: unknown = JSON.parse(responseText)
    if (typeof parsed === 'object' && parsed !== null) {
      body = parsed as AuthResponse
    }
  } catch {
    if (response.ok) {
      throw new Error(backendUnavailable)
    }
  }
  if (!response.ok && [502, 503, 504].includes(response.status)) {
    throw new Error(backendUnavailable)
  }
  if (!response.ok) {
    const detail = body?.detail
    throw new Error(
      typeof detail === 'string'
        ? detail
        : detail?.message || `Request failed (${response.status})`,
    )
  }
  if (!body?.authenticated || !body.username) {
    throw new Error('The server response did not include a signed-in account.')
  }
  return {
    username: body.username,
    full_name: body.full_name,
    phone_number: body.phone_number,
    sms_alert_opt_in: body.sms_alert_opt_in,
  }
}

export default function AuthScreen({
  language,
  onLanguageChange,
  onAuthenticated,
}: {
  language: Language
  onLanguageChange: (language: Language) => void
  onAuthenticated: (account: {
    username: string
    full_name?: string
    phone_number?: string | null
    sms_alert_opt_in?: boolean
  }) => void
}) {
  const t = copy[language]
  const [isRegistering, setIsRegistering] = useState(false)
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [smsAlertOptIn, setSmsAlertOptIn] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await authRequest(
        isRegistering ? '/api/auth/register' : '/api/auth/login',
        username,
        password,
        t.backendUnavailable,
        isRegistering
          ? {
              full_name: fullName,
              phone_number: phoneNumber,
              sms_alert_opt_in: smsAlertOptIn,
            }
          : undefined,
      )
      onAuthenticated(result)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not sign in. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-screen" lang={language === 'hr' ? 'bgc' : language}>
      <div className="auth-language">
        <label htmlFor="auth-language">Language</label>
        <select
          id="auth-language"
          value={language}
          onChange={(event) => onLanguageChange(event.target.value as Language)}
        >
          <option value="hi">हिंदी</option>
          <option value="en">English</option>
          <option value="hr">हरियाणवी</option>
        </select>
      </div>
      <section className="auth-card">
        <div className="auth-mark" aria-hidden="true"><PortalIcon name="plant" size={32} /></div>
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{isRegistering ? t.registerTitle : t.title}</h1>
        <p className="auth-subtitle">
          {isRegistering ? t.registerSubtitle : t.subtitle}
        </p>
        <form onSubmit={(event) => void submit(event)}>
          {isRegistering && (
            <label>
              <span>{t.fullName}</span>
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                minLength={2}
                maxLength={80}
                required
              />
            </label>
          )}
          <label>
            <span>{t.username}</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_-]+"
              required
            />
          </label>
          {isRegistering && (
            <>
              <label>
                <span>{t.phone}</span>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+91 98765 43210"
                  maxLength={24}
                />
                <small className="password-hint">{t.phoneHelp}</small>
              </label>
              <label className="sms-opt-in">
                <input
                  type="checkbox"
                  checked={smsAlertOptIn}
                  onChange={(event) => setSmsAlertOptIn(event.target.checked)}
                />
                <span>{t.alertOptIn}</span>
              </label>
              <small className="password-hint">{t.alertsNotReady}</small>
            </>
          )}
          <label>
            <span>{t.password}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isRegistering ? 'new-password' : 'current-password'}
              minLength={isRegistering ? 12 : 1}
              maxLength={256}
              required
            />
          </label>
          {isRegistering && <small className="password-hint">{t.newPassword}</small>}
          {error && <div className="alert error" role="alert">{error}</div>}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? t.loading : isRegistering ? t.register : t.signIn}
            {!busy && <PortalIcon name="arrow" size={17} />}
          </button>
        </form>
        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            setIsRegistering((current) => !current)
            setError('')
          }}
        >
          {isRegistering ? t.switchToLogin : t.switchToRegister}
        </button>
        <p className="auth-secure"><PortalIcon name="lock" size={15} />{t.secureNote}</p>
      </section>
    </main>
  )
}

