export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_SOURCE_BYTES = 15 * 1024 * 1024

/** How the user framed the photo in the crop dialog, relative to a square viewport of `viewport` px. */
export interface CropFrame {
  viewport: number
  /** Multiplier on top of the "cover" scale (1 = image just fills the frame). */
  zoom: number
  /** Pan from the centre, in viewport pixels. */
  offsetX: number
  offsetY: number
  /** Clockwise rotation in degrees: 0, 90, 180 or 270. */
  rotation: number
}

export function assertImageFile(file: File) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error('Choose a PNG, JPEG, WebP or GIF image.')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('That image is too large. Choose one under 15 MB.')
}

/** Decodes an image with its camera orientation applied, so phone photos are upright. */
export async function loadImage(file: File) {
  assertImageFile(file)
  return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('That file could not be read as an image.')
  })
}

/** Size of the image once rotated, and the scale at which it exactly covers the viewport. */
export function coverScale(width: number, height: number, rotation: number, viewport: number) {
  const sideways = rotation % 180 !== 0
  const rotatedWidth = sideways ? height : width
  const rotatedHeight = sideways ? width : height
  return { rotatedWidth, rotatedHeight, scale: viewport / Math.min(rotatedWidth, rotatedHeight) }
}

/** Zoom at which the whole image fits inside the frame (below 1, the frame shows empty space). */
export function fitZoom(width: number, height: number) {
  return Math.min(width, height) / Math.max(width, height)
}

/** Largest pan allowed: a larger image always fills the frame, a smaller one always stays inside it. */
export function panLimits(width: number, height: number, frame: Omit<CropFrame, 'offsetX' | 'offsetY'>) {
  const { rotatedWidth, rotatedHeight, scale } = coverScale(width, height, frame.rotation, frame.viewport)
  const total = scale * frame.zoom
  return {
    x: Math.abs(rotatedWidth * total - frame.viewport) / 2,
    y: Math.abs(rotatedHeight * total - frame.viewport) / 2,
  }
}

/** Paints the framed image onto a square canvas of `size` px; used for both the live view and the export. */
export function drawCrop(context: CanvasRenderingContext2D, image: ImageBitmap, frame: CropFrame, size: number) {
  const ratio = size / frame.viewport
  const { scale } = coverScale(image.width, image.height, frame.rotation, frame.viewport)
  context.save()
  context.clearRect(0, 0, size, size)
  context.imageSmoothingQuality = 'high'
  context.translate(size / 2 + frame.offsetX * ratio, size / 2 + frame.offsetY * ratio)
  context.rotate((frame.rotation * Math.PI) / 180)
  context.scale(scale * frame.zoom * ratio, scale * frame.zoom * ratio)
  context.drawImage(image, -image.width / 2, -image.height / 2)
  context.restore()
}

/** Draws exactly what the crop viewport shows onto a new square canvas of `size` px. */
export function renderCrop(image: ImageBitmap, frame: CropFrame, size: number) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Your browser cannot process images.')
  drawCrop(context, image, frame, size)
  return canvas
}

/** Encodes a canvas as WebP for upload; where WebP is unsupported, PNG keeps `transparent` images clear, JPEG is used otherwise. */
export async function canvasToUpload(canvas: HTMLCanvasElement, { transparent = false } = {}): Promise<{ blob: Blob; fileName: string }> {
  const toBlob = (type: string, quality?: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  const webp = await toBlob('image/webp', 0.9)
  if (webp && webp.type === 'image/webp') return { blob: webp, fileName: 'image.webp' }
  const fallback = transparent ? await toBlob('image/png') : await toBlob('image/jpeg', 0.92)
  if (!fallback) throw new Error('The image could not be prepared.')
  return { blob: fallback, fileName: transparent ? 'image.png' : 'image.jpg' }
}
