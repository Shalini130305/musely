// Curated SVG fallback with elegant dark aesthetic
export const FALLBACK_IMAGE = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" fill="none"><rect width="800" height="600" fill="%231E1E1E"/><rect x="40" y="40" width="720" height="520" rx="16" fill="%23262626"/><circle cx="400" cy="270" r="48" fill="%23C73059" fill-opacity="0.2"/><path d="M400 246C386.745 246 376 256.745 376 270C376 283.255 386.745 294 400 294C413.255 294 424 283.255 424 270C424 256.745 413.255 246 400 246ZM392 264C392 259.582 395.582 256 400 256C404.418 256 408 259.582 408 264C408 268.418 404.418 272 400 272C395.582 272 392 268.418 392 264Z" fill="%23C73059"/><text x="400" y="360" fill="%238C8C8C" font-family="system-ui, sans-serif" font-size="16" font-weight="500" text-anchor="middle">Visual preview unavailable</text></svg>`;

export function handleImageError(e: React.SyntheticEvent<HTMLImageElement, Event>) {
  const target = e.currentTarget;
  if (target.src !== FALLBACK_IMAGE) {
    target.src = FALLBACK_IMAGE;
  }
}
