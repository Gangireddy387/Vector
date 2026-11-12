/**
 * Recordings saved before their length was written into the file report an endless duration, so the player shows no
 * timeline and cannot seek. Jumping far ahead makes the browser read to the end and learn the real length; then the
 * video goes back to where it was. Resolves once the length is known (immediately for files that have it).
 */
export function revealDuration(video: HTMLVideoElement): Promise<void> {
  if (Number.isFinite(video.duration)) return Promise.resolve()
  return new Promise((resolve) => {
    const resume = video.currentTime
    const done = () => {
      clearTimeout(timer)
      video.removeEventListener('durationchange', onChange)
      video.currentTime = resume
      resolve()
    }
    const onChange = () => Number.isFinite(video.duration) && done()
    // Give up quietly on very slow connections: the video still plays, only without a timeline.
    const timer = setTimeout(done, 8000)
    video.addEventListener('durationchange', onChange)
    video.currentTime = Number.MAX_SAFE_INTEGER
  })
}
