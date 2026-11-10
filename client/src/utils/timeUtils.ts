/**
 * MUSELY Time Utilities
 * Instagram-style relative timestamps that update automatically.
 *
 * Examples:
 * - Just now
 * - 2 minutes ago
 * - 15 minutes ago
 * - 1 hour ago
 * - 5 hours ago
 * - Yesterday
 * - 3 days ago
 * - 2 weeks ago
 * - 1 month ago
 * - 1 year ago
 */

/**
 * Returns an Instagram-style relative timestamp string from an ISO date string.
 * Falls back gracefully if the input is invalid or missing.
 */
export function getRelativeTime(isoDate: string | null | undefined): string {
  if (!isoDate) return '';

  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return '';

  const now = Date.now();
  const diff = now - date.getTime(); // milliseconds

  if (diff < 0) return 'Just now'; // clock skew / slight future

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (weeks < 4) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

/**
 * Returns an exact formatted date and time for tooltip display (consistent timezone).
 */
export function getExactDateTime(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
