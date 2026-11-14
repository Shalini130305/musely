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

/* ------------------------------------------------------------------ *
 * Actual media-file sharing (Web Share Level 2)
 * ------------------------------------------------------------------ */

/** Browsers and OS share sheets reject very large payloads. */
export const MAX_SHARE_FILE_BYTES = 100 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
};

const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  pdf: 'application/pdf',
};

function extensionFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const path = new URL(url, 'https://local.invalid').pathname;
    const match = path.match(/\.([a-z0-9]{2,5})$/i);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Resolve the MIME type from a hint, the file name, then the media URL. */
export function resolveShareMimeType(
  fileUrl: string,
  fileName?: string | null,
  mimeHint?: string | null,
): string {
  if (mimeHint && mimeHint.includes('/')) return mimeHint;
  const ext = extensionFromUrl(fileName) || extensionFromUrl(fileUrl);
  if (ext && EXTENSION_MIME[ext]) return EXTENSION_MIME[ext];
  return 'application/octet-stream';
}

/** Give the shared file a recognisable, MIME-correct filename. */
export function buildShareFileName(
  fileUrl: string,
  fileName?: string | null,
  mimeType?: string | null,
): string {
  const fallbackExt = MIME_EXTENSIONS[mimeType || ''] || extensionFromUrl(fileUrl) || 'bin';
  const safeName = (fileName || '')
    .trim()
    .split('/')
    .pop()!
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-');

  if (!safeName) {
    return `musely-share-${Date.now()}.${fallbackExt}`;
  }

  return /\.[a-z0-9]{2,5}$/i.test(safeName) ? safeName : `${safeName}.${fallbackExt}`;
}

/**
 * Feature-detect whether the OS share sheet accepts real files at all.
 * Used to avoid downloading media the device could never attach.
 */
export function supportsFileSharing(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  const canShare = (navigator as Navigator & { canShare?: (data?: ShareData) => boolean }).canShare;
  if (typeof canShare !== 'function' || typeof File === 'undefined') return false;
  try {
    const probe = new File([new Blob(['musely'])], 'probe.jpg', { type: 'image/jpeg' });
    return canShare.call(navigator, { files: [probe] }) === true;
  } catch {
    return false;
  }
}

/** Feature-detect actual file sharing (Web Share Level 2). */
export function canShareFiles(files: File[]): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  const canShare = (navigator as Navigator & { canShare?: (data?: ShareData) => boolean }).canShare;
  if (typeof canShare !== 'function') return false;
  try {
    return canShare({ files });
  } catch {
    return false;
  }
}

/**
 * Download the post media as a File so it can be handed to the OS share sheet.
 * Returns null when the media cannot be fetched or is too large.
 */
export async function loadShareFile(
  fileUrl: string | null | undefined,
  fileName?: string | null,
  mimeHint?: string | null,
): Promise<File | null> {
  if (!fileUrl || typeof window === 'undefined') return null;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(fileUrl, {
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const blob = await response.blob();
    if (!blob.size || blob.size > MAX_SHARE_FILE_BYTES) return null;

    const blobType = blob.type && blob.type !== 'application/octet-stream' ? blob.type : null;
    const mimeType = blobType || resolveShareMimeType(fileUrl, fileName, mimeHint);

    return new File([blob], buildShareFileName(fileUrl, fileName, mimeType), { type: mimeType });
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export type MediaShareResult = 'shared' | 'cancelled' | 'unsupported' | 'failed';

/** Hand a real media file to the OS share sheet (never claims success falsely). */
export async function shareMediaWithSystem(options: {
  file: File | null;
  title: string;
  text?: string;
  url?: string;
}): Promise<MediaShareResult> {
  const { file, title, text, url } = options;
  if (!file) return 'unsupported';
  if (!canUseNativeShare() || !canShareFiles([file])) return 'unsupported';

  const shareText = url ? `${text || title}\n${url}` : (text || title);

  try {
    await navigator.share({ files: [file], title, text: shareText });
    return 'shared';
  } catch (err: any) {
    if (err?.name === 'AbortError') return 'cancelled';
    return 'failed';
  }
}
