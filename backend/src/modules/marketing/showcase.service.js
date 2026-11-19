import { createImageStore } from '../../shared/services/image-store.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToAll } from '../../shared/realtime/socket.js';
import { ShowcasePortrait } from './showcase.model.js';

const TONES = [
  'from-rose-200 to-pink-300',
  'from-amber-200 to-orange-300',
  'from-sky-200 to-blue-300',
  'from-emerald-200 to-teal-300',
  'from-violet-200 to-purple-300',
  'from-cyan-200 to-sky-300',
  'from-fuchsia-200 to-pink-300',
  'from-lime-200 to-emerald-300',
  'from-indigo-200 to-violet-300',
  'from-orange-200 to-rose-300',
];

const store = createImageStore({
  folder: 'showcase',
  urlPrefix: '/api/showcase/',
  field: 'image',
  maxBytes: 2 * 1024 * 1024,
});

export const showcaseUpload = store.upload;
export const resolveShowcaseFile = store.resolve;

const trim = (value, max) => String(value ?? '').trim().slice(0, max);

const toPublic = (row) => ({
  id: row.id,
  name: row.name,
  role: row.role || '',
  feedback: row.feedback || '',
  tone: row.tone,
  imageUrl: row.imageUrl,
  sortOrder: row.sortOrder,
});

export async function listShowcase() {
  const rows = await ShowcasePortrait.findAll({ order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']] });
  return { portraits: rows.map(toPublic) };
}

/** Pushes the latest gallery to every open tab (About, sign-in, super admin). */
async function broadcastShowcase() {
  emitToAll('showcase:updated', await listShowcase());
}

export async function addShowcasePortrait(file, { name, role, feedback } = {}) {
  const imageUrl = await store.save(file);
  const count = await ShowcasePortrait.count();
  if (count >= 20) {
    await store.remove(imageUrl);
    throw ApiError.badRequest('Gallery is limited to 20 portraits');
  }
  const portrait = await ShowcasePortrait.create({
    name: trim(name, 60) || 'Teammate',
    role: trim(role, 80),
    feedback: trim(feedback, 280),
    tone: TONES[count % TONES.length],
    imageUrl,
    sortOrder: count,
  });
  await broadcastShowcase();
  return { portrait: toPublic(portrait) };
}

export async function updateShowcasePortrait(id, changes) {
  const portrait = await ShowcasePortrait.findByPk(id);
  if (!portrait) throw ApiError.notFound('Portrait not found');
  if (changes.name != null) portrait.name = trim(changes.name, 60) || portrait.name;
  if (changes.role != null) portrait.role = trim(changes.role, 80);
  if (changes.feedback != null) portrait.feedback = trim(changes.feedback, 280);
  if (changes.sortOrder != null) portrait.sortOrder = Number(changes.sortOrder) || 0;
  await portrait.save();
  await broadcastShowcase();
  return { portrait: toPublic(portrait) };
}

export async function removeShowcasePortrait(id) {
  const portrait = await ShowcasePortrait.findByPk(id);
  if (!portrait) throw ApiError.notFound('Portrait not found');
  const url = portrait.imageUrl;
  await portrait.destroy();
  await store.remove(url);
  await broadcastShowcase();
  return { ok: true };
}
