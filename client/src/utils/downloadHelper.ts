import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';

export interface DownloadFileOptions {
  url: string;
  fileName?: string;
  postId?: string;
  fileId?: string;
  mimeType?: string;
}

/**
 * Robust cross-browser file downloader.
 * Handles:
 * - Direct authentication via Bearer token
 * - Backend proxy via /api/upload/download/:id
 * - Cross-origin blob streaming
 * - Preserving original filenames and MIME types
 * - Mobile and desktop compatibility
 */
export async function downloadFile(options: DownloadFileOptions): Promise<void> {
  const { url, fileName, postId, fileId } = options;
  const targetId = fileId || postId;

  const toastId = toast.loading('Preparing download...');

  try {
    // 1. If we have a fileId or postId, prefer our backend secure proxy endpoint
    if (targetId) {
      try {
        const response = await api.get(`/upload/download/${targetId}`, {
          responseType: 'blob',
        });

        // Determine filename from response Content-Disposition header if available
        let resolvedFileName = fileName || 'musely_download';
        const disposition = response.headers['content-disposition'];
        if (disposition) {
          const match = disposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i);
          if (match && match[1]) {
            resolvedFileName = decodeURIComponent(match[1]);
          }
        }

        // Create Blob URL and trigger download
        const contentTypeHeader = typeof response.headers['content-type'] === 'string' ? response.headers['content-type'] : undefined;
        const blob = new Blob([response.data], {
          type: contentTypeHeader || options.mimeType || 'application/octet-stream',
        });
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = resolvedFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
        toast.success(`Downloaded: ${resolvedFileName}`, { id: toastId });
        return;
      } catch (backendErr: any) {
        if (backendErr.response?.status === 403) {
          const errMsg = backendErr.response?.data?.error || 'Access denied: You do not have permission to download this media.';
          toast.error(errMsg, { id: toastId });
          return;
        }
        // Fall back to direct fetch or browser download if backend fails
      }
    }

    // 2. Direct fetch with blob fallback
    if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('/'))) {
      const fallbackName = fileName || 'musely_media';
      
      try {
        const res = await fetch(url, { credentials: 'omit' });
        if (res.ok) {
          const blob = await res.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = fallbackName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
          toast.success(`Downloaded: ${fallbackName}`, { id: toastId });
          return;
        }
      } catch {
        // Fetch failed due to CORS or network; fallback to opening directly
      }

      // 3. Fallback: navigate or open link with download attribute
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.download = fallbackName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Download started', { id: toastId });
      return;
    }

    throw new Error('No valid download URL available');
  } catch (error) {
    toast.error(getErrorMessage(error) || 'Failed to download file', { id: toastId });
  }
}
