import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, X, UploadCloud, Link as LinkIcon, Trash2 } from 'lucide-react';
import { CATEGORIES } from '@/types';
import api, { getErrorMessage } from '@/services/api';
import { handleImageError } from '@/utils/imageFallback';
import toast from 'react-hot-toast';

export default function EditPostPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<'PUBLIC' | 'FOLLOWERS' | 'ONLY_ME'>('PUBLIC');
  const [category, setCategory] = useState('Digital Art');
  const [destUrl, setDestUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageWidth, setImageWidth] = useState<number | undefined>();
  const [imageHeight, setImageHeight] = useState<number | undefined>();
  const [isUploading, setIsUploading] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showReplaceImage, setShowReplaceImage] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function loadPost() {
      try {
        const { data } = await api.get(`/posts/${id}`);
        const p = data.post;
        setTitle(p.title);
        setDescription(p.description || '');
        setCaption(p.caption || '');
        setAudience(p.audience || 'PUBLIC');
        setCategory(p.category || 'Digital Art');
        setDestUrl(p.destUrl || '');
        setImageUrl(p.imageUrl);
        setImageWidth(p.imageWidth || undefined);
        setImageHeight(p.imageHeight || undefined);
        setTags(p.tags?.map((t: any) => t.name) || []);
      } catch (err) {
        toast.error(getErrorMessage(err));
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    }
    loadPost();
  }, [id, navigate]);

  const handleImageFileChange = async (file: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setImageWidth(img.naturalWidth);
        setImageHeight(img.naturalHeight);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append('image', file);
    try {
      setIsUploading(true);
      const { data } = await api.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImageUrl(data.imageUrl);
      if (data.width && data.height) {
        setImageWidth(data.width);
        setImageHeight(data.height);
      }
      toast.success('Image replaced!');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const trimmed = tagInput.trim().toLowerCase().replace(/^#/, '');
      if (trimmed && !tags.includes(trimmed)) {
        if (tags.length >= 10) {
          toast.error('Maximum 10 tags');
          return;
        }
        setTags([...tags, trimmed]);
        setTagInput('');
      }
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    try {
      setIsSaving(true);
      await api.put(`/posts/${id}`, {
        title: title.trim(),
        description: description.trim() || null,
        caption: caption.trim() || null,
        audience,
        category,
        destUrl: destUrl.trim() || null,
        imageUrl,
        imageWidth,
        imageHeight,
        tags,
      });
      toast.success('Post updated');
      navigate(`/post/${id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await api.delete(`/posts/${id}`);
      toast.success('Post deleted successfully');
      navigate('/');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 max-w-3xl mx-auto px-4">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-charcoal-500 hover:text-charcoal-900 dark:hover:text-charcoal-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Cancel & Back
        </button>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-700 p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <Trash2 className="w-4 h-4" /> Delete Post
        </button>
      </div>

      <div className="bg-white dark:bg-charcoal-800 rounded-3xl border border-[var(--border)] p-8 shadow-sm">
        <h1 className="text-2xl font-display font-bold text-charcoal-900 dark:text-charcoal-50 mb-6">
          Edit Post
        </h1>

        {/* Current Image & Replace Option */}
        <div className="mb-6 space-y-3">
          <label className="label">Visual Artwork</label>
          <div className="relative rounded-2xl overflow-hidden max-h-72 bg-cream-100 dark:bg-charcoal-700 flex items-center justify-center border border-[var(--border)]">
            <img
              src={imageUrl}
              alt={title}
              onError={handleImageError}
              className="w-full h-full object-contain max-h-72"
            />
            {isUploading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs font-semibold">
                Uploading new image...
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary text-xs py-2 px-3 flex-1"
            >
              <UploadCloud className="w-3.5 h-3.5" /> Replace with New File
            </button>
            <button
              type="button"
              onClick={() => setShowReplaceImage(prev => !prev)}
              className="btn-secondary text-xs py-2 px-3"
            >
              <LinkIcon className="w-3.5 h-3.5" /> Edit Image URL
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleImageFileChange(e.target.files[0])}
            />
          </div>

          {showReplaceImage && (
            <div className="pt-2 animate-fade-in">
              <input
                type="url"
                placeholder="https://..."
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                className="input text-xs"
              />
            </div>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="label">Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="input font-medium"
              maxLength={200}
            />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              rows={4}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="textarea text-sm"
              maxLength={2000}
            />
          </div>

          <div>
            <label className="label">Caption (Optional)</label>
            <input
              type="text"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Brief caption for document or media..."
              className="input text-sm"
            />
          </div>

          <div>
            <label className="label">Post Audience & Privacy</label>
            <select
              value={audience}
              onChange={e => setAudience(e.target.value as any)}
              className="input cursor-pointer"
            >
              <option value="PUBLIC">🌍 Public (Everyone can view)</option>
              <option value="FOLLOWERS">👥 Followers Only (Approved followers only)</option>
              <option value="ONLY_ME">🔒 Only Me (Private to you)</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="input cursor-pointer"
              >
                {CATEGORIES.filter(c => c !== 'All').map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Destination Link</label>
              <input
                type="url"
                placeholder="https://..."
                value={destUrl}
                onChange={e => setDestUrl(e.target.value)}
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map(t => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-accent-100 dark:bg-accent-950 text-accent-700 dark:text-accent-300"
                >
                  #{t}
                  <button type="button" onClick={() => handleRemoveTag(t)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              placeholder="Press Enter or comma to add tag"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              className="input text-sm"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || isUploading}
              className="btn-primary"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content p-6 max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-charcoal-900 dark:text-charcoal-50 mb-2">
              Delete Post?
            </h3>
            <p className="text-xs text-charcoal-500 mb-6 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-charcoal-800 dark:text-charcoal-200">"{title}"</span>? This will permanently remove the post, comments, and saves from Musely.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="btn-primary bg-red-600 hover:bg-red-700 text-xs text-white"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
