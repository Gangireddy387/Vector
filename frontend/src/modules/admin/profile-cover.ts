/** A soft banner in the person's own colour, so every profile and people card looks a little different. */
export const profileCoverStyle = (color = '#6366f1') => ({
  backgroundImage: `radial-gradient(circle at 85% 20%, rgb(255 255 255 / 0.25), transparent 45%), linear-gradient(120deg, ${color}, color-mix(in oklab, ${color} 45%, #0ea5e9))`,
})
