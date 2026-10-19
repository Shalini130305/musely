import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  UploadCloud,
  Link as LinkIcon,
  X,
  Sparkles,
  Camera,
  Video,
  MessageSquareQuote,
  Palette,
  Users,
  Film
} from 'lucide-react';
import { CATEGORIES, type PostType } from '@/types';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface CommunityOption {
  id: string;
  name: string;
  slug: string;
  category: string;
}

export default function CreatePostPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCommunityId = searchParams.get('communityId') || '';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [postType, setPostType] = useState<PostType>('PHOTO');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('Art & Design');
  const [destUrl, setDestUrl] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [communityId, setCommunityId] = useState<string>(initialCommunityId);
  const [communities, setCommunities] = useState<CommunityOption[]>([]);

  // Media state
  const [mediaMode, setMediaMode] = useState<'upload' | 'url'>('upload');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [imageWidth, setImageWidth] = useState<number | undefined>();
  const [imageHeight, setImageHeight] = useState<number | undefined>();
  const [videoUrl, setVideoUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch joined communities
  useEffect(() => {
    const fetchMyCommunities = async () => {
      try {
        const { data } = await api.get('/communities');
        const myComms = (data.communities || []).filter((c: any) => c.isMember);
        setCommunities(myComms);
      } catch {
        // silent
      }
    };
    fetchMyCommunities();
  }, []);

  const handleImageFileChange = async (file: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      const src = e.target?.result as string;
      setImagePreview(src);
      const img = new window.Image();
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
      toast.success('Media ready!');
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
          toast.error('Maximum 10 tags allowed');
          return;
        }
        setTags([...tags, trimmed]);
        setTagInput('');
      }
    }
  };

  const handleRemoveTag = (t: string) => {
    setTags(tags.filter(tag => tag !== t));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    if (postType === 'PHOTO' && !imageUrl) {
      toast.error('Please upload or provide an image for photo posts');
      return;
    }

    if (postType === 'ART' && !imageUrl) {
      toast.error('Please upload or provide an artwork image');
      return;
    }

    if (postType === 'VIDEO' && !videoUrl && !imageUrl) {
      toast.error('Please provide a video link or thumbnail for video posts');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: any = {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        tags,
        postType,
        destUrl: destUrl.trim() || undefined,
        communityId: communityId || undefined,
      };

      if (imageUrl) {
        payload.imageUrl = imageUrl;
        payload.imageWidth = imageWidth;
        payload.imageHeight = imageHeight;
      }

      if (videoUrl) {
        payload.videoUrl = videoUrl.trim();
      }

      const { data } = await api.post('/posts', payload);
      toast.success('Post published successfully!');
      navigate(`/post/${data.post.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen py-8 max-w-4xl mx-auto px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-4 border-b border-[#303039]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[#FF4F9A]" />
            Original Creative Expression
          </h1>
          <p className="text-xs sm:text-sm text-[#B8B8C2] mt-1">
            Share authentic photography, original videos, creative thoughts, or artwork with India.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || isUploading || !title.trim()}
          className="px-6 py-2.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white text-xs font-bold transition-all shadow-lg shadow-[#FF4F9A]/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Publishing...' : 'Publish Post'}
        </button>
      </div>

      {/* Format Selector Pills */}
      <div className="mb-8">
        <label className="block text-xs font-bold text-[#B8B8C2] uppercase tracking-wider mb-2">
          Select Content Format
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => setPostType('PHOTO')}
            className={clsx(
              'p-3.5 rounded-2xl border text-left transition-all flex flex-col gap-2',
              postType === 'PHOTO'
                ? 'bg-[#1C1C22] border-[#FF4F9A] text-white ring-1 ring-[#FF4F9A]'
                : 'bg-[#151519] border-[#303039] text-[#B8B8C2] hover:border-[#FF4F9A]/50'
            )}
          >
            <Camera className={clsx('w-5 h-5', postType === 'PHOTO' ? 'text-[#FF4F9A]' : 'text-[#757582]')} />
            <div>
              <p className="text-xs font-bold text-white">Photo</p>
              <p className="text-[10px] text-[#757582]">Original captures & visual stories</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setPostType('THOUGHT')}
            className={clsx(
              'p-3.5 rounded-2xl border text-left transition-all flex flex-col gap-2',
              postType === 'THOUGHT'
                ? 'bg-[#1C1C22] border-[#FF4F9A] text-white ring-1 ring-[#FF4F9A]'
                : 'bg-[#151519] border-[#303039] text-[#B8B8C2] hover:border-[#FF4F9A]/50'
            )}
          >
            <MessageSquareQuote className={clsx('w-5 h-5', postType === 'THOUGHT' ? 'text-[#FF4F9A]' : 'text-[#757582]')} />
            <div>
              <p className="text-xs font-bold text-white">Thought / Story</p>
              <p className="text-[10px] text-[#757582]">Ideas, musings & micro-blogs</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setPostType('VIDEO')}
            className={clsx(
              'p-3.5 rounded-2xl border text-left transition-all flex flex-col gap-2',
              postType === 'VIDEO'
                ? 'bg-[#1C1C22] border-[#FF4F9A] text-white ring-1 ring-[#FF4F9A]'
                : 'bg-[#151519] border-[#303039] text-[#B8B8C2] hover:border-[#FF4F9A]/50'
            )}
          >
            <Video className={clsx('w-5 h-5', postType === 'VIDEO' ? 'text-[#FF4F9A]' : 'text-[#757582]')} />
            <div>
              <p className="text-xs font-bold text-white">Video</p>
              <p className="text-[10px] text-[#757582]">Short films, clips & animations</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setPostType('ART')}
            className={clsx(
              'p-3.5 rounded-2xl border text-left transition-all flex flex-col gap-2',
              postType === 'ART'
                ? 'bg-[#1C1C22] border-[#FF4F9A] text-white ring-1 ring-[#FF4F9A]'
                : 'bg-[#151519] border-[#303039] text-[#B8B8C2] hover:border-[#FF4F9A]/50'
            )}
          >
            <Palette className={clsx('w-5 h-5', postType === 'ART' ? 'text-[#FF4F9A]' : 'text-[#757582]')} />
            <div>
              <p className="text-xs font-bold text-white">Artwork</p>
              <p className="text-[10px] text-[#757582]">Illustrations, 3D & graphic design</p>
            </div>
          </button>
        </div>
      </div>

      {/* Main Form Body */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Media Section (Shown for PHOTO, VIDEO, ART, optional for THOUGHT) */}
        {postType !== 'THOUGHT' ? (
          <div className="p-6 rounded-3xl bg-[#151519] border border-[#303039] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Media Upload</span>
              <div className="flex rounded-xl bg-[#0B0B0D] p-1 border border-[#303039]">
                <button
                  type="button"
                  onClick={() => setMediaMode('upload')}
                  className={clsx(
                    'px-3 py-1 text-xs font-semibold rounded-lg transition-colors',
                    mediaMode === 'upload' ? 'bg-[#FF4F9A] text-white' : 'text-[#B8B8C2]'
                  )}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setMediaMode('url')}
                  className={clsx(
                    'px-3 py-1 text-xs font-semibold rounded-lg transition-colors',
                    mediaMode === 'url' ? 'bg-[#FF4F9A] text-white' : 'text-[#B8B8C2]'
                  )}
                >
                  Direct Link / URL
                </button>
              </div>
            </div>

            {mediaMode === 'url' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#B8B8C2] mb-1">
                    Image / Artwork Direct URL
                  </label>
                  <div className="relative">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#757582]" />
                    <input
                      type="url"
                      placeholder="https://..."
                      value={imageUrl}
                      onChange={e => {
                        setImageUrl(e.target.value);
                        setImagePreview(e.target.value);
                      }}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#0B0B0D] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none"
                    />
                  </div>
                </div>

                {postType === 'VIDEO' && (
                  <div>
                    <label className="block text-xs font-medium text-[#B8B8C2] mb-1">
                      Video Stream URL (MP4, YouTube, Vimeo)
                    </label>
                    <div className="relative">
                      <Film className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#757582]" />
                      <input
                        type="url"
                        placeholder="https://..."
                        value={videoUrl}
                        onChange={e => setVideoUrl(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#0B0B0D] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#303039] hover:border-[#FF4F9A] rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-[#0B0B0D]"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleImageFileChange(e.target.files[0])}
                />
                <div className="w-12 h-12 rounded-2xl bg-[#1C1C22] border border-[#303039] flex items-center justify-center text-[#FF4F9A] mb-3">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-white">Click or drag and drop to upload</p>
                <p className="text-[10px] text-[#757582] mt-1">
                  Supports high-resolution JPG, PNG, WebP (up to 10MB)
                </p>
              </div>
            )}

            {imagePreview && (
              <div className="relative rounded-2xl overflow-hidden border border-[#303039] max-h-72 bg-black flex items-center justify-center">
                <img src={imagePreview} alt="Preview" className="max-h-72 object-contain" />
                <button
                  type="button"
                  onClick={() => {
                    setImageUrl('');
                    setImagePreview('');
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white hover:bg-[#FF4F9A] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Thought Format Live Preview */
          <div className="p-6 rounded-3xl bg-gradient-to-br from-[#1C1C22] to-[#151519] border border-[#FF4F9A]/30 space-y-2">
            <div className="flex items-center gap-2 text-[#FF8FBD] text-xs font-semibold">
              <MessageSquareQuote className="w-4 h-4 text-[#FF4F9A]" />
              Authentic Thought Preview
            </div>
            <p className="text-lg font-display font-medium text-white italic leading-relaxed">
              "{description.trim() || 'Write down your creative musings, poetry, or perspective here...'}"
            </p>
            <p className="text-xs text-[#757582] text-right">— {title.trim() || 'Your thought title'}</p>
          </div>
        )}

        {/* Title & Core Content */}
        <div className="p-6 rounded-3xl bg-[#151519] border border-[#303039] space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#B8B8C2] mb-1">
              {postType === 'THOUGHT' ? 'Thought Headline / Theme *' : 'Title *'}
            </label>
            <input
              type="text"
              required
              placeholder={
                postType === 'THOUGHT'
                  ? 'A quick summary or theme of your reflection'
                  : 'Add a captivating title for your post'
              }
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={150}
              className="w-full px-4 py-3 rounded-xl bg-[#0B0B0D] text-sm text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-[#B8B8C2]">
                {postType === 'THOUGHT' ? 'Your Thoughts & Musings *' : 'Description / Story (Optional)'}
              </label>
              <span className="text-[10px] text-[#757582]">{description.length} / 2000</span>
            </div>
            <textarea
              rows={postType === 'THOUGHT' ? 6 : 4}
              placeholder={
                postType === 'THOUGHT'
                  ? 'Share your perspective, story, poem, or question with the community...'
                  : 'Describe the story, concept, technique, or inspiration behind this creation...'
              }
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={2000}
              className="w-full px-4 py-3 rounded-xl bg-[#0B0B0D] text-xs sm:text-sm text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none leading-relaxed"
            />
          </div>

          {/* Category & Community Target */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#B8B8C2] mb-1">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0B0D] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none cursor-pointer"
              >
                {CATEGORIES.filter(c => c !== 'All').map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#B8B8C2] mb-1">
                Post to Community (Optional)
              </label>
              <select
                value={communityId}
                onChange={e => setCommunityId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0B0D] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none cursor-pointer"
              >
                <option value="">Personal Public Feed</option>
                {communities.map(comm => (
                  <option key={comm.id} value={comm.id}>
                    {comm.name} ({comm.category})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Destination Link */}
          <div>
            <label className="block text-xs font-bold text-[#B8B8C2] mb-1">
              External Link / Portfolio (Optional)
            </label>
            <input
              type="url"
              placeholder="https://yourportfolio.in or article link"
              value={destUrl}
              onChange={e => setDestUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0B0D] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-bold text-[#B8B8C2] mb-1">
              Tags (Press Enter or comma to add)
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map(t => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#FF4F9A]/15 text-[#FF8FBD] border border-[#FF4F9A]/30"
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(t)}
                    className="hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              placeholder="e.g. photography, chennai, minimal, indie"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none"
            />
          </div>
        </div>
      </form>
    </div>
  );
}
