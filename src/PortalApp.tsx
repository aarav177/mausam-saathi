import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  GeoJSON,
  MapContainer,
  TileLayer,
  useMap,
} from 'react-leaflet'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { Layer, PathOptions } from 'leaflet'
import AuthScreen from './AuthScreen'
import PortalIcon, { type PortalIconName } from './PortalIcon'
import WelcomeIntro from './WelcomeIntro'
import 'leaflet/dist/leaflet.css'

type Language = 'hi' | 'en' | 'hr'
type CropName = 'paddy' | 'wheat' | 'mustard' | 'cotton' | 'maize'
type CropStage = 'nursery' | 'sowing' | 'vegetative' | 'flowering' | 'harvest'
type PortalPage =
  | 'home'
  | 'dashboard'
  | 'weather'
  | 'assistant'
  | 'notifications'
  | 'profile'
type EventName = 'break' | 'onset' | 'revival'
type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY HIGH'
type Village = {
  village_id: string
  village_name: string
  district?: string
  latitude: number
  longitude: number
}
type NotificationStatus = {
  sms_configured: boolean
  sms_enabled: boolean
  test_mode: boolean
  live_delivery_available: boolean
  opted_in: boolean
  phone_number: string | null
  phone_verified: boolean
  otp_pending: boolean
  eligible_for_alerts: boolean
  messages: Array<{ id: string; recipient: string; message: string; status: string; provider_id: string | null; created_at: string }>
}
type EventRisk = {
  probability: number
  risk_level: RiskLevel
  model: string
  model_version: string
  reference_date: string
} | null
type Outlook = {
  village: Village
  horizon_days: number
  reference_date: string
  rainfall_reference_date: string
  dataset_split: string
  is_live_forecast: false
  events: Record<EventName, EventRisk>
  historical_modelled_rainfall_mm: number | null
  rainfall_note: string
  source_note: string
}
type VillageMapRisk = { village_id: string; probability: number; risk_level: RiskLevel }
type VillageRiskMap = {
  event: EventName
  horizon_days: number
  reference_date: string | null
  available_villages: number
  total_villages: number
  dataset_split: 'recent'
  is_live_forecast: false
  risks: VillageMapRisk[]
}
type BoundaryProperties = {
  village_id?: string
  Vill_name?: string
}
type BoundaryCollection = FeatureCollection<Geometry, BoundaryProperties>
type ChatEntry = { role: 'user' | 'assistant'; content: string }
type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

const horizons = [7, 14, 21, 30] as const

const mapText: Record<Language, { legend: string; asOf: string; coverage: (available: number, total: number) => string; unavailable: string; noRecords: string; noData: string }> = {
  hi: { legend: 'गाँवों का जोखिम', asOf: 'मॉडल डेटा तारीख', coverage: (available, total) => `${available}/${total} गाँव`, unavailable: 'नक्शे का डेटा लोड नहीं हो पाया। दोबारा प्रयास करें।', noRecords: 'इस अवधि के लिए रिकॉर्ड उपलब्ध नहीं हैं। अवधि बदलकर देखें।', noData: 'डेटा नहीं' },
  en: { legend: 'Village risk', asOf: 'Model data date', coverage: (available, total) => `${available} of ${total} villages`, unavailable: 'Map data could not load. Please try again.', noRecords: 'No records for this period. Try another period.', noData: 'No data' },
  hr: { legend: 'गाँव का जोखिम', asOf: 'मॉडल डेटा की तारीख', coverage: (available, total) => `${available}/${total} गाँव`, unavailable: 'नक्शे का डेटा नहीं खुला। फिर से कोशिश करें।', noRecords: 'इस समय का रिकॉर्ड नहीं मिला। दूसरी अवधि चुनें।', noData: 'डेटा नहीं' },
}
const riskLabels: Record<Language, Record<RiskLevel, string>> = {
  hi: {
    LOW: 'कम',
    MODERATE: 'मध्यम',
    HIGH: 'ज़्यादा',
    'VERY HIGH': 'बहुत ज़्यादा',
  },
  en: {
    LOW: 'Low',
    MODERATE: 'Moderate',
    HIGH: 'High',
    'VERY HIGH': 'Very high',
  },
  hr: {
    LOW: 'कम',
    MODERATE: 'ठीक-ठाक',
    HIGH: 'ज्यादा',
    'VERY HIGH': 'बहुत ज्यादा',
  },
}
const cropGuidance: Record<
  Language,
  Record<CropName, string> & Record<CropStage, string>
> = {
  hi: {
    paddy: 'धान: खेत की नमी और मेड़ में रिसाव देखें। पानी कब देना है, यह अपने खेत की हालत और स्थानीय कृषि सलाह के अनुसार तय करें।',
    wheat: 'गेहूँ: खेत में पानी जमा तो नहीं है देखें। सिंचाई का समय फसल की अवस्था और स्थानीय सलाह से तय करें।',
    mustard: 'सरसों: मिट्टी की नमी देखें और जरूरत से ज्यादा पानी से बचें। अपने खेत की हालत देखकर फैसला करें।',
    cotton: 'कपास: पत्तियों और तने को नियमित देखें। कोई कीट या नुकसान दिखे तो पहले पहचान पक्की करें और KVK से सलाह लें।',
    maize: 'मक्का: खेत की नमी और पानी निकलने का रास्ता देखें। सिंचाई का फैसला खेत की हालत देखकर करें।',
    nursery: 'नर्सरी/बुवाई से पहले: बीज और खेत की तैयारी की जानकारी नजदीकी कृषि केंद्र से पक्की करें।',
    sowing: 'बुवाई/रोपाई: बुवाई का समय और तरीका स्थानीय कृषि सलाह से मिलाएँ; जल्दबाजी में फैसला न करें।',
    vegetative: 'बढ़त के समय: पत्ते, मिट्टी की नमी और खेत में पानी जमा होने की स्थिति देखते रहें।',
    flowering: 'फूल/दाना बनते समय: फसल पर ध्यान रखें। पानी या खाद का फैसला करने से पहले खेत देखें और स्थानीय सलाह लें।',
    harvest: 'कटाई के पास: फसल की तैयारी और मौसम की ताजा जानकारी देखकर कटाई व भंडारण की योजना बनाएँ।',
  },
  en: {
    paddy: 'Paddy: check field moisture and bunds for leaks. Decide irrigation from field conditions and local advice.',
    wheat: 'Wheat: check that water is not standing in the field. Time irrigation for the crop stage using local advice.',
    mustard: 'Mustard: check soil moisture and avoid unnecessary watering. Decide from your field conditions.',
    cotton: 'Cotton: inspect leaves and stems regularly. If you notice pest damage, identify it first and ask your KVK.',
    maize: 'Maize: check soil moisture and that water can drain from the field. Decide irrigation from field conditions.',
    nursery: 'Before sowing: confirm seed and field-preparation guidance with your local agriculture office.',
    sowing: 'Sowing/transplanting: check local guidance on timing and method before you begin.',
    vegetative: 'During growth: keep an eye on leaves, soil moisture, and any standing water.',
    flowering: 'During flowering/grain formation: check the crop closely; confirm water or nutrient decisions with local advice.',
    harvest: 'Near harvest: plan harvest and storage after checking crop readiness and a current local forecast.',
  },
  hr: {
    paddy: 'धान: खेत की नमी अर मेड़ देखो। पानी कब देणा सै, यो खेत की हालत अर स्थानीय सलाह तै तय करो।',
    wheat: 'गेहूँ: खेत मैं पानी खड़ा तो ना सै, देखो। सिंचाई का टैम फसल की अवस्था अर सलाह तै तय करो।',
    mustard: 'सरसों: मिट्टी की नमी देखो अर बिना जरूरत पानी ना दो। फैसला खेत की हालत देख कै करो।',
    cotton: 'कपास: पत्ते अर तना देखते रहो। कीड़े का नुकसान दिखे तो पहले पहचान पक्की करो अर KVK तै पूछो।',
    maize: 'मक्का: खेत की नमी अर पानी निकास देखो। सिंचाई खेत की हालत देख कै करो।',
    nursery: 'बुवाई तै पहले: बीज अर खेत की तैयारी की बात नजदीकी कृषि केंद्र तै पक्की कर लो।',
    sowing: 'बुवाई/रोपाई: टैम अर तरीका स्थानीय सलाह तै मिला कै चालो।',
    vegetative: 'बढ़त के टैम: पत्ते, मिट्टी की नमी अर खेत मैं खड़े पानी पै नजर राखो।',
    flowering: 'फूल/दाना बणते टैम: फसल देखो; पानी या खाद का फैसला खेत देख कै सलाह ले कै करो।',
    harvest: 'कटाई नजदीक: फसल की तैयारी अर ताजा मौसम देख कै कटाई-भंडारण की सोचो।',
  },
}

const translationsBase = {
  hi: {
    subtitle: 'किसान मौसम एवं फसल सहायता',
    historical: 'ऐतिहासिक मॉडल परिणाम • लाइव पूर्वानुमान नहीं',
    historicalDetail:
      'यह 2025 तक के मॉडल मूल्यांकन परिणाम हैं। इन्हें आज का मौसम या सरकारी चेतावनी न मानें।',
    village: 'गाँव चुनें',
    district: 'ज़िला',
    horizon: 'समयावधि',
    map: 'गाँवों का नक्शा',
    mapHelp:
      'सीमा पर क्लिक करके गाँव चुनें। मानचित्र OpenStreetMap टाइल और परियोजना की गाँव सीमाओं का उपयोग करता है।',
    mapLoading: 'गाँव की सीमाएँ लोड हो रही हैं…',
    mapMissing: 'मानचित्र डेटा उपलब्ध नहीं है। API चालू है या नहीं जाँचें।',
    mapEvent: 'मानचित्र पर जोखिम परत',
    break: 'सूखा अंतराल / Monsoon break',
    onset: 'वर्षा आरंभ संकेत (परियोजना प्रॉक्सी)',
    revival: 'सूखे के बाद वर्षा वापसी',
    rainfall: 'पुराने मॉडल का अवधि-भर का वर्षा अनुमान',
    mm: 'मिमी',
    noOutput: 'इस अवधि का परिणाम उपलब्ध नहीं',
    modelRisk: 'मॉडल संभावना',
    reference: 'जोखिम की ऐतिहासिक संदर्भ तिथि',
    model: 'मॉडल',
    advisory: 'किसान AI सहायक',
    advisoryHelp:
      'फसल, सिंचाई, मौसम संकेत या खेती से जुड़ा प्रश्न पूछें। उत्तर में उपलब्ध मॉडल परिणामों का संदर्भ होगा।',
    crop: 'फसल',
    stage: 'फसल की अवस्था',
    ask: 'अपना प्रश्न लिखें',
    send: 'पूछें',
    thinking: 'जवाब तैयार हो रहा है…',
    assistantHello:
      'नमस्ते! मैं आपकी फसल और गाँव के हिसाब से आसान खेती-सलाह दे सकता हूँ। फसल या खेत की परेशानी बताइए।',
    suggested: [
      'मेरे गाँव के 14 दिन के जोखिम का क्या अर्थ है?',
      'धान की फसल में पानी बचाने के सामान्य तरीके?',
      'इस जानकारी से क्या तय नहीं किया जा सकता?',
    ],
    aiUnavailable:
      'AI सेवा उपलब्ध नहीं है। सर्वर चालू करें और नई API key को केवल backend .env में जोड़ें।',
    apiUnavailable: 'स्थानीय सर्वर से संपर्क नहीं हो रहा। कृपया backend और portal चालू करें, फिर दोबारा कोशिश करें।',
    dataUnavailable: 'परियोजना के परिणाम अभी लोड नहीं हुए।',
    chooseCrop: 'फसल चुनें',
    chooseStage: 'अवस्था चुनें',
    paddy: 'धान',
    wheat: 'गेहूँ',
    mustard: 'सरसों',
    cotton: 'कपास',
    maize: 'मक्का',
    nursery: 'नर्सरी / बुवाई से पहले',
    sowing: 'बुवाई / रोपाई',
    vegetative: 'वृद्धि अवस्था',
    flowering: 'फूल / दाना बनना',
    harvest: 'कटाई के निकट',
    disclaimer:
      'AI की सामान्य सलाह कृषि अधिकारी/KVK की सलाह का विकल्प नहीं है। रसायन या दवा की मात्रा AI से तय न करें।',
    blocks:
      'ब्लॉक सीमाएँ अभी उपलब्ध नहीं हैं; ऐप गाँवों के नाम या ब्लॉक का अनुमान नहीं लगाएगा।',
    online: 'स्थानीय API जुड़ा है',
    offline: 'API से संपर्क नहीं हुआ',
    loading: 'लोड हो रहा है…',
    prob: 'संभावना',
    tileCredit: '© OpenStreetMap contributors',
    clear: 'चैट साफ़ करें',
    emptyQuestion: 'पहले अपना प्रश्न लिखें।',
    sourceNote: 'डेटा: उपलब्ध क्षेत्र के ऐतिहासिक मौसम मॉडल परिणाम',
    riskBandNote: 'जोखिम स्तर परियोजना के शुरुआती thresholds हैं; ये आधिकारिक IMD चेतावनी नहीं हैं।',
    heavyRainLimit: 'भारी बारिश का जोखिम इस मॉडल में उपलब्ध नहीं है। 2023 के validation data में भारी बारिश के positive cases नहीं थे, इसलिए इसे प्रशिक्षित या नक्शे पर नहीं दिखाया गया।',
    spatialLimit: 'यह गाँव-स्तर का अनुमान निकटतम IMD 0.25° वर्षा ग्रिड पर आधारित है। पास के गाँव एक ही ग्रिड साझा कर सकते हैं; प्रमाणित ब्लॉक सीमाएँ उपलब्ध नहीं हैं।',
    navHome: 'मुख्य पृष्ठ',
    navDashboard: 'डैशबोर्ड',
    navWeather: 'मौसम जानकारी',
    navAssistant: 'किसान सहायक',
    navNotifications: 'सूचनाएँ',
    navProfile: 'मेरी जानकारी',
    homeHeading: 'आज आपके खेत के लिए क्या देखना है?',
    homeDescription: 'अपना गाँव, फसल और अवस्था चुनें। फिर अपने खेत के लिए आसान सलाह लें।',
    homeStartTitle: 'पहले अपना गाँव चुनें',
    homeStartHelp: 'गाँव का नक्शा और उपलब्ध ऐतिहासिक मॉडल जानकारी खोलें।',
    homeStartButton: 'गाँव का नक्शा खोलें',
    homeFarmTitle: 'अपने खेत के लिए सलाह पाएँ',
    homeFarmHelp: 'गाँव, फसल और अवस्था चुनें। खेत की परेशानी बताना चाहें तो लिखें।',
    fieldConcern: 'खेत में क्या दिख रहा है? (वैकल्पिक)',
    fieldConcernPlaceholder: 'जैसे: पत्ते पीले हैं, मिट्टी सूखी लग रही है',
    getFarmAdvice: 'मेरे खेत की सलाह दें',
    farmAdviceLoading: 'आपके लिए सलाह तैयार हो रही है…',
    farmAdviceTitle: 'आपके खेत के लिए AI सलाह',
    dailyPlanNotice: 'नीचे हर दिन के लिए खेत-जाँच की सामान्य योजना है। अभी उपलब्ध डेटा रोज़ का मौसम पूर्वानुमान नहीं देता।',
    homeDashboard: 'गाँव का डैशबोर्ड',
    homeDashboardHelp: 'नक्शे पर अपना गाँव और आसपास की सीमाएँ देखें।',
    homeWeather: 'मौसम मॉडल जानकारी',
    homeWeatherHelp: 'ऐतिहासिक वर्षा और जोखिम संकेत समझें।',
    homeAssistant: 'किसान सहायक से पूछें',
    homeAssistantHelp: 'फसल, सिंचाई और खेती के सामान्य सवाल पूछें।',
    homeNotifications: 'सूचनाएँ और अलर्ट',
    homeNotificationsHelp: 'अपनी अलर्ट पसंद देखें। SMS सुविधा अभी शुरू नहीं है।',
    pageDashboardTitle: 'आपका गाँव डैशबोर्ड',
    pageWeatherTitle: 'मौसम मॉडल जानकारी',
    pageAssistantTitle: 'खेती के सवाल पूछें',
    pageNotificationsTitle: 'सूचना और अलर्ट',
    pageProfileTitle: 'मेरी जानकारी',
    profileDescription: 'अपना नाम और वैकल्पिक मोबाइल नंबर अपडेट करें।',
    profileName: 'आपका नाम',
    profilePhone: 'मोबाइल नंबर (वैकल्पिक)',
    saveProfile: 'जानकारी सहेजें',
    profileSaved: 'आपकी जानकारी सहेज दी गई।',
    smsConfigured: 'SMS credentials और DLT values मौजूद हैं',
    smsNotConfigured: 'SMS credentials या DLT values अधूरे हैं',
    smsEnabled: 'SMS चालू है',
    smsDisabled: 'SMS बंद है',
    smsTestMode: 'टेस्ट मोड: संदेश केवल सिम्युलेट होंगे, भेजे नहीं जाएँगे',
    phoneVerified: 'मोबाइल नंबर सत्यापित है',
    phoneNotVerified: 'SMS अलर्ट पाने के लिए मोबाइल नंबर सत्यापित करें',
    sendOtp: 'सत्यापन कोड भेजें',
    resendOtp: 'कोड फिर भेजें',
    verifyOtp: 'कोड सत्यापित करें',
    otpLabel: 'छह अंकों का सत्यापन कोड',
    otpSent: 'अनुरोध स्वीकार हुआ। सहेजे गए नंबर पर कोड आए तो भरें।',
    savePhoneFirst: 'सत्यापन माँगने से पहले मोबाइल नंबर सहेजें।',
    latestMessageStatus: 'पिछले संदेश की स्थिति',
    testMessageLabel: 'टेस्ट संदेश (अधिकतम 30 अक्षर)',
    sendTestSms: 'टेस्ट SMS भेजें',
    messageSubmitted: 'प्रदाता ने संदेश स्वीकार किया; डिलीवरी की पुष्टि नहीं है।',
    messageSimulated: 'सिम्युलेशन सहेजा गया। कोई SMS नहीं भेजा गया।',
    smsDemoTitle: 'SMS डेमो • सिम्युलेटेड',
    smsDemoDescription: 'Palwal के नमूना मौसम पर किसान अलर्ट बनाकर ऐप में फोन नोटिफिकेशन देखें। credentials या internet की जरूरत नहीं; फोन पर SMS नहीं जाएगा।',
    demoMobileLabel: 'डेमो भारतीय मोबाइल नंबर',
    sendDemoSms: 'Send Test SMS',
    demoPreview: 'स्मार्टफोन नोटिफिकेशन पूर्वावलोकन',
    demoHistory: 'डेमो संदेश इतिहास',
    demoSent: 'Simulated SMS Sent',
    demoEmpty: 'अभी कोई डेमो संदेश नहीं। प्रस्तुति के लिए पहला SMS बनाएँ।',
    accountUsername: 'यूज़रनेम',
    notificationStatus: 'SMS सूचना सेवा की स्थिति',
    notificationDetail: 'नीचे SMS सेटअप की स्थिति दी गई है। अपने-आप मौसम अलर्ट के लिए भरोसेमंद लाइव मौसम स्रोत भी चाहिए।',
    notificationWhatWorks: 'अभी आप क्या देख सकते हैं',
    notificationFeatureOne: 'गाँव चुनकर पुराने मौसम मॉडल के संकेत देखें।',
    notificationFeatureTwo: 'फसल और बढ़वार का चरण चुनकर सामान्य खेत-जाँच सुझाव पाएँ।',
    notificationSetup: 'भरोसेमंद लाइव मौसम स्रोत और अलर्ट नियम जुड़ने तक अपने-आप मौसम अलर्ट उपलब्ध नहीं हैं।',
    notificationPreference: 'सत्यापन के बाद SMS अलर्ट पाने के लिए मेरी सहमति है',
    notificationInterestNote: 'SMS अलर्ट पाने के लिए सत्यापित नंबर और चालू सेवा जरूरी है। आप कभी भी सहमति वापस ले सकते हैं।',
    noNotifications: 'अभी कोई नई सूचना नहीं है।',
    goToProfile: 'अलर्ट पसंद बदलें',
    backHome: 'मुख्य पृष्ठ',
    speakPage: 'यह पन्ना सुनें',
    stopSpeaking: 'आवाज़ रोकें',
    voiceUnavailable: 'इस ब्राउज़र में आवाज़ की सुविधा उपलब्ध नहीं है।',
    askByVoice: 'बोलकर पूछें',
    stopListening: 'सुनना रोकें',
    voiceListening: 'सुन रहा है… अब अपना सवाल बोलें',
    voicePermission: 'माइक की अनुमति दें, फिर दोबारा कोशिश करें।',
    voiceTryAgain: 'आवाज़ साफ़ नहीं सुनाई दी। फिर से बोलें।',
    listenAnswer: 'जवाब सुनें',
    stopAnswer: 'जवाब रोकें',
    recommendations: 'आपकी फसल के लिए आसान सुझाव',
    recommendationsIntro: 'गाँव और समयावधि ऊपर चुनें। फसल, अवस्था और खेत की जानकारी भरते ही OpenRouter से रोज़ की खेत-जाँच सलाह मिलेगी।',
    recommendationNote: 'ये सामान्य सुझाव हैं। नीचे का मौसम मॉडल पुराना है—आज की बारिश की पक्की खबर नहीं। सिंचाई या दवा का फैसला ताजा मौसम और स्थानीय कृषि सलाह से करें।',
    understandRisk: 'इसका आसान मतलब',
    riskExplanation: 'यह प्रतिशत चुनी हुई अवधि में इस घटना की मॉडल-अनुमानित संभावना है। यह मॉडल का भरोसा, आज का मौसम या पक्की भविष्यवाणी नहीं है। डेटा ऐतिहासिक है; खेत का फैसला करने से पहले ताज़ा स्थानीय मौसम और खेत की हालत देखें।',
    dashboardGuideTitle: 'इस जानकारी से खेत में कैसे मदद मिलेगी?',
    dashboardGuideText: 'गाँव और समयावधि चुनकर सूखे के अंतराल, बारिश शुरू होने के संकेत और बारिश लौटने के पुराने मॉडल संकेतों की तुलना करें। रंग और प्रतिशत चुनी अवधि के ऐतिहासिक अनुमान हैं।',
    dashboardFieldCheck: 'खेत का फैसला करने से पहले खेत की नमी और पानी निकासी खुद देखें, और आज का स्थानीय मौसम अलग से जाँचें।',
    dashboardOpenInsights: 'मौसम जानकारी और फसल सुझाव देखें',
    dashboardAskAssistant: 'किसान सहायक से पूछें',
    modelScoreExplanation: 'यह प्रतिशत चुनी हुई अवधि में इस घटना की मॉडल-अनुमानित संभावना है। यह मॉडल का भरोसा, आज का मौसम या पक्की भविष्यवाणी नहीं है। डेटा ऐतिहासिक है; खेत का फैसला करने से पहले ताज़ा स्थानीय मौसम और खेत की हालत देखें।',
    historicalRainfallExplanation: 'यह पुराने मॉडल का कुल अनुमान है—मापी हुई या आने वाली बारिश नहीं।',
    welcomeBenefitTitle: 'गाँव की खेती के काम की जानकारी',
    welcomeBenefitText: 'गाँव का नक्शा • मौसम मॉडल को आसान भाषा में समझें • फसल के सुझाव • अपनी बोली में सवाल',
    logout: 'साइन आउट',
    aiOpenRouterRateLimit: 'OpenRouter का मुफ्त मॉडल अभी व्यस्त है या उसकी सीमा पूरी हो गई है। थोड़ी देर बाद फिर कोशिश करें।',
    aiOpenRouterCredits: 'OpenRouter अभी जवाब नहीं दे पाया। खाता/क्रेडिट जाँचें या दूसरा मुफ्त मॉडल चुनें।',
    openRouterAccount: 'OpenRouter खाता खोलें',
    aiOpenRouterKeyRejected: 'OpenRouter ने API key स्वीकार नहीं की। OpenRouter में key जाँचें।',
    aiOpenRouterConnection: 'ऐप का सर्वर OpenRouter से जुड़ नहीं पाया। सर्वर वाले कंप्यूटर का इंटरनेट, फ़ायरवॉल या प्रॉक्सी जाँचें और फिर कोशिश करें।',
    retry: 'फिर कोशिश करें',
    aiOpenRouterError: 'OpenRouter अभी जवाब नहीं दे पाया। कुछ देर बाद फिर कोशिश करें।',
    welcomeBack: 'राम-राम',
    openChat: 'किसान सहायक से पूछें',
    closeChat: 'चैट बंद करें',
    chatOnline: 'खेती का सवाल पूछें',
    alertsNotReady: 'SMS अलर्ट अभी चालू नहीं हैं।',
  },
  en: {
    subtitle: 'Farmer weather and crop support',
    historical: 'Historical model output • not a live forecast',
    historicalDetail:
      'These are model-evaluation records through 2025. They are not today’s weather or an official warning.',
    village: 'Select village',
    district: 'District',
    horizon: 'Time horizon',
    map: 'Village map',
    mapHelp:
      'Click a boundary to select a village. The map uses OpenStreetMap tiles and the project village boundaries.',
    mapLoading: 'Loading village boundaries…',
    mapMissing: 'Map data is unavailable. Check that the API is running.',
    mapEvent: 'Risk layer',
    break: 'Dry spell / monsoon break',
    onset: 'Project rainfall-onset proxy',
    revival: 'Rain revival after dry spell',
    rainfall: 'Historical modelled rainfall total',
    mm: 'mm',
    noOutput: 'No output for this horizon',
    modelRisk: 'Model probability',
    reference: 'Historical risk reference date',
    model: 'Model',
    advisory: 'Farmer AI assistant',
    advisoryHelp:
      'Ask about crops, irrigation, weather signals or farming. Replies can reference available model results.',
    crop: 'Crop',
    stage: 'Crop growth stage',
    ask: 'Type your question',
    send: 'Ask',
    thinking: 'Preparing an answer…',
    assistantHello:
      'Hello! I can give simple farming guidance for your crop and village. Tell me your crop or what you notice in the field.',
    suggested: [
      'What does my village’s 14-day risk mean?',
      'How can I generally save water in paddy?',
      'What can’t this information tell me?',
    ],
    aiUnavailable:
      'AI service is unavailable. Start the backend and place a newly rotated key in the backend .env only.',
    apiUnavailable: 'Cannot reach the local server. Start both the backend and portal, then try again.',
    dataUnavailable: 'Project results have not loaded yet.',
    chooseCrop: 'Choose crop',
    chooseStage: 'Choose stage',
    paddy: 'Paddy',
    wheat: 'Wheat',
    mustard: 'Mustard',
    cotton: 'Cotton',
    maize: 'Maize',
    nursery: 'Nursery / before sowing',
    sowing: 'Sowing / transplanting',
    vegetative: 'Vegetative growth',
    flowering: 'Flowering / grain formation',
    harvest: 'Near harvest',
    disclaimer:
      'General AI information is not a substitute for KVK/agriculture officer advice. Do not use AI to decide chemical dosages.',
    blocks:
      'Block boundaries are not available; the app will not guess village names or block assignments.',
    online: 'Local API connected',
    offline: 'Could not reach API',
    loading: 'Loading…',
    prob: 'Probability',
    tileCredit: '© OpenStreetMap contributors',
    clear: 'Clear chat',
    emptyQuestion: 'Type your question first.',
    sourceNote: 'Data: historical weather model results for the mapped area',
    riskBandNote: 'Risk bands use initial project thresholds; they are not official IMD warnings.',
    heavyRainLimit: 'Heavy-rain risk is not available in this model. The 2023 validation data had no positive heavy-rain cases, so a heavy-rain model was not trained or mapped.',
    spatialLimit: 'Village-level estimates use the nearest IMD 0.25° rainfall grid. Nearby villages may share a grid cell; verified block boundaries are unavailable.',
    navHome: 'Home',
    navDashboard: 'Dashboard',
    navWeather: 'Weather insights',
    navAssistant: 'Farmer assistant',
    navNotifications: 'Notifications',
    navProfile: 'My profile',
    homeHeading: 'What would you like to check for your farm?',
    homeDescription: 'Choose your village, crop, and growth stage to get simple advice for your farm.',
    homeStartTitle: 'Start with your village',
    homeStartHelp: 'Open your village map and the historical model information available here.',
    homeStartButton: 'Open village map',
    homeFarmTitle: 'Get advice for your farm',
    homeFarmHelp: 'Choose your village, crop, and stage. Add a field concern if you like.',
    fieldConcern: 'What do you notice in your field? (optional)',
    fieldConcernPlaceholder: 'For example: yellow leaves, soil feels dry',
    getFarmAdvice: 'Get advice for my farm',
    farmAdviceLoading: 'Preparing advice for your farm…',
    farmAdviceTitle: 'AI guidance for your farm',
    dailyPlanNotice: 'The day-by-day list is a general field-check plan. Available project data does not provide a forecast for each day.',
    homeDashboard: 'Village dashboard',
    homeDashboardHelp: 'Explore your village and nearby boundaries on the map.',
    homeWeather: 'Weather model insights',
    homeWeatherHelp: 'Understand historical rainfall and risk indicators.',
    homeAssistant: 'Ask the farmer assistant',
    homeAssistantHelp: 'Ask general questions about crops, irrigation, and farming.',
    homeNotifications: 'Notifications & alerts',
    homeNotificationsHelp: 'Review your alert preference. SMS is not active yet.',
    pageDashboardTitle: 'Your village dashboard',
    pageWeatherTitle: 'Weather model insights',
    pageAssistantTitle: 'Ask a farming question',
    pageNotificationsTitle: 'Notifications & alerts',
    pageProfileTitle: 'My profile',
    profileDescription: 'Update your name and optional mobile number.',
    profileName: 'Your name',
    profilePhone: 'Mobile number (optional)',
    saveProfile: 'Save details',
    profileSaved: 'Your details have been saved.',
    smsConfigured: 'SMS credentials and DLT values are present',
    smsNotConfigured: 'SMS credentials or DLT values are incomplete',
    smsEnabled: 'SMS enabled',
    smsDisabled: 'SMS disabled',
    smsTestMode: 'Test mode: messages are simulated, not sent',
    phoneVerified: 'Phone number verified',
    phoneNotVerified: 'Verify your phone number to receive SMS alerts',
    sendOtp: 'Send verification code',
    resendOtp: 'Resend code',
    verifyOtp: 'Verify code',
    otpLabel: 'Six-digit verification code',
    otpSent: 'Request accepted. Enter the code if it arrives on your saved number.',
    savePhoneFirst: 'Save the phone number before requesting verification.',
    latestMessageStatus: 'Latest message status',
    testMessageLabel: 'Test message (up to 30 characters)',
    sendTestSms: 'Send test SMS',
    messageSubmitted: 'Provider accepted the message; delivery is not confirmed.',
    messageSimulated: 'Simulation saved. No SMS was sent.',
    smsDemoTitle: 'SMS Demo • Simulated',
    smsDemoDescription: 'Create a farmer alert from a sample Palwal weather scenario and preview a phone notification here. No provider credentials or internet are needed; nothing is sent to a handset.',
    demoMobileLabel: 'Demo Indian mobile number',
    sendDemoSms: 'Send Test SMS',
    demoPreview: 'Smartphone notification preview',
    demoHistory: 'Demo message history',
    demoSent: 'Simulated SMS Sent',
    demoEmpty: 'No demo messages yet. Create one for your presentation.',
    accountUsername: 'Username',
    notificationStatus: 'SMS notification service status',
    notificationDetail: 'The status below shows SMS setup. Automatic weather alerts also need a validated live weather source.',
    notificationWhatWorks: 'What you can use now',
    notificationFeatureOne: 'Choose a village to explore historical weather model signals.',
    notificationFeatureTwo: 'Choose a crop and growth stage for general field-check guidance.',
    notificationSetup: 'Automatic weather alerts remain unavailable until a reliable live weather source and alert rules are connected.',
    notificationPreference: 'I agree to receive SMS alerts after phone verification',
    notificationInterestNote: 'SMS alerts require a verified number and enabled service. You can opt out at any time.',
    noNotifications: 'There are no new notifications.',
    goToProfile: 'Manage alert preference',
    backHome: 'Home',
    speakPage: 'Read this page aloud',
    stopSpeaking: 'Stop reading',
    voiceUnavailable: 'Read-aloud is not available in this browser.',
    askByVoice: 'Ask by voice',
    stopListening: 'Stop listening',
    voiceListening: 'Listening… speak your question',
    voicePermission: 'Allow microphone access, then try again.',
    voiceTryAgain: 'I could not hear that clearly. Please try again.',
    listenAnswer: 'Listen to answer',
    stopAnswer: 'Stop answer',
    recommendations: 'Simple tips for your crop',
    recommendationsIntro: 'Choose the village and time period above. Fill in crop, stage, and field details to get an OpenRouter-generated daily field-check plan.',
    recommendationNote: 'General guidance only. The weather model below is historical, not today’s forecast. Use a current local forecast and agriculture advice for irrigation or chemical decisions.',
    understandRisk: 'What this means',
    riskExplanation: 'This percentage is the model-estimated likelihood of this event during the selected period. It is not the model’s confidence, today’s weather, or a guarantee. The data is historical; check a current local forecast and your field before deciding.',
    dashboardGuideTitle: 'How can this help with your farm?',
    dashboardGuideText: 'Choose a village and time period to compare historical model signals for dry spells, rainfall onset, and rain returning after a dry spell. The colors and percentages describe historical estimates for the selected period.',
    dashboardFieldCheck: 'Before making a field decision, check soil moisture and drainage yourself, and check a current local forecast separately.',
    dashboardOpenInsights: 'Open weather insights and crop guidance',
    dashboardAskAssistant: 'Ask the farmer assistant',
    modelScoreExplanation: 'This percentage is the model-estimated likelihood of this event during the selected period. It is not the model’s confidence, today’s weather, or a guarantee. The data is historical; check a current local forecast and your field before deciding.',
    historicalRainfallExplanation: 'This is an old modelled total—not measured or upcoming rainfall.',
    welcomeBenefitTitle: 'Useful information for your village farm',
    welcomeBenefitText: 'Village map • simple weather-model explanations • crop tips • ask in your language',
    logout: 'Sign out',
    aiOpenRouterRateLimit: 'OpenRouter’s free model is busy or has reached its limit. Wait a moment and try again.',
    aiOpenRouterCredits: 'OpenRouter could not answer this request. Check your account or choose another free model.',
    openRouterAccount: 'Open OpenRouter account',
    aiOpenRouterKeyRejected: 'OpenRouter rejected this API key. Check the key in your OpenRouter account.',
    aiOpenRouterConnection: 'The app server could not connect to OpenRouter. Check the server computer’s internet, firewall, or proxy, then retry.',
    retry: 'Try again',
    aiOpenRouterError: 'OpenRouter could not answer right now. Please try again shortly.',
    welcomeBack: 'Welcome back',
    openChat: 'Ask the farmer assistant',
    closeChat: 'Close chat',
    chatOnline: 'Ask a farming question',
    alertsNotReady: 'SMS alerts are not active yet.',
  },
}

const translations = {
  ...translationsBase,
  hr: {
    ...translationsBase.hi,
    subtitle: 'किसान मौसम अर फसल की मदद',
    historical: 'पुराने मॉडल के नतीजे • आज का पूर्वानुमान ना सै',
    historicalDetail: 'ये 2025 तक के मॉडल नतीजे सैं। इन्हें आज का मौसम या सरकारी चेतावनी ना मानो।',
    village: 'आपणा गाँव चुनो',
    district: 'ज़िला',
    horizon: 'कितने दिन',
    map: 'गाँवों का नक्शा',
    mapHelp: 'नक्शे पै गाँव की सीमा दबा कै गाँव चुनो।',
    mapLoading: 'गाँव का नक्शा खुल्लै सै…',
    mapMissing: 'नक्शा ना खुल्या। API चालू सै के देखो।',
    reference: 'मॉडल की पुरानी तारीख',
    advisory: 'किसान AI साथी',
    advisoryHelp: 'फसल, सिंचाई अर खेती का सवाल पूछो।',
    crop: 'फसल',
    stage: 'फसल की अवस्था',
    ask: 'आपणा सवाल लिखो',
    send: 'पूछो',
    thinking: 'जवाब सोचै सै…',
    assistantHello: 'राम-राम! मैं थारी फसल अर गाँव के हिसाब तै आसान खेती-सलाह दे सकूँ सूँ। फसल या खेत की दिक्कत बताओ।',
    suggested: [
      'मेरे गाँव के 14 दिन के जोखिम का के मतलब सै?',
      'धान मैं पानी बचाण के आम तरीके के सैं?',
      'इस जानकारी तै के पता ना चल्लै?',
    ],
    aiUnavailable: 'AI सेवा ना चल्ली। सर्वर अर नई API key की जाँच करो।',
    apiUnavailable: 'स्थानीय सर्वर तै संपर्क ना होया। Backend अर portal चालू करके फेर कोशिश करो।',
    dataUnavailable: 'परियोजना का डेटा अभी ना खुल्या।',
    chooseCrop: 'फसल चुनो',
    chooseStage: 'अवस्था चुनो',
    paddy: 'धान',
    wheat: 'गेहूँ',
    mustard: 'सरसों',
    cotton: 'कपास',
    maize: 'मक्का',
    nursery: 'नर्सरी / बुवाई तै पहले',
    sowing: 'बुवाई / रोपाई',
    vegetative: 'बढ़त की अवस्था',
    flowering: 'फूल / दाना बणना',
    harvest: 'कटाई नजदीक',
    disclaimer: 'AI की आम सलाह कृषि अफसर/KVK की सलाह का बदल ना सै। दवाई की मात्रा AI तै ना पूछो।',
    blocks: 'ब्लॉक की सीमा उपलब्ध ना सै; ऐप गाँव या ब्लॉक का अंदाजा ना लगावैगा।',
    online: 'स्थानीय API जुड़्या सै',
    offline: 'API तै संपर्क ना होया',
    loading: 'खुल्लै सै…',
    tileCredit: '© OpenStreetMap योगदानकर्ता',
    clear: 'चैट साफ करो',
    emptyQuestion: 'पहले आपणा सवाल लिखो।',
    sourceNote: 'डेटा: उपलब्ध इलाके के पुराने मौसम मॉडल नतीजे',
    riskBandNote: 'जोखिम स्तर परियोजना के शुरुआती मानक सैं; सरकारी IMD चेतावनी ना सैं।',
    heavyRainLimit: 'भारी बरसात का जोखिम इस मॉडल मैं ना सै। 2023 के validation आंकड़्यां मैं भारी बरसात के positive case ना थे, इस खातर इसका मॉडल ना बण्या अर नक्शे पै ना दिखाया।',
    spatialLimit: 'गाँव का अनुमान नजदीकी IMD 0.25° बरसात ग्रिड पै सै। पास के गाँव एक ग्रिड साझा कर सकैं सैं; पक्की ब्लॉक सीमा ना मिली।',
    navHome: 'मुख्य पन्ना',
    navDashboard: 'डैशबोर्ड',
    navWeather: 'मौसम की जानकारी',
    navAssistant: 'किसान साथी',
    navNotifications: 'सूचना',
    navProfile: 'मेरी जानकारी',
    homeHeading: 'आज खेत खातर के देखणा सै?',
    homeDescription: 'गाँव, फसल अर अवस्था चुनो। फेर आपणे खेत खातर आसान सलाह लो।',
    homeStartTitle: 'पहले आपणा गाँव चुनो',
    homeStartHelp: 'गाँव का नक्शा अर पुराने मॉडल की जानकारी खोलो।',
    homeStartButton: 'गाँव का नक्शा खोलो',
    homeFarmTitle: 'आपणे खेत खातर सलाह लो',
    homeFarmHelp: 'गाँव, फसल अर अवस्था चुनो। खेत की दिक्कत हो तो लिख दो।',
    fieldConcern: 'खेत मैं के दिखै सै? (जरूरी ना सै)',
    fieldConcernPlaceholder: 'जैसे: पत्ते पीले सैं, मिट्टी सूखी लागै सै',
    getFarmAdvice: 'मेरे खेत की सलाह दो',
    farmAdviceLoading: 'थारे खेत खातर सलाह बनै सै…',
    farmAdviceTitle: 'थारे खेत खातर AI सलाह',
    dailyPlanNotice: 'नीचे हर दिन खातर खेत-जाँच की आम योजना सै। अभी का डेटा रोज का मौसम पूर्वानुमान ना देवै।',
    homeDashboard: 'गाँव का डैशबोर्ड',
    homeDashboardHelp: 'नक्शे पै आपणा गाँव अर आसपास की सीमा देखो।',
    homeWeather: 'मौसम मॉडल की जानकारी',
    homeWeatherHelp: 'पुरानी बरसात अर जोखिम के संकेत समझो।',
    homeAssistant: 'किसान साथी तै पूछो',
    homeAssistantHelp: 'फसल, सिंचाई अर खेती के आम सवाल पूछो।',
    homeNotifications: 'सूचना अर अलर्ट',
    homeNotificationsHelp: 'अलर्ट की पसंद देखो। SMS अभी चालू ना सै।',
    pageDashboardTitle: 'थारा गाँव का डैशबोर्ड',
    pageWeatherTitle: 'मौसम मॉडल की जानकारी',
    pageAssistantTitle: 'खेती का सवाल पूछो',
    pageNotificationsTitle: 'सूचना अर अलर्ट',
    pageProfileTitle: 'मेरी जानकारी',
    profileDescription: 'आपणा नाम अर मोबाइल नंबर बदलो।',
    profileName: 'थारा नाम',
    profilePhone: 'मोबाइल नंबर (जरूरी ना सै)',
    saveProfile: 'जानकारी सहेजो',
    profileSaved: 'थारी जानकारी सहेज दी।',
    smsConfigured: 'SMS credentials अर DLT values मौजूद सैं',
    smsNotConfigured: 'SMS credentials अर DLT values अधूरे सैं',
    smsEnabled: 'SMS चालू सै',
    smsDisabled: 'SMS बंद सै',
    smsTestMode: 'टेस्ट मोड: संदेश बस सिम्युलेट होंगे, भेजे ना जावेंगे',
    phoneVerified: 'मोबाइल नंबर सत्यापित सै',
    phoneNotVerified: 'SMS अलर्ट खातर मोबाइल नंबर सत्यापित करो',
    sendOtp: 'सत्यापन कोड भेजो',
    resendOtp: 'कोड फेर भेजो',
    verifyOtp: 'कोड सत्यापित करो',
    otpLabel: 'छह अंकों का सत्यापन कोड',
    otpSent: 'अनुरोध मान लिया। सहेजे नंबर पै कोड आवै तो भरो।',
    savePhoneFirst: 'सत्यापन माँगण तै पहले मोबाइल नंबर सहेजो।',
    latestMessageStatus: 'पिछले संदेश की हालत',
    testMessageLabel: 'टेस्ट संदेश (अधिकतम 30 अक्षर)',
    sendTestSms: 'टेस्ट SMS भेजो',
    messageSubmitted: 'प्रदाता ने संदेश ले लिया; डिलीवरी की पुष्टि ना सै।',
    messageSimulated: 'सिम्युलेशन सहेज्या। कोई SMS ना भेज्या।',
    smsDemoTitle: 'SMS डेमो • सिम्युलेटेड',
    smsDemoDescription: 'Palwal के नमूना मौसम पै किसान अलर्ट बनाओ अर ऐप मैं फोन नोटिफिकेशन देखो। credentials या internet की जरूरत ना; फोन पै SMS ना जावैगा।',
    demoMobileLabel: 'डेमो भारतीय मोबाइल नंबर',
    sendDemoSms: 'Send Test SMS',
    demoPreview: 'फोन नोटिफिकेशन का नमूना',
    demoHistory: 'डेमो संदेश इतिहास',
    demoSent: 'Simulated SMS Sent',
    demoEmpty: 'अभी कोई डेमो संदेश ना सै। प्रस्तुति खातर पहला SMS बनाओ।',
    accountUsername: 'यूज़रनेम',
    notificationStatus: 'SMS सूचना सेवा की हालत',
    notificationDetail: 'नीचे SMS सेटअप की हालत दिखै सै। अपने-आप मौसम अलर्ट खातर भरोसेमंद लाइव मौसम स्रोत भी चाहिए।',
    notificationWhatWorks: 'इब आप के देख सको हो',
    notificationFeatureOne: 'गाँव चुन कै पुराने मौसम मॉडल के संकेत देखो।',
    notificationFeatureTwo: 'फसल अर बढ़वार का चरण चुन कै खेत-जाँच के आम सुझाव पाओ।',
    notificationSetup: 'भरोसेमंद लाइव मौसम स्रोत अर अलर्ट नियम जुड़ण ताईं अपने-आप मौसम अलर्ट उपलब्ध ना सैं।',
    notificationPreference: 'नंबर सत्यापित होण पाछै SMS अलर्ट खातर मेरी सहमति सै',
    notificationInterestNote: 'SMS अलर्ट खातर सत्यापित नंबर अर चालू सेवा चाहिए। सहमति कदे भी वापस ले सको हो।',
    noNotifications: 'अभी कोई नई सूचना ना सै।',
    goToProfile: 'अलर्ट की पसंद बदलो',
    backHome: 'मुख्य पन्ना',
    speakPage: 'पन्ना सुणो',
    stopSpeaking: 'आवाज रोक्को',
    voiceUnavailable: 'इस ब्राउज़र मैं आवाज़ की सुविधा ना सै।',
    askByVoice: 'बोल कै पूछो',
    stopListening: 'सुणणा रोक्को',
    voiceListening: 'सुण रह्या सै… आपणा सवाल बोलो',
    voicePermission: 'माइक की इजाजत दे कै फेर कोशिश करो।',
    voiceTryAgain: 'आवाज साफ ना सुणी। फेर बोलो।',
    listenAnswer: 'जवाब सुणो',
    stopAnswer: 'जवाब रोक्को',
    recommendations: 'थारी फसल खातर आसान सलाह',
    recommendationsIntro: 'गाँव अर समय ऊपर चुनो। फसल, अवस्था अर खेत की जानकारी भरते ही OpenRouter तै रोज की खेत-जाँच सलाह मिलैगी।',
    recommendationNote: 'यो आम सलाह सै। नीचे का मौसम मॉडल पुराना सै—आज की बरसात की खबर ना। सिंचाई या दवाई खातर ताजा मौसम अर कृषि अफसर तै पूछो।',
    understandRisk: 'इसका सीधा मतलब',
    riskExplanation: 'यो प्रतिशत चुनी हुई अवधि मैं इस घटना की मॉडल-अनुमानित संभावना सै। यो मॉडल का भरोसा, आज का मौसम या पक्की भविष्यवाणी ना सै। डेटा पुराना सै; खेत का फैसला ताजा मौसम अर खेत की हालत देख कै करो।',
    dashboardGuideTitle: 'इस जानकारी तै खेत मैं के मदद मिलैगी?',
    dashboardGuideText: 'गाँव अर समय चुन कै सूखे के अंतराल, बरसात शुरू होण के संकेत अर सूखे पाछै बरसात लौटण के पुराने मॉडल संकेत देखो। रंग अर प्रतिशत चुनी अवधि के पुराने अनुमान सैं।',
    dashboardFieldCheck: 'खेत का फैसला करण तै पहले खेत की नमी अर पानी निकास खुद देखो, अर आज का स्थानीय मौसम अलग तै जाँचो।',
    dashboardOpenInsights: 'मौसम जानकारी अर फसल के सुझाव देखो',
    dashboardAskAssistant: 'किसान सहायक तै पूछो',
    modelScoreExplanation: 'यो प्रतिशत चुनी हुई अवधि मैं इस घटना की मॉडल-अनुमानित संभावना सै। यो मॉडल का भरोसा, आज का मौसम या पक्की भविष्यवाणी ना सै। डेटा पुराना सै; खेत का फैसला ताजा मौसम अर खेत की हालत देख कै करो।',
    historicalRainfallExplanation: 'यो पुराने मॉडल का कुल अंदाजा सै—मापी हुई या आगे होण वाली बरसात ना।',
    welcomeBenefitTitle: 'थारे गाँव के खेत की काम की जानकारी',
    welcomeBenefitText: 'गाँव का नक्शा • मौसम मॉडल की सीधी समझ • फसल की सलाह • अपणी बोली मैं सवाल',
    logout: 'बाहर निकलो',
    aiOpenRouterRateLimit: 'OpenRouter का फ्री मॉडल बिजी सै या उसकी लिमिट पूरी हो ली। थोड़ी देर बाद फेर कोशिश करो।',
    aiOpenRouterCredits: 'OpenRouter यो सवाल अभी ना कर पाया। खाता देखो या दूसरा फ्री मॉडल चुनो।',
    openRouterAccount: 'OpenRouter खाता खोलो',
    aiOpenRouterKeyRejected: 'OpenRouter नै API key ना मानी। OpenRouter खाते मैं key देखो।',
    aiOpenRouterConnection: 'ऐप का सर्वर OpenRouter तै जुड़ ना पाया। सर्वर आले कंप्यूटर का इंटरनेट, फ़ायरवॉल या प्रॉक्सी देखो अर फेर कोशिश करो।',
    retry: 'फेर कोशिश करो',
    aiOpenRouterError: 'OpenRouter अभी जवाब ना दे पाया। थोड़ी देर बाद फेर कोशिश करो।',
    welcomeBack: 'राम-राम फेर तै',
    openChat: 'किसान साथी तै पूछो',
    closeChat: 'चैट बंद करो',
    chatOnline: 'खेती का सवाल पूछो',
    alertsNotReady: 'SMS अलर्ट अभी चालू ना सैं।',
  },
}

const eventColors: Record<RiskLevel, string> = {
  LOW: '#2f855a',
  MODERATE: '#d69e2e',
  HIGH: '#dd6b20',
  'VERY HIGH': '#c53030',
}

class RequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'RequestError'
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new RequestError('Cannot reach the local server.', 'API_UNREACHABLE')
    }
    throw error
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { detail?: string | { code?: string; message?: string } }
      | null
    if (typeof body?.detail === 'object') {
      throw new RequestError(
        body.detail.message || `Request failed (${response.status})`,
        body.detail.code,
      )
    }
    throw new RequestError(body?.detail || `Request failed (${response.status})`)
  }
  return (await response.json()) as T
}

function Recenter({ village }: { village?: Village }) {
  const map = useMap()
  useEffect(() => {
    if (village) map.flyTo([village.latitude, village.longitude], 11, { duration: 0.6 })
  }, [map, village])
  return null
}

function readPageFromUrl(): PortalPage {
  const page = new URLSearchParams(window.location.search).get('page')
  return page === 'dashboard' ||
    page === 'weather' ||
    page === 'assistant' ||
    page === 'notifications' ||
    page === 'profile'
    ? page
    : 'home'
}

function VillageMap({
  boundaries,
  villages,
  selectedVillage,
  riskMap,
  event,
  onSelect,
  language,
}: {
  boundaries: BoundaryCollection
  villages: Village[]
  selectedVillage?: Village
  riskMap?: VillageRiskMap | null
  event: EventName
  onSelect: (id: string) => void
  language: Language
}) {
  const byId = useMemo(
    () => new Map(villages.map((village) => [village.village_id, village])),
    [villages],
  )
  const riskById = useMemo(
    () => new Map((riskMap?.risks ?? []).map((item) => [item.village_id, item])),
    [riskMap],
  )
  const center: [number, number] = selectedVillage
    ? [selectedVillage.latitude, selectedVillage.longitude]
    : [28.15, 77.32]
  const layerOptions = (feature?: Feature<Geometry, BoundaryProperties>): PathOptions => {
    const id = String(feature?.properties?.village_id ?? '')
    const villageRisk = riskById.get(id)
    const isSelected = id === selectedVillage?.village_id
    return {
      color: isSelected ? '#102f2a' : '#607d70',
      weight: isSelected ? 2.5 : 0.8,
      fillColor: villageRisk ? eventColors[villageRisk.risk_level] : '#cbd5ce',
      fillOpacity: villageRisk ? (isSelected ? 0.78 : 0.58) : 0.22,
    }
  }
  const addVillagePopup = (
    feature: Feature<Geometry, BoundaryProperties>,
    layer: Layer,
  ) => {
    const id = String(feature.properties?.village_id ?? '')
    const village = byId.get(id)
    if (!village) return
    const villageRisk = riskById.get(id)
    const riskText = villageRisk
      ? `${(villageRisk.probability * 100).toFixed(1)}% · ${riskLabels[language][villageRisk.risk_level]}`
      : mapText[language].noData
    layer.bindTooltip(`${village.village_name} · ${riskText}`, { sticky: true })
    layer.on('click', () => onSelect(id))
  }

  return (
    <MapContainer center={center} zoom={11} scrollWheelZoom className="village-map">
      <Recenter village={selectedVillage} />
      <TileLayer
        attribution={language === 'hi' ? '© OpenStreetMap योगदानकर्ता' : '© OpenStreetMap contributors'}
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeoJSON
        key={`${selectedVillage?.village_id ?? 'all'}-${event}-${riskMap?.horizon_days ?? 7}`}
        data={boundaries}
        style={layerOptions}
        onEachFeature={addVillagePopup}
      />
    </MapContainer>
  )
}

export default function PortalApp() {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = window.localStorage.getItem('mausam-language')
    return saved === 'en' || saved === 'hr' ? saved : 'hi'
  })
  const [user, setUser] = useState<{
    username: string
    full_name: string
    phone_number?: string | null
    sms_alert_opt_in?: boolean
  } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [welcomeVisible, setWelcomeVisible] = useState(true)
  const [activePage, setActivePage] = useState<PortalPage>(readPageFromUrl)
  const [villages, setVillages] = useState<Village[]>([])
  const [district, setDistrict] = useState('')
  const [boundaries, setBoundaries] = useState<BoundaryCollection>()
  const [villageId, setVillageId] = useState('')
  const [horizon, setHorizon] = useState<number>(7)
  const [event, setEvent] = useState<EventName>('break')
  const [outlook, setOutlook] = useState<Outlook>()
  const [mapRiskSnapshot, setMapRiskSnapshot] = useState<VillageRiskMap | null>()
  const [loadingData, setLoadingData] = useState(true)
  const [apiOnline, setApiOnline] = useState(false)
  const [dataError, setDataError] = useState('')
  const [crop, setCrop] = useState<CropName | ''>('')
  const [stage, setStage] = useState<CropStage | ''>('')
  const [farmConcern, setFarmConcern] = useState('')
  const [generatedAdvice, setGeneratedAdvice] = useState<{ context: string; answer: string }>()
  const [adviceBusy, setAdviceBusy] = useState(false)
  const [adviceError, setAdviceError] = useState('')
  const [question, setQuestion] = useState('')
  const [chat, setChat] = useState<ChatEntry[]>([])
  const [chatBusy, setChatBusy] = useState(false)
  const [listeningForQuestion, setListeningForQuestion] = useState(false)
  const [voiceInputMessage, setVoiceInputMessage] = useState('')
  const [speakingChatIndex, setSpeakingChatIndex] = useState<number | null>(null)
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const [chatError, setChatError] = useState('')
  const [chatErrorCode, setChatErrorCode] = useState('')
  const [profileName, setProfileName] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileSmsOptIn, setProfileSmsOptIn] = useState(false)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus | null>(null)
  const [notificationBusy, setNotificationBusy] = useState(false)
  const [notificationMessage, setNotificationMessage] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [demoRecipient, setDemoRecipient] = useState('9876543210')
  const [readingPage, setReadingPage] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState('')
  const t = translations[language]
  const selectedVillage = villages.find((village) => village.village_id === villageId)
  useEffect(() => {
    if (selectedVillage?.district) setDistrict(selectedVillage.district)
  }, [selectedVillage?.district])
  const adviceContext = `${villageId}|${crop}|${stage}|${horizon}|${language}|${farmConcern.trim()}`
  const currentGeneratedAdvice = generatedAdvice?.context === adviceContext
    ? generatedAdvice.answer
    : ''
  const profilePhoneIsVerified = Boolean(
    notificationStatus?.phone_verified &&
    profilePhone === notificationStatus.phone_number,
  )
  const demoMessages = notificationStatus?.messages.filter((message) =>
    message.message.startsWith('DEMO •'),
  ) ?? []

  const completeWelcome = useCallback(() => {
    setWelcomeVisible(false)
  }, [])

  const changeLanguage = useCallback((nextLanguage: Language) => {
    window.localStorage.setItem('mausam-language', nextLanguage)
    setLanguage(nextLanguage)
  }, [])

  const navigate = useCallback((page: PortalPage) => {
    const nextUrl = new URL(window.location.href)
    if (page === 'home') nextUrl.searchParams.delete('page')
    else nextUrl.searchParams.set('page', page)
    window.history.pushState({ page }, '', nextUrl)
    setActivePage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const syncPage = () => setActivePage(readPageFromUrl())
    window.addEventListener('popstate', syncPage)
    return () => window.removeEventListener('popstate', syncPage)
  }, [])

  useEffect(() => {
    window.speechSynthesis?.cancel()
    setReadingPage(false)
    setSpeakingChatIndex(null)
    speechRecognitionRef.current?.abort()
    speechRecognitionRef.current = null
    setListeningForQuestion(false)
    return () => speechRecognitionRef.current?.abort()
  }, [activePage, language])

  useEffect(() => {
    if (!user || (activePage !== 'notifications' && activePage !== 'profile')) return
    let cancelled = false
    setNotificationStatus(null)
    api<NotificationStatus>('/api/notifications/status')
      .then((status) => {
        if (!cancelled) setNotificationStatus(status)
      })
      .catch(() => {
        if (!cancelled) setNotificationStatus(null)
      })
    return () => { cancelled = true }
  }, [user, activePage])

  useEffect(() => {
    let cancelled = false
    api<{
      authenticated: boolean
      username?: string
      full_name?: string
      phone_number?: string | null
      sms_alert_opt_in?: boolean
    }>('/api/auth/me')
      .then((account) => {
        if (!cancelled && account.authenticated && account.username) {
          setUser({
            username: account.username,
            full_name: account.full_name || account.username,
            phone_number: account.phone_number,
            sms_alert_opt_in: account.sms_alert_opt_in ?? false,
          })
          setProfileName(account.full_name || account.username)
          setProfilePhone(account.phone_number || '')
          setProfileSmsOptIn(account.sms_alert_opt_in ?? false)
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user) return
    setProfileName(user.full_name)
    setProfilePhone(user.phone_number || '')
    setProfileSmsOptIn(user.sms_alert_opt_in ?? false)
  }, [user])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    Promise.all([
      api<Village[]>('/api/villages'),
      api<BoundaryCollection>('/api/map/villages'),
      api<{ status: string }>('/api/health'),
    ])
      .then(([items, geometry]) => {
        if (cancelled) return
        setVillages(items)
        setBoundaries(geometry)
        setDistrict(items[0]?.district ?? '')
        setVillageId(items[0]?.village_id ?? '')
        setApiOnline(true)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setApiOnline(false)
        setDataError(error instanceof Error ? error.message : t.dataUnavailable)
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    if (!user || !villageId) return
    let cancelled = false
    setOutlook(undefined)
    setDataError('')
    api<Outlook>(`/api/villages/${encodeURIComponent(villageId)}/outlook?horizon=${horizon}`)
      .then((result) => {
        if (!cancelled) setOutlook(result)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDataError(error instanceof Error ? error.message : t.dataUnavailable)
        }
      })
    return () => {
      cancelled = true
    }
  }, [user, villageId, horizon, t.dataUnavailable])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setMapRiskSnapshot(undefined)
    api<VillageRiskMap>(`/api/map/risks?event=${event}&horizon=${horizon}`)
      .then((snapshot) => {
        if (!cancelled) setMapRiskSnapshot(snapshot)
      })
      .catch(() => {
        if (!cancelled) setMapRiskSnapshot(null)
      })
    return () => {
      cancelled = true
    }
  }, [user, event, horizon])

  useEffect(() => {
    if (
      activePage !== 'weather' ||
      !user ||
      !selectedVillage ||
      !outlook ||
      !crop ||
      !stage
    ) return
    const timer = window.setTimeout(() => {
      void requestFarmAdvice()
    }, 900)
    return () => window.clearTimeout(timer)
  }, [
    activePage,
    user,
    villageId,
    horizon,
    crop,
    stage,
    language,
    farmConcern,
    Boolean(outlook),
  ])

  useEffect(() => {
    setChat([{ role: 'assistant', content: t.assistantHello }])
  }, [language, t.assistantHello])

  async function sendQuestion(value = question) {
    const prompt = value.trim()
    if (!prompt) {
      setChatError(t.emptyQuestion)
      return
    }
    if (!selectedVillage || !outlook) {
      setChatError(t.dataUnavailable)
      return
    }
    if (!crop || !stage) {
      setChatError(t.chooseCrop)
      return
    }
    const history = chat.slice(-6)
    setChat((current) => [...current, { role: 'user', content: prompt }])
    setChatError('')
    setChatErrorCode('')
    setChatBusy(true)
    try {
      const result = await api<{ answer: string }>('/api/advisory', {
        method: 'POST',
        body: JSON.stringify({
          question: prompt,
          village_id: villageId,
          horizon,
          crop,
          stage,
          language,
          history,
        }),
      })
      setChat((current) => [...current, { role: 'assistant', content: result.answer }])
      setQuestion('')
    } catch (error) {
      setChat((current) => {
        const last = current[current.length - 1]
        return last?.role === 'user' && last.content === prompt
          ? current.slice(0, -1)
          : current
      })
      setQuestion(prompt)
      if (error instanceof RequestError) {
        setChatErrorCode(error.code ?? '')
        const localizedErrors: Record<string, string> = {
          API_UNREACHABLE: t.apiUnavailable,
          AI_OPENROUTER_CONNECTION: t.aiOpenRouterConnection,
          AI_OPENROUTER_RATE_LIMIT: t.aiOpenRouterRateLimit,
          AI_OPENROUTER_CREDITS: t.aiOpenRouterCredits,
          AI_OPENROUTER_KEY_REJECTED: t.aiOpenRouterKeyRejected,
          AI_OPENROUTER_ERROR: t.aiOpenRouterError,
        }
        setChatError(localizedErrors[error.code ?? ''] ?? error.message)
      } else {
        setChatErrorCode('')
        setChatError(error instanceof Error ? error.message : t.aiUnavailable)
      }
    } finally {
      setChatBusy(false)
    }
  }

  async function requestFarmAdvice() {
    if (!selectedVillage || !outlook || !crop || !stage) {
      setAdviceError(t.dataUnavailable)
      return
    }
    setAdviceBusy(true)
    setAdviceError('')
    const concern = farmConcern.trim()
    const prompt = [
      `Prepare a practical ${horizon}-day field-check plan for my ${crop} crop at the ${stage} stage in ${selectedVillage.village_name}, ${selectedVillage.district || 'Haryana'}.`,
      concern
        ? `My field concern is: ${concern}. Start with safe checks and do not assume a diagnosis.`
        : 'I have not reported a specific field problem. Give preventive observations and safe actions, not a diagnosis.',
      `Give exactly one short, useful numbered field-check/action for each day from day 1 to day ${horizon}. Keep each day specific to this crop/stage and avoid repeating the same action.`,
      'Do not make up daily weather, rainfall, dates, or probabilities. This project data is historical and only gives an aggregate event likelihood for the selected period; clearly say the day-by-day list is a general monitoring plan, not a daily weather forecast. Do not prescribe chemical/fertilizer doses or fixed irrigation schedules.',
      language === 'hi'
        ? 'कृपया पूरा जवाब सरल हिन्दी में देवनागरी लिपि में दें। शीर्षक और दिन के नाम भी हिन्दी में लिखें। अंग्रेज़ी में जवाब न दें। Markdown के *, ** या # चिह्न न लिखें।'
        : language === 'hr'
          ? 'पूरा जवाब आसान हरियाणवी में देवनागरी लिपि में दें। दिन और शीर्षक भी हरियाणवी में लिखें। अंग्रेज़ी या Markdown चिह्न न लिखें।'
          : 'Write the complete answer in simple English. Do not use Markdown formatting marks.',
    ].join(' ')
    try {
      const result = await api<{ answer: string }>('/api/advisory', {
        method: 'POST',
        body: JSON.stringify({
          question: prompt,
          village_id: villageId,
          horizon,
          crop,
          stage,
          language,
          history: [],
        }),
      })
      setGeneratedAdvice({ context: adviceContext, answer: result.answer })
    } catch (error) {
      if (error instanceof RequestError) {
        const messages: Record<string, string> = {
          API_UNREACHABLE: t.apiUnavailable,
          AI_OPENROUTER_CONNECTION: t.aiOpenRouterConnection,
          AI_OPENROUTER_RATE_LIMIT: t.aiOpenRouterRateLimit,
          AI_OPENROUTER_CREDITS: t.aiOpenRouterCredits,
          AI_OPENROUTER_KEY_REJECTED: t.aiOpenRouterKeyRejected,
          AI_OPENROUTER_ERROR: t.aiOpenRouterError,
        }
        setAdviceError(messages[error.code ?? ''] ?? error.message)
      } else {
        setAdviceError(error instanceof Error ? error.message : t.aiUnavailable)
      }
    } finally {
      setAdviceBusy(false)
    }
  }

  async function signOut() {
    try {
      await api<{ authenticated: boolean }>('/api/auth/logout', { method: 'POST' })
      setUser(null)
      setNotificationStatus(null)
      setOtpCode('')
      navigate('home')
      setChat([{ role: 'assistant', content: t.assistantHello }])
    } catch (error) {
      setDataError(error instanceof Error ? error.message : t.dataUnavailable)
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileBusy(true)
    setProfileMessage('')
    try {
      const updated = await api<{
        username: string
        full_name: string
        phone_number: string | null
        sms_alert_opt_in: boolean
      }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          full_name: profileName,
          phone_number: profilePhone,
          sms_alert_opt_in: profileSmsOptIn,
        }),
      })
      setUser(updated)
      setProfilePhone(updated.phone_number || '')
      setProfileMessage(t.profileSaved)
      setOtpCode('')
      void reloadNotificationStatus().catch(() => setNotificationStatus(null))
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : t.dataUnavailable)
    } finally {
      setProfileBusy(false)
    }
  }

  async function reloadNotificationStatus() {
    const status = await api<NotificationStatus>('/api/notifications/status')
    setNotificationStatus(status)
  }

  async function requestPhoneOtp(resend = false) {
    setNotificationBusy(true)
    setNotificationMessage('')
    try {
      await api<{ status: string; expires_in_seconds: number }>(
        resend ? '/api/auth/phone/otp/resend' : '/api/auth/phone/otp/send',
        { method: 'POST' },
      )
      setNotificationMessage(t.otpSent)
      void reloadNotificationStatus().catch(() => setNotificationStatus(null))
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : t.dataUnavailable)
    } finally {
      setNotificationBusy(false)
    }
  }

  async function verifyPhoneOtp() {
    setNotificationBusy(true)
    setNotificationMessage('')
    try {
      await api<{ verified: boolean }>('/api/auth/phone/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ otp: otpCode }),
      })
      setOtpCode('')
      setNotificationMessage(t.phoneVerified)
      void reloadNotificationStatus().catch(() => setNotificationStatus(null))
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : t.dataUnavailable)
    } finally {
      setNotificationBusy(false)
    }
  }

  async function sendDemoSms() {
    setNotificationBusy(true)
    setNotificationMessage('')
    try {
      const result = await api<{ id: string; recipient: string; message: string; status: string; provider_id: null; created_at: string }>('/api/notifications/demo', {
        method: 'POST',
        body: JSON.stringify({ recipient: demoRecipient }),
      })
      setNotificationStatus((current) => current ? {
        ...current,
        messages: [{ ...result }, ...current.messages].slice(0, 20),
      } : current)
      setNotificationMessage(t.messageSimulated)
      void reloadNotificationStatus().catch(() => undefined)
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : t.dataUnavailable)
    } finally {
      setNotificationBusy(false)
    }
  }

  function readPageAloud() {
    if (!('speechSynthesis' in window)) {
      setVoiceMessage(t.voiceUnavailable)
      return
    }
    const speech = window.speechSynthesis
    if (readingPage) {
      speech.cancel()
      setReadingPage(false)
      return
    }
    const content = document.querySelector<HTMLElement>('[data-page-content]')
    const text = content?.innerText.trim()
    if (!text) return
    speech.cancel()
    setVoiceMessage('')
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language === 'en' ? 'en-IN' : 'hi-IN'
    utterance.rate = 0.88
    utterance.onstart = () => setReadingPage(true)
    utterance.onend = () => setReadingPage(false)
    utterance.onerror = () => setReadingPage(false)
    speech.speak(utterance)
  }

  function onQuestionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendQuestion()
  }

  function toggleQuestionVoice() {
    if (listeningForQuestion) {
      speechRecognitionRef.current?.stop()
      setListeningForQuestion(false)
      return
    }
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) {
      setVoiceInputMessage(t.voiceUnavailable)
      return
    }
    window.speechSynthesis?.cancel()
    setSpeakingChatIndex(null)
    const recognition = new Recognition()
    recognition.lang = language === 'en' ? 'en-IN' : 'hi-IN'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onstart = () => {
      setVoiceInputMessage(t.voiceListening)
      setListeningForQuestion(true)
    }
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length - event.resultIndex }, (_, index) =>
        event.results[event.resultIndex + index][0]?.transcript ?? '',
      ).join(' ').trim()
      if (transcript) {
        setQuestion((current) => [current.trim(), transcript].filter(Boolean).join(' '))
        setVoiceInputMessage('')
      }
    }
    recognition.onerror = (event) => {
      setListeningForQuestion(false)
      if (event.error === 'aborted') return
      setVoiceInputMessage(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? t.voicePermission
          : t.voiceTryAgain,
      )
    }
    recognition.onend = () => {
      setListeningForQuestion(false)
      speechRecognitionRef.current = null
    }
    speechRecognitionRef.current = recognition
    setVoiceInputMessage('')
    try {
      recognition.start()
    } catch {
      setListeningForQuestion(false)
      setVoiceInputMessage(t.voiceTryAgain)
    }
  }

  function speakChatAnswer(text: string, index: number) {
    if (!('speechSynthesis' in window)) {
      setVoiceInputMessage(t.voiceUnavailable)
      return
    }
    speechRecognitionRef.current?.abort()
    speechRecognitionRef.current = null
    setListeningForQuestion(false)
    const speech = window.speechSynthesis
    if (speakingChatIndex === index) {
      speech.cancel()
      setSpeakingChatIndex(null)
      return
    }
    speech.cancel()
    setReadingPage(false)
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language === 'en' ? 'en-IN' : 'hi-IN'
    utterance.rate = 0.88
    utterance.onstart = () => setSpeakingChatIndex(index)
    utterance.onend = () => setSpeakingChatIndex(null)
    utterance.onerror = () => setSpeakingChatIndex(null)
    speech.speak(utterance)
  }

  const risk = outlook?.events[event]
  const crops = [
    ['paddy', t.paddy],
    ['wheat', t.wheat],
    ['mustard', t.mustard],
    ['cotton', t.cotton],
    ['maize', t.maize],
  ] as const
  const stages = [
    ['nursery', t.nursery],
    ['sowing', t.sowing],
    ['vegetative', t.vegetative],
    ['flowering', t.flowering],
    ['harvest', t.harvest],
  ] as const
  const districtNames = [...new Set(villages.map((village) => village.district).filter((value): value is string => Boolean(value)))].sort()
  const districtVillages = villages.filter((village) => !district || village.district === district)
  const navigation: { id: PortalPage; label: string; icon: PortalIconName }[] = [
    { id: 'home', label: t.navHome, icon: 'home' },
    { id: 'dashboard', label: t.navDashboard, icon: 'dashboard' },
    { id: 'weather', label: t.navWeather, icon: 'weather' },
    { id: 'assistant', label: t.navAssistant, icon: 'assistant' },
    { id: 'notifications', label: t.navNotifications, icon: 'notifications' },
    { id: 'profile', label: t.navProfile, icon: 'profile' },
  ]
  const controls = (
    <section className="controls card">
      {districtNames.length > 1 && (
        <label>
          <span>{t.district}</span>
          <select value={district} onChange={(e) => {
            const nextDistrict = e.target.value
            setDistrict(nextDistrict)
            setVillageId(villages.find((village) => village.district === nextDistrict)?.village_id ?? '')
          }}>
            {districtNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      )}
      <label>
        <span>{t.village}</span>
        <select value={villageId} onChange={(e) => setVillageId(e.target.value)} disabled={!villages.length}>
          {districtVillages.map((item) => (
            <option key={item.village_id} value={item.village_id}>{item.village_name}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>{t.horizon}</legend>
        <div className="horizon-options">
          {horizons.map((days) => (
            <button key={days} type="button" className={horizon === days ? 'selected' : ''} onClick={() => setHorizon(days)}>
              {days} {language === 'en' ? 'days' : 'दिन'}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="reference-date">
        <span>{t.reference}</span>
        <strong>{outlook?.reference_date ?? (loadingData ? t.loading : '—')}</strong>
      </div>
    </section>
  )
  const mapPanel = (
    <article className="card map-card">
      <div className="section-title">
        <div><p className="eyebrow">{selectedVillage?.district ?? districtNames.join(' · ')}</p><h2>{t.map}</h2></div>
        <select aria-label={t.mapEvent} value={event} onChange={(e) => setEvent(e.target.value as EventName)}>
          <option value="break">{t.break}</option>
          <option value="onset">{t.onset}</option>
          <option value="revival">{t.revival}</option>
        </select>
      </div>
      <p className="muted">{t.mapHelp}</p>
      <p className="fine-print">{t.spatialLimit}</p>
      {boundaries ? (
        <VillageMap
          boundaries={boundaries}
          villages={villages}
          selectedVillage={selectedVillage}
          riskMap={mapRiskSnapshot}
          event={event}
          onSelect={setVillageId}
          language={language}
        />
      ) : (
        <div className="map-placeholder">{loadingData ? t.mapLoading : t.mapMissing}</div>
      )}
      <div className="map-legend">
        <strong>{mapText[language].legend}</strong>
        {mapRiskSnapshot === undefined ? <small>{t.loading}</small> : mapRiskSnapshot ? (
          <>
            {mapRiskSnapshot.risks.length > 0 ? (
              <div className="map-legend-items">
                {(['LOW', 'MODERATE', 'HIGH', 'VERY HIGH'] as RiskLevel[]).map((level) => (
                  <span key={level}><i style={{ background: eventColors[level] }} />{riskLabels[language][level]}</span>
                ))}
                <span><i className="no-risk-data" />{mapText[language].noData}</span>
              </div>
            ) : <small>{mapText[language].noRecords}</small>}
            <small>{mapText[language].coverage(mapRiskSnapshot.available_villages, mapRiskSnapshot.total_villages)} · {mapText[language].asOf}: {mapRiskSnapshot.reference_date ?? mapText[language].noData} · {t.historical}</small>
          </>
        ) : <small>{mapText[language].unavailable}</small>}
        <small>{t.tileCredit}</small>
      </div>
    </article>
  )
  const weatherPanel = (
    <article className="card outlook-card">
      <div className="section-title">
        <div><p className="eyebrow">{selectedVillage?.village_name ?? t.village}</p><h2>{horizon} {language === 'hi' || language === 'hr' ? 'दिन का मॉडल दृष्टिकोण' : 'day model outlook'}</h2></div>
        <span className="historic-tag">{t.historical}</span>
      </div>
      {loadingData || (villageId && !outlook && !dataError) ? (
        <p className="empty-state">{t.loading}</p>
      ) : outlook ? (
        <>
          <div className="risk-list">
            {([
              ['break', t.break],
              ['onset', t.onset],
              ['revival', t.revival],
            ] as const).map(([key, label]) => {
              const result = outlook.events[key]
              return (
                <div className="risk-row" key={key}>
                  <span className="risk-dot" style={{ background: result ? eventColors[result.risk_level] : '#a0aec0' }} />
                  <div className="risk-label"><strong>{label}</strong><small>{result ? `${t.model}: ${result.model} · ${result.reference_date}` : t.noOutput}</small></div>
                  <div className="risk-value">{result ? <><strong>{(result.probability * 100).toFixed(1)}%</strong><small>{riskLabels[language][result.risk_level]}</small></> : '—'}</div>
                </div>
              )
            })}
          </div>
          <div className="rainfall-total">
          <span className="rainfall-total-icon"><PortalIcon name="rain" size={25} /></span><div><small>{t.rainfall} • {horizon} {language === 'en' ? 'days' : 'दिन'}</small><strong>{outlook.historical_modelled_rainfall_mm == null ? '—' : `${outlook.historical_modelled_rainfall_mm.toFixed(1)} ${t.mm}`}</strong><small>{t.historicalRainfallExplanation}</small></div>
          </div>
          <p className="fine-print">{outlook.rainfall_note}</p>
          <p className="fine-print heavy-rain-note">{t.heavyRainLimit}</p>
        </>
      ) : <p className="empty-state">{t.dataUnavailable}</p>}
      <div className="block-note"><PortalIcon name="info" size={16} /> {t.riskBandNote} {t.blocks}</div>
    </article>
  )
  const recommendationPanel = (
    <section className="card recommendation-panel">
      <div className="recommendation-heading">
        <span className="recommendation-icon"><PortalIcon name="plant" size={24} /></span>
        <div>
          <p className="eyebrow">{selectedVillage?.village_name ?? t.village}</p>
          <h2>{t.recommendations}</h2>
          <p>{t.recommendationsIntro}</p>
        </div>
      </div>
      <div className="recommendation-selectors">
        <label><span>{t.crop}</span><select value={crop} onChange={(e) => setCrop(e.target.value as CropName | '')}><option value="">{t.chooseCrop}</option>{crops.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>{t.stage}</span><select value={stage} onChange={(e) => setStage(e.target.value as CropStage | '')}><option value="">{t.chooseStage}</option>{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <label className="home-farm-concern">
        <span>{t.fieldConcern}</span>
        <textarea value={farmConcern} onChange={(e) => setFarmConcern(e.target.value)} maxLength={500} placeholder={t.fieldConcernPlaceholder} />
      </label>
      <p className="daily-plan-notice">{t.dailyPlanNotice}</p>
      <div className="recommendation-insight">
        <strong>{t.understandRisk}</strong>
        <p>
          {risk
            ? `${selectedVillage?.village_name ?? t.village} • ${t[event]} • ${(risk.probability * 100).toFixed(1)}% • ${riskLabels[language][risk.risk_level]}`
            : t.noOutput}
        </p>
        <small>{t.modelScoreExplanation}</small>
      </div>
      {adviceError && <div className="alert error" role="alert"><strong>{adviceError}</strong><button className="inline-retry" type="button" onClick={() => void requestFarmAdvice()} disabled={adviceBusy}>{t.retry}</button></div>}
      {adviceBusy && <p className="farm-advice-loading" role="status">{t.farmAdviceLoading}</p>}
      {currentGeneratedAdvice && <div className="farm-advice-result" aria-live="polite"><div className="farm-advice-title"><span aria-hidden="true"><PortalIcon name="assistant" size={17} /></span><h3>{t.farmAdviceTitle}</h3></div><p className="farm-advice-answer">{currentGeneratedAdvice}</p></div>}
      {crop && <p className="recommendation-tip">{cropGuidance[language][crop]}</p>}
      {stage && <p className="recommendation-tip">{cropGuidance[language][stage]}</p>}
      <p className="recommendation-note"><PortalIcon name="info" size={16} />{t.recommendationNote}</p>
    </section>
  )
  if (welcomeVisible) {
    return (
      <WelcomeIntro
        language={language}
        onLanguageChange={changeLanguage}
        onComplete={completeWelcome}
      />
    )
  }

  if (authLoading) {
    return (
      <main className="auth-screen" aria-live="polite">
        <p className="auth-loading">{t.loading}</p>
      </main>
    )
  }

  if (!user) {
    return (
      <AuthScreen
        language={language}
        onLanguageChange={changeLanguage}
        onAuthenticated={(account) =>
          setUser({
            username: account.username,
            full_name: account.full_name || account.username,
            phone_number: account.phone_number,
            sms_alert_opt_in: account.sms_alert_opt_in ?? false,
          })
        }
      />
    )
  }

  return (
    <main className="portal" lang={language === 'hr' ? 'bgc' : language}>
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={() => navigate('home')} aria-label={t.navHome}>
          <span className="brand-mark" aria-hidden="true"><PortalIcon name="plant" size={24} /></span>
          <span>
            <strong>मौसम साथी</strong>
            <small>{selectedVillage?.district ? `${selectedVillage.district} · ${t.subtitle}` : t.subtitle}</small>
          </span>
        </button>
        <div className="top-actions">
          <span className={`api-status ${apiOnline ? 'is-online' : ''}`}>
            <i /> {apiOnline ? t.online : t.offline}
          </span>
          <select
            className="language-toggle"
            aria-label="Language"
            value={language}
            onChange={(event) => changeLanguage(event.target.value as Language)}
          >
            <option value="hi">हिंदी</option>
            <option value="en">English</option>
            <option value="hr">हरियाणवी</option>
          </select>
          <button className="profile-shortcut" type="button" onClick={() => navigate('profile')}>
            <span className="profile-avatar" aria-hidden="true">{user.full_name.slice(0, 1)}</span>
            <span className="signed-in-user">{user.full_name}</span>
          </button>
          <button className="clear-button signout-button" type="button" onClick={() => void signOut()}>
            {t.logout}
          </button>
        </div>
      </header>

      <nav className="main-nav" aria-label={t.navHome}>
        {navigation.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activePage === item.id ? 'active' : ''}
            aria-current={activePage === item.id ? 'page' : undefined}
            onClick={() => navigate(item.id)}
          >
            <PortalIcon name={item.icon} size={18} />{item.label}
          </button>
        ))}
      </nav>

      <div className="reading-toolbar">
        <button type="button" className="read-aloud-button" onClick={readPageAloud} aria-pressed={readingPage}>
          <PortalIcon name={readingPage ? 'stop' : 'sound'} size={17} />
          {readingPage ? t.stopSpeaking : t.speakPage}
        </button>
        {voiceMessage && <span role="status">{voiceMessage}</span>}
      </div>

      <div data-page-content>
      {activePage === 'home' && <section className="intro" id="top">
        <div className="intro-copy">
          <p className="eyebrow">{t.welcomeBack}, {user.full_name}</p>
          <h1>{t.homeHeading}</h1>
          <p>{t.homeDescription}</p>
        </div>
        <div className="historic-stamp">
          <span className="historic-stamp-icon"><PortalIcon name="history" size={22} /></span>
          <div><strong>{t.historical}</strong><small>{t.historicalDetail}</small></div>
        </div>
      </section>}

      {activePage === 'home' && (
        <section className="home-quickstart card" aria-label={t.homeStartTitle}>
          <span className="quickstart-icon"><PortalIcon name="map" size={23} /></span>
          <div className="quickstart-copy">
            <h2>{t.homeStartTitle}</h2>
            <p>{t.homeStartHelp}</p>
          </div>
          <label>
            <span>{t.village}</span>
            <select value={villageId} onChange={(e) => setVillageId(e.target.value)} disabled={!villages.length}>
              {!villages.length && <option value="">{loadingData ? t.loading : t.dataUnavailable}</option>}
              {villages.map((item) => <option key={item.village_id} value={item.village_id}>{item.village_name}</option>)}
            </select>
          </label>
          <button className="primary-button" type="button" onClick={() => navigate('dashboard')} disabled={!villages.length}>
            {t.homeStartButton}<PortalIcon name="arrow" size={16} />
          </button>
        </section>
      )}

      {activePage === 'home' && (
        <section className="home-benefits" aria-label={t.welcomeBenefitTitle}>
          <p className="eyebrow">{t.welcomeBenefitTitle}</p>
          <p>{t.welcomeBenefitText}</p>
        </section>
      )}

      {activePage === 'home' && (
        <section className="feature-grid" aria-label={t.homeHeading}>
          {([
            ['dashboard', 'dashboard', t.homeDashboard, t.homeDashboardHelp],
            ['weather', 'weather', t.homeWeather, t.homeWeatherHelp],
            ['assistant', 'assistant', t.homeAssistant, t.homeAssistantHelp],
            ['notifications', 'notifications', t.homeNotifications, t.homeNotificationsHelp],
          ] as const).map(([page, icon, title, description]) => (
            <button className="feature-card card" key={page} type="button" onClick={() => navigate(page)}>
              <span className="feature-icon"><PortalIcon name={icon} size={23} /></span>
              <span className="feature-title">{title}</span>
              <span className="feature-description">{description}</span>
              <span className="feature-open">{language === 'en' ? 'Open page' : 'खोलें'}<PortalIcon name="arrow" size={15} /></span>
            </button>
          ))}
        </section>
      )}

      {activePage !== 'home' && (
        <div className="page-title">
          <p className="eyebrow">{t.welcomeBack}, {user.full_name}</p>
          <h1>{activePage === 'dashboard' ? t.pageDashboardTitle
            : activePage === 'weather' ? t.pageWeatherTitle
              : activePage === 'assistant' ? t.pageAssistantTitle
                : activePage === 'notifications' ? t.pageNotificationsTitle
                  : t.pageProfileTitle}</h1>
        </div>
      )}

      {dataError && activePage !== 'home' && <div className="alert error" role="status">{dataError}</div>}
      {(activePage === 'dashboard' || activePage === 'weather') && controls}
      {(activePage === 'dashboard' || activePage === 'weather') && (
        <section className={`dashboard-grid page-content ${activePage}`}>
          {activePage === 'dashboard' ? mapPanel : weatherPanel}
        </section>
      )}
      {activePage === 'dashboard' && (
        <section className="card dashboard-guide">
          <div className="dashboard-guide-heading">
            <span className="guide-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 4C11 4 5 7 5 14a6 6 0 0 0 6 6c7 0 9-7 9-16Z"/><path d="M4 21c3-5 7-8 12-11"/></svg></span>
            <div><p className="eyebrow">{selectedVillage?.village_name ?? t.village}</p><h2>{t.dashboardGuideTitle}</h2></div>
          </div>
          <p>{t.dashboardGuideText}</p>
          <div className="dashboard-signal">
            <span className="signal-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg></span>
            <div>
              <strong>{risk ? `${t[event]} · ${(risk.probability * 100).toFixed(1)}% · ${riskLabels[language][risk.risk_level]}` : t.noOutput}</strong>
              <small>{t.reference}: {risk?.reference_date ?? t.loading}. {t.historicalDetail}</small>
            </div>
          </div>
          <p className="dashboard-field-check">{t.dashboardFieldCheck}</p>
          <div className="dashboard-guide-actions">
            <button className="primary-button" type="button" onClick={() => navigate('weather')}>{t.dashboardOpenInsights}</button>
            <button className="secondary-button" type="button" onClick={() => navigate('assistant')}>{t.dashboardAskAssistant}</button>
          </div>
        </section>
      )}
      {activePage === 'weather' && recommendationPanel}

      {activePage === 'notifications' && (
        <section className="card notification-page">
          <div className="notification-status-icon"><PortalIcon name="notifications" size={26} /></div>
          <h2>{t.smsDemoTitle}</h2>
          <p className="sms-demo-disclaimer">DEMO / SIMULATED SMS · No real SMS is sent</p>
          <p className="sms-demo-description">{t.smsDemoDescription}</p>
          <div className="sms-status-badges">
            <span className="notification-status-badge">{notificationStatus?.sms_configured ? t.smsConfigured : t.smsNotConfigured}</span>
            <span className="notification-status-badge">{notificationStatus?.sms_enabled ? t.smsEnabled : t.smsDisabled}</span>
          </div>
          <div className="sms-demo-composer">
            <label>
              <span>{t.demoMobileLabel}</span>
              <input type="tel" inputMode="tel" autoComplete="off" placeholder="+91 98765 43210" value={demoRecipient} onChange={(event) => setDemoRecipient(event.target.value)} maxLength={24} />
            </label>
            <button className="primary-button" type="button" disabled={notificationBusy || !demoRecipient.trim()} onClick={() => void sendDemoSms()}>
              {notificationBusy ? t.loading : t.sendDemoSms}
            </button>
            {notificationMessage && <p role="status">{notificationMessage}</p>}
          </div>
          <div className="sms-demo-preview-wrap">
            <h3>{t.demoPreview}</h3>
            {demoMessages[0] ? (
              <div className="sms-phone-preview" aria-live="polite">
                <div className="sms-phone-topline"><span>9:41</span><span>● ● ● ▰</span></div>
                <div className="sms-phone-notification">
                  <div className="sms-phone-app"><span className="sms-phone-app-icon">☁</span><span>MAUSAM SATHI <time>{new Date(demoMessages[0].created_at).toLocaleTimeString(language === 'en' ? 'en-IN' : 'hi-IN', { hour: '2-digit', minute: '2-digit' })}</time></span></div>
                  <strong>{t.demoSent}</strong>
                  <p>{demoMessages[0].message.replace('DEMO • ', '')}</p>
                  <small>{demoMessages[0].recipient} · {new Date(demoMessages[0].created_at).toLocaleString(language === 'en' ? 'en-IN' : 'hi-IN')}</small>
                </div>
                <div className="sms-phone-home-indicator" />
              </div>
            ) : <p className="sms-demo-empty">{t.demoEmpty}</p>}
          </div>
          <div className="sms-demo-history">
            <h3>{t.demoHistory}</h3>
            {demoMessages.length ? demoMessages.map((message) => (
              <article className="sms-demo-history-item" key={message.id}>
                <span className="sms-demo-history-check">✓</span>
                <div><strong>{t.demoSent}</strong><p>{message.recipient} · {new Date(message.created_at).toLocaleString(language === 'en' ? 'en-IN' : 'hi-IN')}</p><small>{message.message.replace('DEMO • ', '')}</small></div>
              </article>
            )) : <p className="sms-demo-empty">{t.demoEmpty}</p>}
          </div>
          <div className="notification-what-works">
            <h3>{t.notificationWhatWorks}</h3>
            <ul><li>{t.notificationFeatureOne}</li><li>{t.notificationFeatureTwo}</li></ul>
          </div>
          <p className="notification-setup">{t.notificationSetup}</p>
          <div className="notification-actions">
            <button className="primary-button" type="button" onClick={() => navigate('weather')}>{t.dashboardOpenInsights}</button>
            <button className="secondary-button" type="button" onClick={() => navigate('profile')}>{t.goToProfile}</button>
          </div>
        </section>
      )}

      {activePage === 'profile' && (
        <section className="card profile-page">
          <p className="muted">{t.profileDescription}</p>
          <form className="profile-form" onSubmit={(event) => void saveProfile(event)}>
            <label><span>{t.profileName}</span><input value={profileName} onChange={(event) => setProfileName(event.target.value)} minLength={2} maxLength={80} required /></label>
            <label><span>{t.accountUsername}</span><input value={user.username} readOnly /></label>
            <label><span>{t.profilePhone}</span><input type="tel" value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} placeholder="+91 98765 43210" maxLength={24} /></label>
            <div className="sms-verification-controls">
              <p className="password-hint">{profilePhoneIsVerified ? t.phoneVerified : t.phoneNotVerified}</p>
              {!profilePhoneIsVerified && (
                <>
                  {!notificationStatus?.otp_pending && (
                    <button className="secondary-button" type="button" disabled={notificationBusy || !notificationStatus?.sms_enabled || notificationStatus?.test_mode || !profilePhone.trim() || profilePhone !== notificationStatus?.phone_number} onClick={() => void requestPhoneOtp(false)}>
                      {notificationBusy ? t.loading : t.sendOtp}
                    </button>
                  )}
                  {notificationStatus?.otp_pending && (
                    <>
                      <label><span>{t.otpLabel}</span><input inputMode="numeric" autoComplete="one-time-code" value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} /></label>
                      <div className="notification-actions">
                        <button className="primary-button" type="button" disabled={notificationBusy || otpCode.length !== 6} onClick={() => void verifyPhoneOtp()}>{notificationBusy ? t.loading : t.verifyOtp}</button>
                        <button className="secondary-button" type="button" disabled={notificationBusy} onClick={() => void requestPhoneOtp(true)}>{t.resendOtp}</button>
                      </div>
                    </>
                  )}
                </>
              )}
              {notificationMessage && <p role="status">{notificationMessage}</p>}
              {profilePhone && profilePhone !== notificationStatus?.phone_number && <p className="password-hint">{t.savePhoneFirst}</p>}
            </div>
            <label className="sms-opt-in"><input type="checkbox" checked={profileSmsOptIn} onChange={(event) => setProfileSmsOptIn(event.target.checked)} /><span>{t.notificationPreference}</span></label>
            <p className="password-hint">{t.notificationInterestNote}</p>
            {profileMessage && <div className={`profile-message ${profileMessage === t.profileSaved ? 'success' : 'error'}`} role="status">{profileMessage}</div>}
            <button className="primary-button" type="submit" disabled={profileBusy}>{profileBusy ? t.loading : t.saveProfile}</button>
          </form>
        </section>
      )}

      {activePage === 'assistant' && <section className="card assistant-card assistant-page">
        <div className="assistant-heading">
          <div className="assistant-icon"><PortalIcon name="assistant" size={22} /></div>
          <div><p className="eyebrow">मौसम साथी</p><h2>{t.advisory}</h2><p>{t.advisoryHelp}</p></div>
        </div>
        <div className="farmer-context">
          <label><span>{t.crop}</span><select value={crop} onChange={(e) => setCrop(e.target.value as CropName | '')}><option value="">{t.chooseCrop}</option>{crops.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>{t.stage}</span><select value={stage} onChange={(e) => setStage(e.target.value as CropStage | '')}><option value="">{t.chooseStage}</option>{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button className="clear-button" onClick={() => setChat([{ role: 'assistant', content: t.assistantHello }])}>{t.clear}</button>
        </div>
        <div className="chat-log" aria-live="polite" aria-label={t.advisory}>
          {chat.map((message, index) => (
            <div className={`chat-message ${message.role}`} key={`${index}-${message.role}`}>
              <span><PortalIcon name={message.role === 'assistant' ? 'assistant' : 'profile'} size={15} /></span>
              <p>{message.content}</p>
              {message.role === 'assistant' && (
                <button
                  className="chat-speak-button"
                  type="button"
                  aria-label={speakingChatIndex === index ? t.stopAnswer : t.listenAnswer}
                  title={speakingChatIndex === index ? t.stopAnswer : t.listenAnswer}
                  aria-pressed={speakingChatIndex === index}
                  onClick={() => speakChatAnswer(message.content, index)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {speakingChatIndex === index
                      ? <path d="M8 5h3v14H8zm6 0h3v14h-3z" />
                      : <path d="M4 10v4h4l5 4V6l-5 4H4Zm12-1a4 4 0 0 1 0 6m2-9a7 7 0 0 1 0 12" />}
                  </svg>
                </button>
              )}
            </div>
          ))}
          {chatBusy && <div className="chat-message assistant"><span><PortalIcon name="assistant" size={15} /></span><p>{t.thinking}</p></div>}
        </div>
        {chat.length === 1 && <div className="suggestions">{t.suggested.map((prompt) => <button key={prompt} onClick={() => void sendQuestion(prompt)} disabled={chatBusy || !outlook}>{prompt}</button>)}</div>}
        <form className="question-form" onSubmit={onQuestionSubmit}>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendQuestion() } }} maxLength={1200} placeholder={t.ask} aria-label={t.ask} disabled={chatBusy} />
          <div className="question-actions">
            <button
              className={`question-voice-button${listeningForQuestion ? ' is-listening' : ''}`}
              type="button"
              onClick={toggleQuestionVoice}
              disabled={chatBusy}
              aria-label={listeningForQuestion ? t.stopListening : t.askByVoice}
              aria-pressed={listeningForQuestion}
              title={listeningForQuestion ? t.stopListening : t.askByVoice}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0m-7 7v3m-4 0h8"/></svg>
              <span>{listeningForQuestion ? t.stopListening : t.askByVoice}</span>
            </button>
            <button type="submit" disabled={chatBusy || !question.trim()}>{chatBusy ? '…' : t.send}<PortalIcon name="arrow" size={16} /></button>
          </div>
        </form>
        {voiceInputMessage && <p className="voice-input-status" role="status">{voiceInputMessage}</p>}
        {chatError && (
          <div className="alert error" role="alert">
            <strong>{chatError}</strong>
            {chatErrorCode === 'AI_OPENROUTER_CREDITS' && (
              <p>
                <a
                  href="https://openrouter.ai/settings/credits"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.openRouterAccount}
                </a>
              </p>
            )}
            {question && chatErrorCode !== 'AI_OPENROUTER_KEY_REJECTED' && (
              <button className="inline-retry" type="button" onClick={() => void sendQuestion(question)} disabled={chatBusy}>
                {t.retry}
              </button>
            )}
          </div>
        )}
        <p className="disclaimer">{t.disclaimer}</p>
      </section>}

      </div>
      <footer className="footer"><span>{t.sourceNote}</span></footer>
    </main>
  )
}





