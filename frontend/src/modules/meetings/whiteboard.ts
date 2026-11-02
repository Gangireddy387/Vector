import type { WhiteboardStroke } from './meetings.api'

/** Board units are 1000 across the board; sticky notes are this wide (and as tall). */
export const NOTE_SIZE = 170

/** Font size in board units for a stroke width (Thin / Medium / Thick). */
export const textSize = (width: number, note: boolean) => (note ? 14 + width : 12 + width * 3)

/** Sticky notes are a light version of the chosen colour (yellow for black). */
export function noteFill(color: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color) || color.toLowerCase() === '#111827') return '#fef08a'
  const mix = (offset: number) => Math.round(parseInt(color.slice(offset, offset + 2), 16) * 0.3 + 255 * 0.7)
  return `rgb(${mix(1)}, ${mix(3)}, ${mix(5)})`
}

/** Splits text into lines no wider than `maxWidth` (as `measure` says), keeping the writer's own line breaks. */
export function textLines(text: string, maxWidth: number, measure: (text: string) => number) {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (!line || measure(next) <= maxWidth) line = next
      else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

/**
 * The area an item covers, between 0 and 1 of the board (for the eraser). `aspect`: board width / height;
 * `measure(text, fontUnits)`: the text's width in the same units as `fontUnits`.
 */
export function boardBounds(stroke: WhiteboardStroke, aspect: number, measure: (text: string, fontUnits: number) => number) {
  const [x = 0, y = 0, x2 = x, y2 = y] = stroke.points
  const kind = stroke.kind ?? 'path'
  if (kind === 'note') return { left: x, top: y, right: x + NOTE_SIZE / 1000, bottom: y + (NOTE_SIZE / 1000) * aspect }
  if (kind === 'text') {
    const font = textSize(stroke.width, false)
    const lines = (stroke.text ?? '').split('\n')
    const widest = Math.max(0, ...lines.map((line) => measure(line, font)))
    return { left: x, top: y, right: x + widest / 1000, bottom: y + ((lines.length * font * 1.25) / 1000) * aspect }
  }
  if (kind === 'path') {
    const xs = stroke.points.filter((_, index) => index % 2 === 0)
    const ys = stroke.points.filter((_, index) => index % 2 === 1)
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
  }
  return { left: Math.min(x, x2), top: Math.min(y, y2), right: Math.max(x, x2), bottom: Math.max(y, y2) }
}
