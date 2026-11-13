import { createFileStore, detectAudioType } from '../../shared/services/image-store.js';

const tones = createFileStore({
  folder: 'ringtones',
  urlPrefix: '/api/ringtones/',
  field: 'ringtone',
  maxBytes: 3 * 1024 * 1024,
  detect: detectAudioType,
  extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'webm'],
  kind: 'an audio file',
  typeMessage: 'Use an MP3, WAV, OGG, M4A, FLAC or WebM audio file',
});

export const ringtoneUpload = tones.upload;
export const resolveRingtoneFile = tones.resolve;

/** The uploaded file's name without its extension, as a short label ("My song.mp3" → "My song"). */
const toneName = (originalName = '') =>
  originalName
    .replace(/\.[^.]+$/, '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 60) || 'My ringtone';

const soundsOf = (user) => user.preferences?.sounds ?? {};

/** Saves the person's own ringtone and selects it; the previous upload is deleted. */
export async function setRingtone(user, file) {
  const url = await tones.save(file);
  const sounds = soundsOf(user);
  const previous = sounds.customRingtoneUrl;
  await user.update({
    preferences: { ...user.preferences, sounds: { ...sounds, ringtone: 'custom', customRingtoneUrl: url, customRingtoneName: toneName(file.originalname) } },
  });
  await tones.remove(previous);
  return user.toJSON();
}

/** Deletes the person's own ringtone; if it was selected they go back to the default one. */
export async function clearRingtone(user) {
  const sounds = soundsOf(user);
  const previous = sounds.customRingtoneUrl;
  await user.update({
    preferences: {
      ...user.preferences,
      sounds: { ...sounds, ringtone: sounds.ringtone === 'custom' ? 'default' : sounds.ringtone, customRingtoneUrl: null, customRingtoneName: null },
    },
  });
  await tones.remove(previous);
  return user.toJSON();
}
