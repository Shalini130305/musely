// Centralised helpers for building canonical MUSELY links and
// official third-party share/deep-link URLs.

export const CANONICAL_APP_URL = 'https://musely-in.vercel.app';

/**
 * Resolve the public origin used inside shared links.
 * Local development and native (Capacitor) origins are not reachable by
 * recipients, so those fall back to the published production domain.
 */
export function getAppBaseUrl(): string {
  if (typeof window === 'undefined') return CANONICAL_APP_URL;

  const { hostname, origin, protocol } = window.location;

  if (
    !origin ||
    protocol === 'file:' ||
    protocol === 'capacitor:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local')
  ) {
    return CANONICAL_APP_URL;
  }

  return origin.replace(/\/$/, '');
}

export function buildPostUrl(postId: string): string {
  return `${getAppBaseUrl()}/post/${encodeURIComponent(postId)}`;
}

export function buildProfileUrl(username: string): string {
  return `${getAppBaseUrl()}/profile/${encodeURIComponent(username)}`;
}

export function buildCommunityUrl(slug: string): string {
  return `${getAppBaseUrl()}/communities/${encodeURIComponent(slug)}`;
}

export function buildCollectionUrl(collectionId: string): string {
  return `${getAppBaseUrl()}/collections/${encodeURIComponent(collectionId)}`;
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|iemobile|opera mini|mobile/i.test(navigator.userAgent);
}

export function canUseNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Trim a caption so WhatsApp / Telegram previews stay readable. */
export function buildShareText(title: string, caption?: string | null, maxLength = 140): string {
  const cleanTitle = (title || 'A post on MUSELY').trim();
  const cleanCaption = (caption || '').replace(/\s+/g, ' ').trim();

  if (!cleanCaption) return cleanTitle;
  if (cleanCaption.length <= maxLength) return `${cleanTitle} — ${cleanCaption}`;
  return `${cleanTitle} — ${cleanCaption.slice(0, maxLength - 1)}…`;
}

export function buildWhatsAppUrl(url: string, text: string): string {
  const message = encodeURIComponent(`${text}\n${url}`);
  // wa.me opens the OS app on mobile and WhatsApp Web / Desktop on desktop,
  // always letting the user pick the recipient themselves.
  return `https://wa.me/?text=${message}`;
}

export function buildTelegramUrl(url: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

export function buildXUrl(url: string, text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export function buildFacebookUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

/**
 * Instagram and Snapchat expose no public web endpoint that publishes or
 * prefills arbitrary content, so those flows rely on the OS share sheet and
 * app deep links, with Copy Link as the guaranteed fallback.
 */
export const INSTAGRAM_APP_URL = 'instagram://app';
export const SNAPCHAT_APP_URL = 'snapchat://';

/** Open a URL in a new tab, returning false when the popup was blocked. */
export function openExternalWindow(url: string): boolean {
  if (typeof window === 'undefined') return false;
  // Note: passing "noopener" as a window feature makes window.open return
  // null in Chromium, so the opener is severed manually instead.
  const opened = window.open(url, '_blank');
  if (!opened) {
    // Popup blocked — retry through a same-tab navigation so sharing still works.
    window.location.href = url;
    return false;
  }
  try {
    opened.opener = null;
  } catch {
    // cross-origin access is expected here
  }
  return true;
}

/** Clipboard helper with a legacy fallback for older / insecure contexts. */
export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to legacy path
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
