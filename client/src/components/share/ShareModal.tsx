import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Copy, Check, Share2, Download, FileText, Image as ImageIcon, Film,
  Lock, MessageSquare, Link2, Loader2, ArrowUpRight
} from 'lucide-react';
import api from '@/services/api';
import { downloadFile } from '@/utils/downloadHelper';
import {
  buildWhatsAppUrl,
  buildTelegramUrl,
  buildXUrl,
  buildFacebookUrl,
  buildShareText,
  canUseNativeShare,
  copyToClipboard,
  isMobileDevice,
  loadShareFile,
  openExternalWindow,
  shareMediaWithSystem,
  supportsFileSharing,
  buildShareFileName,
  resolveShareMimeType,
  MAX_SHARE_FILE_BYTES,
  INSTAGRAM_APP_URL,
  SNAPCHAT_APP_URL,
  type MediaShareResult,
} from '@/utils/shareLinks';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export interface ShareItem {
  id: string; // post ID, username, community slug, etc.
  type: 'post' | 'profile' | 'community' | 'collection';
  title: string;
  text?: string;
  url: string; // Canonical URL
  authorUsername?: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string | null;
  caption?: string | null;
  // Media & Download details if applicable
  mediaUrl?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  docType?: string | null;
  fileSize?: number | null;
  isPrivate?: boolean;
  canDownload?: boolean;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ShareItem | null;
  /** Opens the in-app MUSELY Chat conversation picker (posts only). */
  onShareToChat?: () => void;
}

type TipKind = 'instagram' | 'snapchat';
type MediaFileState = 'idle' | 'loading' | 'ready' | 'unavailable';

// Session deduplication cache to avoid duplicate share-tracking increments
const sessionTrackedShares = new Set<string>();

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, item, onShareToChat }) => {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [busyTarget, setBusyTarget] = useState<string | null>(null);
  const [tip, setTip] = useState<TipKind | null>(null);
  const [mediaState, setMediaState] = useState<MediaFileState>('idle');

  // Source media that can be handed to the OS share sheet as a real file.
  const mediaSource = item?.fileUrl || item?.videoUrl || item?.imageUrl || item?.mediaUrl || null;
  const mediaFileName = item ? item.fileName || item.title : null;
  const mediaMimeHint = item
    ? item.fileType || (item.videoUrl ? 'video/mp4' : item.imageUrl ? 'image/jpeg' : null)
    : null;
  const isVideoMedia = Boolean(item?.videoUrl) || Boolean(item?.fileType?.startsWith('video/'));
  const isFileMedia = Boolean(item?.fileUrl) && !isVideoMedia && !item?.imageUrl;
  const shareablePostId = item?.type === 'post' ? item.id : null;
  // Which stored asset the same-origin proxy should stream back.
  const mediaKind: 'image' | 'video' | 'file' = isVideoMedia ? 'video' : isFileMedia ? 'file' : 'image';
  // Large videos are fetched only on tap so opening the dialog stays light.
  const prefetchMedia = !isVideoMedia || !item?.fileSize || item.fileSize <= 25 * 1024 * 1024;

  // The blob is fetched once per media URL so the tap that opens the OS sheet
  // does not lose the user-gesture while downloading.
  const shareFileRef = useRef<{ url: string; promise: Promise<File | null> | null; file: File | null }>({
    url: '',
    promise: null,
    file: null,
  });

  const loadMediaFile = useCallback(async (): Promise<File | null> => {
    if (!mediaSource) return null;

    if (shareFileRef.current.url !== mediaSource) {
      shareFileRef.current = { url: mediaSource, promise: null, file: null };
    }
    const cache = shareFileRef.current;
    if (cache.file) return cache.file;

    if (!cache.promise) {
      cache.promise = (async () => {
        const direct = await loadShareFile(mediaSource, mediaFileName, mediaMimeHint);
        if (direct) {
          cache.file = direct;
          setMediaState('ready');
          return direct;
        }

        // Fallback: same-origin proxy so storage CORS policies cannot block
        // file sharing. Visibility is re-checked by the API.
        if (shareablePostId) {
          try {
            const response = await api.get(`/posts/${shareablePostId}/media`, {
              params: { kind: mediaKind },
              responseType: 'blob',
            });
            const blob = response.data as Blob;
            if (blob && blob.size > 0 && blob.size <= MAX_SHARE_FILE_BYTES) {
              const blobType = blob.type && blob.type !== 'application/octet-stream' ? blob.type : null;
              const mimeType = blobType || resolveShareMimeType(mediaSource, mediaFileName, mediaMimeHint);
              const file = new File([blob], buildShareFileName(mediaSource, mediaFileName, mimeType), { type: mimeType });
              cache.file = file;
              setMediaState('ready');
              return file;
            }
          } catch {
            // fall through to the unsupported state below
          }
        }

        setMediaState('unavailable');
        return null;
      })()
        .catch(() => {
          setMediaState('unavailable');
          return null;
        })
        .finally(() => {
          cache.promise = null;
        });
    }

    return cache.promise;
  }, [mediaSource, mediaFileName, mediaMimeHint, shareablePostId, mediaKind]);

  useEffect(() => {
    if (!isOpen || !mediaSource) return;

    // Devices without file sharing can only receive the link, so never download.
    if (!supportsFileSharing()) {
      setMediaState('unavailable');
      return;
    }

    if (!prefetchMedia) {
      setMediaState('idle');
      return;
    }

    // Preparing the file before the tap keeps the user gesture intact for
    // navigator.share, which rejects when activation has already expired.
    setMediaState('loading');
    void loadMediaFile();
  }, [isOpen, mediaSource, prefetchMedia, loadMediaFile]);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setTip(null);
      setBusyTarget(null);
      setMediaState('idle');
      shareFileRef.current = { url: '', promise: null, file: null };
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  // Track share analytics with deduplication
  const trackShare = (platform: string) => {
    if (item.type !== 'post') return;
    const dedupeKey = `${item.type}:${item.id}:${platform}`;
    if (sessionTrackedShares.has(dedupeKey)) return;
    sessionTrackedShares.add(dedupeKey);

    api.post('/analytics/track', {
      eventType: 'SHARE',
      postId: item.id,
      metadata: { targetType: item.type, targetId: item.id, platform },
    }).catch(() => {
      // quiet catch for analytics
    });
  };

  const handleCopyLink = async (): Promise<boolean> => {
    const ok = await copyToClipboard(item.url);
    if (!ok) {
      toast.error('Could not copy the link. Please copy it manually.');
      return false;
    }
    setCopied(true);
    trackShare('copy_link');
    toast.success('Link copied to clipboard!');
    window.setTimeout(() => setCopied(false), 2500);
    return true;
  };

  /** Wraps every tile so double taps cannot fire the action twice. */
  const runTarget = async (id: string, action: () => Promise<void> | void) => {
    if (busyTarget) return;
    setBusyTarget(id);
    try {
      await action();
    } finally {
      setBusyTarget(null);
    }
  };

  const shareText = buildShareText(item.title, item.caption || item.text);

  /**
   * Try to attach the real media file first so the platform receives an image
   * or video instead of only a URL. Never reports success when only a link is sent.
   */
  const tryFileShare = async (platform: string): Promise<MediaShareResult> => {
    if (!mediaSource || !supportsFileSharing()) return 'unsupported';

    if (!shareFileRef.current.file) setMediaState('loading');
    const file = await loadMediaFile();
    const result = await shareMediaWithSystem({
      file,
      title: item.title,
      text: shareText,
      url: item.url,
    });

    if (result === 'shared') {
      trackShare(`${platform}_file`);
      toast.success('Shared as a file');
      onClose();
    }

    return result;
  };

  // 1. MUSELY Chat — opens the in-app conversation picker
  const handleMuselyChat = () => {
    trackShare('musely_chat');
    onClose();
    onShareToChat?.();
  };

  // 2. WhatsApp — real file through the OS share sheet, wa.me link otherwise
  const handleWhatsApp = async () => {
    const fileResult = await tryFileShare('whatsapp');
    if (fileResult === 'shared' || fileResult === 'cancelled') return;

    trackShare('whatsapp');
    openExternalWindow(buildWhatsAppUrl(item.url, shareText));
    toast.success(mediaSource ? 'Opening WhatsApp with the post link…' : 'Opening WhatsApp…');
    onClose();
  };

  // 3. Instagram — OS share sheet where available, Copy Link otherwise
  const handleInstagram = async () => {
    setTip(null);
    const fileResult = await tryFileShare('instagram');
    if (fileResult === 'shared' || fileResult === 'cancelled') return;

    if (!mediaSource && canUseNativeShare()) {
      try {
        await navigator.share({ title: item.title, text: shareText, url: item.url });
        trackShare('instagram_native');
        toast.success('Shared successfully!');
        onClose();
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    trackShare('instagram_copy');
    setTip('instagram');
    await handleCopyLink();
  };

  // 4. Snapchat — OS share sheet where available, Copy Link otherwise
  const handleSnapchat = async () => {
    setTip(null);
    const fileResult = await tryFileShare('snapchat');
    if (fileResult === 'shared' || fileResult === 'cancelled') return;

    if (!mediaSource && canUseNativeShare()) {
      try {
        await navigator.share({ title: item.title, text: shareText, url: item.url });
        trackShare('snapchat_native');
        toast.success('Shared successfully!');
        onClose();
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    trackShare('snapchat_copy');
    setTip('snapchat');
    await handleCopyLink();
  };

  // 5. Facebook — real file via OS sheet first, official share dialog otherwise
  const handleFacebook = async () => {
    const fileResult = await tryFileShare('facebook');
    if (fileResult === 'shared' || fileResult === 'cancelled') return;

    trackShare('facebook');
    openExternalWindow(buildFacebookUrl(item.url));
    toast.success('Opening Facebook…');
    onClose();
  };

  // 6. Telegram — official share URL
  const handleTelegram = async () => {
    const fileResult = await tryFileShare('telegram');
    if (fileResult === 'shared' || fileResult === 'cancelled') return;

    trackShare('telegram');
    openExternalWindow(buildTelegramUrl(item.url, shareText));
    toast.success('Opening Telegram…');
    onClose();
  };

  // 7. X — official intent URL
  const handleX = async () => {
    const fileResult = await tryFileShare('x');
    if (fileResult === 'shared' || fileResult === 'cancelled') return;

    trackShare('x');
    openExternalWindow(buildXUrl(item.url, shareText));
    toast.success('Opening X…');
    onClose();
  };

  // 8. Native / More — Web Share API with graceful fallbacks
  const handleNativeShare = async () => {
    const fileResult = await tryFileShare('native');
    if (fileResult === 'shared' || fileResult === 'cancelled') return;

    if (canUseNativeShare()) {
      try {
        await navigator.share({ title: item.title, text: shareText, url: item.url });
        trackShare('native');
        toast.success('Shared successfully!');
        onClose();
        return;
      } catch (err: any) {
        // AbortError indicates the user cancelled the OS sheet — not an error.
        if (err?.name === 'AbortError') return;
      }
    }

    toast(
      mediaSource
        ? 'This browser cannot attach files. The post link was copied instead.'
        : 'More sharing options are not available in this browser. Link copied instead.',
      { icon: 'ℹ️' }
    );
    await handleCopyLink();
  };

  const openMobileApp = (target: TipKind) => {
    if (!isMobileDevice()) {
      toast(`${target === 'instagram' ? 'Instagram' : 'Snapchat'} can only be opened on a mobile device.`);
      return;
    }
    window.location.href = target === 'instagram' ? INSTAGRAM_APP_URL : SNAPCHAT_APP_URL;
  };

  // Download handler
  const hasDownload =
    item.canDownload !== false &&
    item.type === 'post' &&
    Boolean(item.fileUrl || item.imageUrl || item.videoUrl);

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadFile({
        postId: item.id,
        url: item.fileUrl || item.videoUrl || item.imageUrl || '',
        fileName: item.fileName || undefined,
        mimeType: item.fileType || undefined,
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const isVideo = Boolean(item.videoUrl) || item.fileType?.includes('video');
  const isDoc = Boolean(item.docType) || Boolean(item.fileUrl) || item.fileType?.includes('pdf') || item.fileType?.includes('word');
  const thumbUrl = item.imageUrl || item.mediaUrl || null;

  const tiles: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
    className: string;
    onClick: () => void | Promise<void>;
    disabled?: boolean;
  }> = [];

  if (item.type === 'post' && onShareToChat) {
    tiles.push({
      id: 'musely',
      label: 'MUSELY Chat',
      icon: <MessageSquare className="w-5 h-5" />,
      className: 'bg-gradient-to-br from-[#FF4F9A] to-[#863BFF] text-white',
      onClick: handleMuselyChat,
    });
  }

  tiles.push(
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: <WhatsAppIcon />,
      className: 'bg-[#25D366] text-white',
      onClick: handleWhatsApp,
    },
    {
      id: 'instagram',
      label: 'Instagram',
      icon: <InstagramIcon />,
      className: 'bg-gradient-to-tr from-[#FF543E] via-[#C837AB] to-[#6E3BCE] text-white',
      onClick: handleInstagram,
    },
    {
      id: 'snapchat',
      label: 'Snapchat',
      icon: <SnapchatIcon />,
      className: 'bg-[#FFFC00] text-black',
      onClick: handleSnapchat,
    },
    {
      id: 'facebook',
      label: 'Facebook',
      icon: <FacebookIcon />,
      className: 'bg-[#1877F2] text-white',
      onClick: handleFacebook,
    },
    {
      id: 'telegram',
      label: 'Telegram',
      icon: <TelegramIcon />,
      className: 'bg-[#229ED9] text-white',
      onClick: handleTelegram,
    },
    {
      id: 'x',
      label: 'X',
      icon: <XIcon />,
      className: 'bg-black text-white border border-white/20',
      onClick: handleX,
    },
    {
      id: 'copy',
      label: copied ? 'Copied!' : 'Copy Link',
      icon: copied ? <Check className="w-5 h-5" /> : <Link2 className="w-5 h-5" />,
      className: copied ? 'bg-emerald-500 text-white' : 'bg-[#26262E] text-[#E4E4E7]',
      onClick: () => { void handleCopyLink(); },
    },
    {
      id: 'native',
      label: 'More',
      icon: <Share2 className="w-5 h-5" />,
      className: 'bg-[#2A2A34] text-[#E4E4E7]',
      onClick: handleNativeShare,
    }
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div
        className="w-full sm:max-w-md bg-[#16161B] border border-[#303039] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl overflow-hidden relative animate-scale-up max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#303039]/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#FF4F9A]/15 border border-[#FF4F9A]/30 flex items-center justify-center text-[#FF4F9A] shrink-0">
              <Share2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="share-modal-title" className="text-sm sm:text-base font-bold text-white leading-tight">
                Share {item.type === 'profile' ? 'Creator Profile' : item.type === 'community' ? 'Community' : item.type === 'collection' ? 'Collection' : 'Post'}
              </h3>
              <p className="text-[11px] text-[#B8B8C2] truncate max-w-[240px]">{item.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#757582] hover:text-white hover:bg-[#26262E] transition-colors shrink-0"
            aria-label="Close share dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Shared item preview */}
        <div className="flex items-center gap-3 mt-4 p-2.5 rounded-2xl bg-[#1C1C22] border border-[#303039]">
          {thumbUrl ? (
            <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-black shrink-0">
              <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
              {isVideo && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                  <Film className="w-4 h-4 text-white" />
                </span>
              )}
            </div>
          ) : (
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#FF4F9A]/25 to-[#863BFF]/25 border border-[#303039] flex items-center justify-center text-[#FF8FBD] shrink-0">
              <FileText className="w-5 h-5" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate leading-snug">{item.title}</p>
            {(item.caption || item.text) && (
              <p className="text-[11px] text-[#B8B8C2] line-clamp-2 leading-snug mt-0.5">
                {item.caption || item.text}
              </p>
            )}
            {item.authorUsername && (
              <p className="text-[10px] text-[#FF8FBD] truncate mt-1">@{item.authorUsername}</p>
            )}
          </div>

          {item.isPrivate && (
            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-950/70 border border-amber-500/30 text-[10px] font-semibold text-amber-300">
              <Lock className="w-3 h-3" /> Private
            </span>
          )}
        </div>

        {/* Media file attachment state */}
        {mediaSource && (
          <div className="mt-2.5 flex items-start gap-2 px-3 py-2 rounded-2xl bg-[#1C1C22] border border-[#303039] text-[11px] leading-snug">
            {mediaState === 'ready' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-emerald-300">
                  Media ready — supported apps receive the actual {isVideo ? 'video file' : 'image file'}.
                </span>
              </>
            ) : mediaState === 'unavailable' ? (
              <>
                <Link2 className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span className="text-amber-300">
                  This browser cannot attach the media file, so the post link is shared instead.
                </span>
              </>
            ) : mediaState === 'idle' ? (
              <>
                <Film className="w-3.5 h-3.5 text-[#FF4F9A] shrink-0 mt-0.5" />
                <span className="text-[#B8B8C2]">
                  The actual {isVideo ? 'video' : 'image'} is attached on devices that support file sharing; otherwise the post link is used.
                </span>
              </>
            ) : (
              <>
                <Loader2 className="w-3.5 h-3.5 text-[#FF4F9A] animate-spin shrink-0 mt-0.5" />
                <span className="text-[#B8B8C2]">Preparing media for file sharing…</span>
              </>
            )}
          </div>
        )}

        {/* Universal share targets */}
        <div className="pt-5 pb-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#757582] mb-3">Share to</p>
          <div className="grid grid-cols-3 gap-2.5">
            {tiles.map(tile => {
              const isBusy = busyTarget === tile.id;
              return (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => runTarget(tile.id, tile.onClick)}
                  disabled={Boolean(busyTarget)}
                  className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-[#1C1C22] hover:bg-[#26262E] border border-[#303039] text-white transition-all active:scale-95 group disabled:opacity-60 disabled:pointer-events-none"
                  title={tile.label}
                >
                  <div className={clsx('w-11 h-11 rounded-2xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform', tile.className)}>
                    {isBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : tile.icon}
                  </div>
                  <span className="text-[11px] font-medium text-[#D8D8E0] leading-tight text-center">{tile.label}</span>
                </button>
              );
            })}
          </div>

          {/* Platform limitation notices */}
          {tip && (
            <div className="mt-3 p-3 rounded-2xl bg-purple-950/40 border border-purple-500/30 text-xs text-purple-200 animate-fade-in flex items-start gap-2">
              <span className="text-purple-400 font-bold shrink-0">Note:</span>
              <div className="space-y-1.5">
                <p>
                  {tip === 'instagram'
                    ? 'Instagram does not allow websites to publish or prefill posts, stories or DMs. Use your device share sheet, or paste the copied link into Instagram.'
                    : 'Snapchat does not accept shared links from websites. Use your device share sheet, or paste the copied link into a Snap or Chat.'}
                </p>
                <button
                  type="button"
                  onClick={() => openMobileApp(tip)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-100 underline underline-offset-2 hover:text-white"
                >
                  Open {tip === 'instagram' ? 'Instagram' : 'Snapchat'} <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Canonical link */}
        <div className="pt-3 pb-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#757582] mb-2">Canonical Link</p>
          <div className="flex items-center gap-2 p-1.5 pl-3.5 bg-[#1C1C22] border border-[#303039] rounded-2xl">
            <input
              type="text"
              readOnly
              value={item.url}
              className="bg-transparent text-xs text-white flex-1 outline-none truncate"
              onFocus={e => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 active:scale-95',
                copied ? 'bg-emerald-500 text-white shadow-sm' : 'bg-[#FF4F9A] hover:bg-[#FF4F9A]/90 text-white'
              )}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Download Section */}
        {hasDownload && (
          <div className="pt-4 border-t border-[#303039]/60">
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#1C1C22] border border-[#303039]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#FF4F9A]/15 border border-[#FF4F9A]/30 flex items-center justify-center text-[#FF4F9A] shrink-0">
                  {isDoc ? <FileText className="w-4 h-4" /> : isVideo ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">
                    {item.fileName || `${item.title}.${isDoc ? (item.docType?.toLowerCase() || 'pdf') : isVideo ? 'mp4' : 'jpg'}`}
                  </p>
                  <p className="text-[10px] text-[#B8B8C2]">
                    {isDoc ? `${item.docType || 'Document'} File` : isVideo ? 'Video File' : 'High-Res Media'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0',
                  isDownloading
                    ? 'bg-[#26262E] text-[#757582] cursor-not-allowed'
                    : 'bg-[#FF4F9A] hover:bg-[#FF4F9A]/90 text-white shadow-md active:scale-95'
                )}
              >
                {isDownloading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>{isDownloading ? 'Downloading...' : 'Download'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Restricted Download Notice */}
        {item.type === 'post' && item.canDownload === false && (
          <div className="pt-3 border-t border-[#303039]/60 flex items-center gap-2 text-[11px] text-[#757582]">
            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Download restricted by creator privacy settings.</span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ---- Inline brand icons (lucide has no official brand glyphs) ---- */

function WhatsAppIcon() {
  return (
    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.699c.96.525 1.761.815 2.796.815 3.181 0 5.767-2.587 5.768-5.766.001-3.182-2.585-5.767-5.768-5.767zm7.545 5.766c-.001 4.162-3.385 7.546-7.545 7.546-1.309 0-2.54-.336-3.619-.927l-4.412 1.157 1.177-4.298c-.689-1.127-1.077-2.457-1.077-3.834.001-4.162 3.385-7.546 7.546-7.546 4.16 0 7.544 3.384 7.545 7.546z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function SnapchatIcon() {
  return (
    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.02 2.5c2.63 0 4.42 1.93 4.42 4.55 0 .42-.03.85-.08 1.26.05.02.1.03.16.03.31 0 .62-.13.85-.36.2-.2.47-.31.75-.31.2 0 .4.08.55.21.19.16.29.39.29.64 0 .31-.18.59-.47.78-.3.2-.68.33-1.1.42-.28.06-.42.16-.49.29-.07.13-.05.31.05.55.17.41.44.78.79 1.07.3.25.63.43.99.55.3.1.5.38.5.7 0 .21-.09.4-.24.53-.16.14-.36.22-.58.22-.28 0-.66-.14-1.1-.32-.28-.1-.6-.16-.92-.16-.39 0-.76.08-1.11.23-.46.2-.93.46-1.39.72-.56.32-1.16.62-1.78.73-.28.05-.55.07-.81.07s-.53-.02-.81-.07c-.62-.11-1.22-.41-1.78-.73-.46-.26-.93-.52-1.39-.72-.35-.15-.72-.23-1.11-.23-.32 0-.64.06-.92.16-.44.18-.82.32-1.1.32-.22 0-.42-.08-.58-.22a.73.73 0 0 1-.24-.53c0-.32.2-.6.5-.7.36-.12.69-.3.99-.55.35-.29.62-.66.79-1.07.1-.24.12-.42.05-.55-.07-.13-.21-.23-.49-.29-.42-.09-.8-.22-1.1-.42-.29-.19-.47-.47-.47-.78 0-.25.1-.48.29-.64.15-.13.35-.21.55-.21.28 0 .55.11.75.31.23.23.54.36.85.36.06 0 .11-.01.16-.03-.05-.41-.08-.84-.08-1.26C7.6 4.43 9.39 2.5 12.02 2.5z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.9h2.78l-.45 2.9h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21.94 4.31 18.9 18.65c-.23 1.02-.84 1.27-1.7.79l-4.7-3.46-2.27 2.18c-.25.25-.46.46-.94.46l.33-4.77 8.68-7.84c.38-.34-.08-.53-.58-.19L6.35 12.43l-4.62-1.44c-1-.31-1.02-1 .21-1.48L20.6 2.86c.84-.31 1.57.19 1.34 1.45z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
