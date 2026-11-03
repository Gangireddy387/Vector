/** Languages captions can be translated into (the same list as the server's CAPTION_LANGUAGES). */
export const CAPTION_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी · Hindi' },
  { code: 'te', label: 'తెలుగు · Telugu' },
  { code: 'ta', label: 'தமிழ் · Tamil' },
  { code: 'kn', label: 'ಕನ್ನಡ · Kannada' },
  { code: 'ml', label: 'മലയാളം · Malayalam' },
  { code: 'mr', label: 'मराठी · Marathi' },
  { code: 'bn', label: 'বাংলা · Bengali' },
  { code: 'gu', label: 'ગુજરાતી · Gujarati' },
  { code: 'ur', label: 'اردو · Urdu' },
  { code: 'es', label: 'Español · Spanish' },
  { code: 'fr', label: 'Français · French' },
  { code: 'de', label: 'Deutsch · German' },
  { code: 'pt', label: 'Português · Portuguese' },
  { code: 'ar', label: 'العربية · Arabic' },
  { code: 'zh', label: '中文 · Chinese' },
  { code: 'ja', label: '日本語 · Japanese' },
]

export const languageLabel = (code: string | null) => CAPTION_LANGUAGES.find((language) => language.code === code)?.label.split(' · ').pop() ?? null
