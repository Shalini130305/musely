import React, { useState } from 'react';
import {
  FileText, Download, ExternalLink, Maximize2, Minimize2,
  Eye, FileCheck, Film, Image as ImageIcon, X
} from 'lucide-react';
import { handleImageError } from '@/utils/imageFallback';
import { downloadFile } from '@/utils/downloadHelper';

interface DocumentViewerProps {
  post: {
    id: string;
    title: string;
    imageUrl: string;
    videoUrl?: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    fileType?: string | null;
    fileSize?: number | null;
    docType?: string | null;
    caption?: string | null;
    postType: string;
    createdAt?: string;
  };
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ post }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const formatFileSize = (bytes?: number | null): string => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isPdf =
    post.docType === 'PDF' ||
    post.fileType === 'application/pdf' ||
    post.fileName?.toLowerCase().endsWith('.pdf') ||
    post.fileUrl?.toLowerCase().includes('.pdf');

  const isWordDoc =
    post.docType === 'DOC' ||
    post.docType === 'DOCX' ||
    post.fileName?.toLowerCase().endsWith('.docx') ||
    post.fileName?.toLowerCase().endsWith('.doc') ||
    post.fileUrl?.toLowerCase().includes('.doc');

  const isVideo =
    post.postType === 'VIDEO' ||
    Boolean(post.videoUrl) ||
    post.docType === 'VIDEO';

  const downloadUrl = post.fileUrl || post.videoUrl || post.imageUrl;
  const fileName = post.fileName || `${post.title.replace(/[^a-zA-Z0-9_\-]/g, '_')}.${isPdf ? 'pdf' : isWordDoc ? 'docx' : isVideo ? 'mp4' : 'jpg'}`;

  const triggerDownload = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadFile({
        postId: post.id,
        url: downloadUrl,
        fileName,
        mimeType: post.fileType || undefined,
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // 1. PDF Document View
  if (isPdf && post.fileUrl) {
    return (
      <div className="w-full flex flex-col items-center">
        {/* Document Header & Actions */}
        <div className="w-full bg-[#1C1C22] border border-[#303039] rounded-2xl p-4 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-white truncate max-w-xs sm:max-w-md">
                {post.fileName || 'Document.pdf'}
              </h4>
              <p className="text-[11px] text-[#B8B8C2]">
                PDF Document {post.fileSize ? `• ${formatFileSize(post.fileSize)}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsFullscreen(prev => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#26262E] hover:bg-[#303039] text-[#B8B8C2] hover:text-white transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'View Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
            </button>

            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#26262E] hover:bg-[#303039] text-[#B8B8C2] hover:text-white transition-colors"
              title="Open in new window"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open</span>
            </a>

            <button
              onClick={triggerDownload}
              disabled={isDownloading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#FF4F9A] hover:bg-[#FF4F9A]/90 text-white shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              {isDownloading ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{isDownloading ? 'Downloading...' : 'Download PDF'}</span>
            </button>
          </div>
        </div>

        {/* Embedded PDF Viewer */}
        <div
          className={
            isFullscreen
              ? 'fixed inset-0 z-50 bg-[#0B0B0D]/95 backdrop-blur-xl p-4 flex flex-col'
              : 'relative w-full h-[65vh] min-h-[450px] bg-[#141418] border border-[#303039] rounded-2xl overflow-hidden shadow-inner'
          }
        >
          {isFullscreen && (
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-[#303039]">
              <span className="text-sm font-semibold text-white truncate">{post.fileName || post.title}</span>
              <button
                onClick={() => setIsFullscreen(false)}
                className="p-1.5 rounded-xl bg-[#26262E] text-white hover:bg-[#303039]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          <iframe
            src={`${post.fileUrl}#toolbar=1&navpanes=0`}
            title={post.title}
            className="w-full h-full border-0 rounded-xl bg-white"
          />
        </div>

        {post.caption && (
          <p className="mt-3 text-xs text-[#B8B8C2] italic text-center max-w-xl">
            "{post.caption}"
          </p>
        )}
      </div>
    );
  }

  // 2. Word Document View (DOC / DOCX)
  if (isWordDoc && post.fileUrl) {
    return (
      <div className="w-full bg-[#1C1C22] border border-[#303039] rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-center text-center shadow-lg">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-4 shadow-sm">
          <FileText className="w-8 h-8" />
        </div>

        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20 mb-2">
          {post.docType || 'DOCX'} Document
        </span>

        <h3 className="text-lg font-bold text-white mb-1 max-w-md truncate">
          {post.fileName || `${post.title}.docx`}
        </h3>

        <p className="text-xs text-[#B8B8C2] mb-6">
          {post.fileSize ? `File Size: ${formatFileSize(post.fileSize)}` : 'Document file ready for review'}
          {post.createdAt ? ` • Uploaded on ${new Date(post.createdAt).toLocaleDateString()}` : ''}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={triggerDownload}
            disabled={isDownloading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-semibold bg-[#FF4F9A] hover:bg-[#FF4F9A]/90 text-white shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            {isDownloading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{isDownloading ? 'Downloading...' : 'Download Document'}</span>
          </button>

          <a
            href={`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(downloadUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-[#26262E] hover:bg-[#303039] text-[#B8B8C2] hover:text-white border border-[#303039] transition-all"
          >
            <Eye className="w-4 h-4" />
            Preview with Office Viewer
          </a>
        </div>

        {post.caption && (
          <p className="mt-6 text-xs text-[#B8B8C2] italic max-w-lg border-t border-[#303039] pt-4">
            "{post.caption}"
          </p>
        )}
      </div>
    );
  }

  // 3. Video Player View
  if (isVideo && (post.videoUrl || post.fileUrl)) {
    const videoSource = post.videoUrl || post.fileUrl;
    return (
      <div className="w-full flex flex-col items-center">
        <div className="relative w-full max-h-[80vh] flex items-center justify-center rounded-2xl overflow-hidden bg-black shadow-lg">
          <video
            src={videoSource!}
            controls
            playsInline
            className="w-full h-auto max-h-[75vh] object-contain rounded-2xl"
          />
        </div>
        {post.caption && (
          <p className="mt-3 text-xs text-[#B8B8C2] italic text-center max-w-xl">
            "{post.caption}"
          </p>
        )}
      </div>
    );
  }

  // 4. Default: Image View with Fullscreen Lightbox Modal
  return (
    <div className="w-full flex flex-col items-center">
      <div
        onClick={() => setShowImageModal(true)}
        className="group relative w-full max-h-[80vh] flex items-center justify-center rounded-2xl overflow-hidden shadow-sm cursor-zoom-in"
      >
        <img
          src={post.imageUrl}
          alt={post.title}
          onError={handleImageError}
          className="w-full h-auto max-h-[75vh] object-contain rounded-2xl transition-transform duration-300 group-hover:scale-[1.01]"
        />

        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-md text-white p-2 rounded-xl">
          <Maximize2 className="w-4 h-4" />
        </div>
      </div>

      {post.caption && (
        <p className="mt-3 text-xs text-[#B8B8C2] italic text-center max-w-xl">
          "{post.caption}"
        </p>
      )}

      {/* Fullscreen Lightbox Modal */}
      {showImageModal && (
        <div
          onClick={() => setShowImageModal(false)}
          className="fixed inset-0 z-50 bg-[#0B0B0D]/95 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-8 animate-fade-in"
        >
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              onClick={triggerDownload}
              disabled={isDownloading}
              className="p-2 rounded-xl bg-[#26262E] text-white hover:bg-[#303039] transition-colors disabled:opacity-50"
              title="Download image"
            >
              {isDownloading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={() => setShowImageModal(false)}
              className="p-2 rounded-xl bg-[#26262E] text-white hover:bg-[#303039] transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            onClick={e => e.stopPropagation()}
            className="max-w-5xl max-h-[90vh] flex flex-col items-center justify-center"
          >
            <img
              src={post.imageUrl}
              alt={post.title}
              onError={handleImageError}
              className="max-w-full max-h-[82vh] object-contain rounded-2xl shadow-2xl"
            />
            <p className="mt-3 text-sm font-semibold text-white">{post.title}</p>
          </div>
        </div>
      )}
    </div>
  );
};
