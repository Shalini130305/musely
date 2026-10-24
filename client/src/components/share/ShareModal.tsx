import React, { useState, useEffect } from 'react';
import {
  X, Copy, Check, Share2, Download, ExternalLink,
  Mail, Send, FileText, Image as ImageIcon, Film, Lock, Globe
} from 'lucide-react';
import api from '@/services/api';
import { downloadFile } from '@/utils/downloadHelper';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export interface ShareItem {
  id: string; // post ID, username, community slug, etc.
  type: 'post' | 'profile' | 'community' | 'collection';
  title: string;
  text?: string;
  url: string; // Canonical URL
  authorUsername?: string;
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
}

// Session deduplication cache to avoid duplicate share tracking increments
const sessionTrackedShares = new Set<string>();

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, item }) => {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showInstagramTip, setShowInstagramTip] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setShowInstagramTip(false);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  // Track share analytics with deduplication
  const trackShare = (platform: string) => {
    const dedupeKey = `${item.type}:${item.id}:${platform}`;
    if (sessionTrackedShares.has(dedupeKey)) return;
    sessionTrackedShares.add(dedupeKey);

    api.post('/analytics/track', {
      eventType: 'SHARE',
      postId: item.type === 'post' ? item.id : undefined,
      metadata: {
        targetType: item.type,
        targetId: item.id,
        platform,
      },
    }).catch(() => {
      // quiet catch for analytics
    });
  };

  // 1. Native Device Share
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          text: item.text || item.title,
          url: item.url,
        });
        trackShare('native');
        toast.success('Shared successfully!');
        onClose();
      } catch (err: any) {
        // AbortError indicates user cancelled native share dialog: do not treat as error
        if (err.name !== 'AbortError') {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  // 2. Copy Link
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(true);
      trackShare('copy_link');
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Failed to copy link. Please copy the URL manually.');
    }
  };

  // 3. WhatsApp
  const handleWhatsApp = () => {
    const shareMessage = `${item.title ? `${item.title}\n` : ''}${item.url}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    trackShare('whatsapp');
  };

  // 4. Instagram
  const handleInstagram = async () => {
    setShowInstagramTip(true);
    // On mobile devices supporting navigator.share, the OS share sheet lets users send directly to Instagram DM or Stories
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          text: item.text || item.title,
          url: item.url,
        });
        trackShare('instagram_native');
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    // Fallback: Copy link and give clear guidance
    handleCopyLink();
  };

  // 5. Twitter / X
  const handleTwitter = () => {
    const text = item.title || 'Check this out on MUSELY';
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(item.url)}&via=musely_in`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
    trackShare('twitter');
  };

  // 6. Telegram
  const handleTelegram = () => {
    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(item.url)}&text=${encodeURIComponent(item.title)}`;
    window.open(telegramUrl, '_blank', 'noopener,noreferrer');
    trackShare('telegram');
  };

  // 7. Email
  const handleEmail = () => {
    const subject = item.title || 'Shared from MUSELY';
    const body = `${item.text ? `${item.text}\n\n` : ''}Explore this on MUSELY: ${item.url}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    trackShare('email');
  };

  // 8. Download Handler
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div
        className="w-full max-w-md bg-[#16161B] border border-[#303039] rounded-3xl p-6 shadow-2xl overflow-hidden relative animate-scale-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#303039]/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FF4F9A]/15 border border-[#FF4F9A]/30 flex items-center justify-center text-[#FF4F9A]">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 id="share-modal-title" className="text-sm sm:text-base font-bold text-white leading-tight">
                Share {item.type === 'profile' ? 'Creator Profile' : item.type === 'community' ? 'Community' : 'Post'}
              </h3>
              <p className="text-[11px] text-[#B8B8C2] truncate max-w-[240px]">
                {item.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#757582] hover:text-white hover:bg-[#26262E] transition-colors"
            aria-label="Close share dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Social Share Options */}
        <div className="py-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#757582] mb-3">
            Share to
          </p>
          <div className="grid grid-cols-4 gap-3 text-center">
            {/* Native Share Sheet */}
            <button
              onClick={handleNativeShare}
              className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-[#1C1C22] hover:bg-[#26262E] border border-[#303039] text-white transition-all active:scale-95 group"
              title="Share with apps on your device"
            >
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF4F9A] to-[#863bff] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                <Share2 className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-medium text-[#D8D8E0]">Device</span>
            </button>

            {/* WhatsApp */}
            <button
              onClick={handleWhatsApp}
              className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-[#1C1C22] hover:bg-[#26262E] border border-[#303039] text-white transition-all active:scale-95 group"
              title="Share via WhatsApp"
            >
              <div className="w-11 h-11 rounded-2xl bg-[#25D366] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.699c.96.525 1.761.815 2.796.815 3.181 0 5.767-2.587 5.768-5.766.001-3.182-2.585-5.767-5.768-5.767zm7.545 5.766c-.001 4.162-3.385 7.546-7.545 7.546-1.309 0-2.54-.336-3.619-.927l-4.412 1.157 1.177-4.298c-.689-1.127-1.077-2.457-1.077-3.834.001-4.162 3.385-7.546 7.546-7.546 4.16 0 7.544 3.384 7.545 7.546z"/>
                </svg>
              </div>
              <span className="text-[11px] font-medium text-[#D8D8E0]">WhatsApp</span>
            </button>

            {/* Instagram */}
            <button
              onClick={handleInstagram}
              className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-[#1C1C22] hover:bg-[#26262E] border border-[#303039] text-white transition-all active:scale-95 group"
              title="Share via Instagram"
            >
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#FF543E] via-[#C837AB] to-[#6E3BCE] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </div>
              <span className="text-[11px] font-medium text-[#D8D8E0]">Instagram</span>
            </button>

            {/* Twitter / X */}
            <button
              onClick={handleTwitter}
              className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-[#1C1C22] hover:bg-[#26262E] border border-[#303039] text-white transition-all active:scale-95 group"
              title="Share on X"
            >
              <div className="w-11 h-11 rounded-2xl bg-black border border-white/20 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </div>
              <span className="text-[11px] font-medium text-[#D8D8E0]">X (Twitter)</span>
            </button>
          </div>

          {/* Instagram Notice / Helper */}
          {showInstagramTip && (
            <div className="mt-3 p-3 rounded-2xl bg-purple-950/40 border border-purple-500/30 text-xs text-purple-200 animate-fade-in flex items-start gap-2">
              <span className="text-purple-400 font-bold shrink-0">Note:</span>
              <span>
                Web browsers cannot post directly to Instagram. Use native device share on mobile, or copy this link into your Instagram Bio, Story, or Direct Message.
              </span>
            </div>
          )}
        </div>

        {/* Copy Link Input Bar */}
        <div className="pt-2 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#757582] mb-2">
            Canonical Link
          </p>
          <div className="flex items-center gap-2 p-1.5 pl-3.5 bg-[#1C1C22] border border-[#303039] rounded-2xl">
            <input
              type="text"
              readOnly
              value={item.url}
              className="bg-transparent text-xs text-white flex-1 outline-none truncate"
            />
            <button
              onClick={handleCopyLink}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 active:scale-95',
                copied
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'bg-[#FF4F9A] hover:bg-[#FF4F9A]/90 text-white'
              )}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Secondary Channels (Telegram, Email) */}
        <div className="flex items-center gap-2 pb-4">
          <button
            onClick={handleTelegram}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#1C1C22] hover:bg-[#26262E] border border-[#303039] text-xs font-medium text-[#D8D8E0] transition-colors"
          >
            <Send className="w-3.5 h-3.5 text-sky-400" />
            Telegram
          </button>
          <button
            onClick={handleEmail}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#1C1C22] hover:bg-[#26262E] border border-[#303039] text-xs font-medium text-[#D8D8E0] transition-colors"
          >
            <Mail className="w-3.5 h-3.5 text-amber-400" />
            Email
          </button>
        </div>

        {/* Download Section (when authorized and downloadable) */}
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
