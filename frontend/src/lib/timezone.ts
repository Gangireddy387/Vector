/** Browsers still report some zones by their old names; show and store the current ones. */
const LEGACY_ZONES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Europe/Kiev': 'Europe/Kyiv',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Pacific/Truk': 'Pacific/Chuuk',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'America/Godthab': 'America/Nuuk',
  'Etc/UTC': 'UTC',
  'Etc/GMT': 'UTC',
}
export const normalizeTimeZone = (zone: string) => LEGACY_ZONES[zone] ?? zone

/** The device's IANA time zone, e.g. "Asia/Kolkata". */
export const detectTimeZone = () => normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')

/** "GMT+05:30" style offset for a zone at the given moment (handles daylight saving). */
export function formatOffset(timeZone: string, at = new Date()) {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value
    return name === 'GMT' ? 'GMT+00:00' : (name ?? '')
  } catch {
    return ''
  }
}

/** Current local time in a zone, e.g. "7:45 PM". */
export function localTime(timeZone: string, at = new Date()) {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: '2-digit' }).format(at)
  } catch {
    return ''
  }
}

/** "Asia/Kolkata" → "Kolkata"; "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export const cityOf = (timeZone: string) => (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ')

/** Every zone the browser knows, falling back to a short list on very old browsers. */
export function listTimeZones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone')
  const zones = supported?.length ? supported : ['UTC', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'America/New_York', 'America/Chicago', 'America/Los_Angeles']
  const unique = [...new Set(zones.map(normalizeTimeZone))]
  return unique.includes('UTC') ? ['UTC', ...unique.filter((zone) => zone !== 'UTC')] : ['UTC', ...unique]
}
