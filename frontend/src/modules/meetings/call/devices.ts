/** Cameras, microphones and speakers this browser can use, and the ones the person chose (kept per browser). */

export type DeviceKind = 'audioinput' | 'videoinput' | 'audiooutput'
export type DeviceLists = Record<DeviceKind, Array<{ id: string; label: string }>>

const storageKey = (kind: DeviceKind) => `vector.meetings.device.${kind}`

export const savedDevice = (kind: DeviceKind) => localStorage.getItem(storageKey(kind)) || null
export function saveDevice(kind: DeviceKind, id: string | null) {
  if (id) localStorage.setItem(storageKey(kind), id)
  else localStorage.removeItem(storageKey(kind))
}

/** Chrome and Edge can play the call on a chosen speaker; other browsers use the system's. */
export const canChooseSpeaker = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

const FALLBACK_LABELS: Record<DeviceKind, string> = { audioinput: 'Microphone', videoinput: 'Camera', audiooutput: 'Speaker' }

/** Labels only show once the person allowed the camera or microphone; until then they are numbered. */
export async function listDevices(): Promise<DeviceLists> {
  const lists: DeviceLists = { audioinput: [], videoinput: [], audiooutput: [] }
  if (!navigator.mediaDevices?.enumerateDevices) return lists
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[])
  for (const device of devices) {
    const kind = device.kind as DeviceKind
    if (!lists[kind] || !device.deviceId || lists[kind].some((item) => item.id === device.deviceId)) continue
    lists[kind].push({ id: device.deviceId, label: device.label || `${FALLBACK_LABELS[kind]} ${lists[kind].length + 1}` })
  }
  return lists
}

/** Constraints for the chosen device, or the system default. */
export const withDevice = (base: MediaTrackConstraints, id: string | null): MediaTrackConstraints => (id ? { ...base, deviceId: { exact: id } } : base)
