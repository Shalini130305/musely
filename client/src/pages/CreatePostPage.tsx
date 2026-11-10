import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  UploadCloud, Link as LinkIcon, X, Sparkles, Camera,
  Video, MessageSquareQuote, Palette, Users, Globe, Lock,
  FileText, Film, CheckCircle2, AlertCircle, FileCheck,
  MapPin, Search, Play, Music, Mic
} from 'lucide-react';
import { CATEGORIES, type PostType, type AudienceType, type MusicTrack } from '@/types';
import { MusicTrackSelectorModal } from '@/components/music/MusicTrackSelectorModal';
import { VoiceRecorder } from '@/components/music/VoiceRecorder';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface CommunityOption {
  id: string;
  name: string;
  slug: string;
  category: string;
}

const POPULAR_LOCATIONS = [
  'Chennai, Tamil Nadu',
  'Marina Beach, Chennai',
  'Bengaluru, Karnataka',
  'SRM Institute of Science and Technology',
  'Mumbai, Maharashtra',
  'New Delhi, Delhi',
  'Hyderabad, Telangana',
  'Kochi, Kerala',
  'Kolkata, West Bengal',
  'Pune, Maharashtra',
  'Goa, India',
  'Jaipur, Rajasthan',
];

export default function CreatePostPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCommunityId = searchParams.get('communityId') || '';

  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [postType, setPostType] = useState<PostType>('PHOTO');
  const [audience, setAudience] = useState<AudienceType>('PUBLIC');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<string>('Art');
  const [destUrl, setDestUrl] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [communityId, setCommunityId] = useState<string>(initialCommunityId);
  const [communities, setCommunities] = useState<CommunityOption[]>([]);

  // Location state
  const [location, setLocation] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Media state
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [imageWidth, setImageWidth] = useState<number | undefined>();
  const [imageHeight, setImageHeight] = useState<number | undefined>();
  const [videoUrl, setVideoUrl] = useState('');
  const [videoPreview, setVideoPreview] = useState('');
  const [videoFileName, setVideoFileName] = useState('');
  const [videoFileSize, setVideoFileSize] = useState<number | undefined>();

  // Document state
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [fileSize, setFileSize] = useState<number | undefined>();
  const [docType, setDocType] = useState<'PDF' | 'DOC' | 'DOCX' | undefined>();

  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Audio & Music state
  const [attachedMusicTrack, setAttachedMusicTrack] = useState<MusicTrack | null>(null);
  const [attachedAudioUrl, setAttachedAudioUrl] = useState<string | null>(null);
  const [attachedAudioDuration, setAttachedAudioDuration] = useState<number | null>(null);
  const [showMusicModal, setShowMusicModal] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);

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

    // Validate size (max 15MB)
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Image must be under 15MB');
      return;
    }

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

    try {
      setIsUploading(true);
      let res;
      try {
        const formData = new FormData();
        formData.append('file', file);
        res = await api.post('/upload/file', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } catch (err: any) {
        if (err.response?.status === 404) {
          const legacyForm = new FormData();
          legacyForm.append('image', file);
          res = await api.post('/upload/image', legacyForm, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } else {
          throw err;
        }
      }
      const data = res.data;
      setImageUrl(data.imageUrl || data.fileUrl);
      setFileUrl(data.fileUrl || data.imageUrl);
      setFileName(data.fileName || file.name);
      setFileType(data.fileType || file.type);
      setFileSize(data.fileSize || file.size);
      toast.success('Image ready!');
    } catch (err) {
      toast.error(getErrorMessage(err));
      setImagePreview('');
    } finally {
      setIsUploading(false);
    }
  };

  const handleVideoFileChange = async (file: File) => {
    if (!file) return;

    // Validate size (max 200MB)
    if (file.size > 200 * 1024 * 1024) {
      toast.error('Video must be under 200MB');
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['mp4', 'webm', 'mov'].includes(ext || '')) {
      toast.error('Only MP4, WebM, and MOV video formats are supported');
      return;
    }

    // Set local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setVideoPreview(objectUrl);
    setVideoFileName(file.name);
    setVideoFileSize(file.size);

    const formData = new FormData();
    formData.append('video', file);

    try {
      setIsUploading(true);
      const { data } = await api.post('/upload/video', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setVideoUrl(data.videoUrl);
      setFileUrl(data.fileUrl || data.videoUrl);
      setFileName(data.fileName || file.name);
      setFileType(data.fileType || file.type || 'video/mp4');
      setFileSize(data.fileSize || file.size);
      toast.success('Video uploaded successfully!');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  const handleDocFileChange = async (file: File) => {
    if (!file) return;

    if (file.size > 30 * 1024 * 1024) {
      toast.error('Document must be under 30MB');
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'doc', 'docx'].includes(ext || '')) {
      toast.error('Only PDF, DOC, and DOCX documents are supported');
      return;
    }

    const formData = new FormData();
    formData.append('document', file);
    try {
      setIsUploading(true);
      const { data } = await api.post('/upload/document', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFileUrl(data.fileUrl);
      setFileName(data.fileName);
      setFileType(data.fileType);
      setFileSize(data.fileSize);
      setDocType(data.docType);
      setImageUrl('https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80');
      toast.success(`${data.docType} document uploaded!`);
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

  const handleSelectLocation = (loc: string) => {
    setLocation(loc);
    setLocationInput(loc);
    setShowLocationPicker(false);
  };

  const filteredLocations = POPULAR_LOCATIONS.filter(l =>
    l.toLowerCase().includes(locationInput.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    if (postType === 'PHOTO' && !imageUrl) {
      toast.error('Please upload an image for photo posts');
      return;
    }

    if (postType === 'DOCUMENT' && !fileUrl) {
      toast.error('Please upload a PDF, DOC, or DOCX document');
      return;
    }

    if (postType === 'ART' && !imageUrl) {
      toast.error('Please upload an artwork image');
      return;
    }

    if (postType === 'VIDEO' && !videoUrl && !videoPreview) {
      toast.error('Please upload a video file or provide a video link');
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
        audience,
        caption: caption.trim() || undefined,
        destUrl: destUrl.trim() || undefined,
        communityId: communityId || undefined,
        location: location.trim() || undefined,
      };

      if (imageUrl) {
        payload.imageUrl = imageUrl;
        payload.imageWidth = imageWidth;
        payload.imageHeight = imageHeight;
      }

      if (fileUrl) {
        payload.fileUrl = fileUrl;
        payload.fileName = fileName;
        payload.fileType = fileType;
        payload.fileSize = fileSize;
        payload.docType = docType;
      }

      if (videoUrl) {
        payload.videoUrl = videoUrl.trim();
        if (!payload.fileUrl) payload.fileUrl = videoUrl.trim();
        if (!payload.fileName && videoFileName) payload.fileName = videoFileName;
        if (!payload.fileSize && videoFileSize) payload.fileSize = videoFileSize;
      }

      if (attachedMusicTrack) {
        payload.musicTrackId = attachedMusicTrack.id;
      }
      if (attachedAudioUrl) {
        payload.audioUrl = attachedAudioUrl;
        payload.audioDuration = attachedAudioDuration || undefined;
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
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-4 border-b border-[#303039]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[#FF4F9A]" />
            Publish Creative Content
          </h1>
          <p className="text-xs sm:text-sm text-[#B8B8C2] mt-1">
            Share photography, documents (PDF/DOCX), videos, artwork, or thoughts with customizable privacy.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || isUploading || !title.trim()}
          className="px-6 py-2.5 rounded-2xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white text-xs font-bold transition-all shadow-lg shadow-[#FF4F9A]/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Publishing...' : 'Publish Post'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Form Fields (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Post Type Selector */}
          <div>
            <label className="block text-xs font-semibold text-[#B8B8C2] mb-2">Content Format</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {[
                { type: 'PHOTO', label: 'Photo', icon: Camera },
                { type: 'VIDEO', label: 'Video', icon: Film },
                { type: 'DOCUMENT', label: 'Document', icon: FileText },
                { type: 'ART', label: 'Artwork', icon: Palette },
                { type: 'THOUGHT', label: 'Thought', icon: MessageSquareQuote },
              ].map(item => {
                const Icon = item.icon;
                const isSelected = postType === item.type;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => setPostType(item.type as PostType)}
                    className={clsx(
                      'flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-semibold transition-all gap-1.5',
                      isSelected
                        ? 'bg-[#FF4F9A]/15 border-[#FF4F9A] text-white shadow-md'
                        : 'bg-[#1C1C22] border-[#303039] text-[#B8B8C2] hover:text-white hover:bg-[#26262E]'
                    )}
                  >
                    <Icon className="w-4 h-4 text-[#FF4F9A]" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Give your work a title..."
              className="w-full px-4 py-3 rounded-2xl bg-[#1C1C22] border border-[#303039] text-white text-sm focus:border-[#FF4F9A] outline-none"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="Provide background, creative process, or context..."
              className="w-full px-4 py-3 rounded-2xl bg-[#1C1C22] border border-[#303039] text-white text-sm focus:border-[#FF4F9A] outline-none"
            />
          </div>

          {/* Optional Location Selection */}
          <div className="p-4 rounded-3xl bg-[#1C1C22] border border-[#303039] space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#FF4F9A]" />
                Add Location / Place (Optional)
              </label>
              {location && (
                <button
                  type="button"
                  onClick={() => {
                    setLocation('');
                    setLocationInput('');
                  }}
                  className="text-[11px] text-red-400 hover:text-red-300 font-semibold flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Remove
                </button>
              )}
            </div>

            {location ? (
              <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-[#26262E] border border-[#FF4F9A]/30">
                <MapPin className="w-4 h-4 text-[#FF4F9A] shrink-0" />
                <span className="text-xs font-semibold text-white flex-1">{location}</span>
                <button
                  type="button"
                  onClick={() => setShowLocationPicker(prev => !prev)}
                  className="text-[11px] text-[#FF8FBD] hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <input
                    type="text"
                    value={locationInput}
                    onChange={e => {
                      setLocationInput(e.target.value);
                      setShowLocationPicker(true);
                    }}
                    onFocus={() => setShowLocationPicker(true)}
                    placeholder="Search place or type city (e.g. Marina Beach, Chennai)..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-2xl bg-[#141418] border border-[#303039] text-white text-xs focus:border-[#FF4F9A] outline-none"
                  />
                  <Search className="w-4 h-4 text-[#757582] absolute left-3 top-3" />
                </div>

                {locationInput.trim() && (
                  <button
                    type="button"
                    onClick={() => handleSelectLocation(locationInput.trim())}
                    className="mt-2 text-xs text-[#FF8FBD] hover:underline flex items-center gap-1"
                  >
                    <span>Use custom: <strong>"{locationInput.trim()}"</strong></span>
                  </button>
                )}
              </div>
            )}

            {/* Suggestions dropdown */}
            {showLocationPicker && (
              <div className="mt-2 p-2 rounded-2xl bg-[#141418] border border-[#303039] max-h-44 overflow-y-auto space-y-1">
                <p className="text-[10px] uppercase font-bold text-[#757582] px-2 py-1">Suggested Places</p>
                {filteredLocations.map(loc => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => handleSelectLocation(loc)}
                    className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-[#26262E] text-xs text-[#B8B8C2] hover:text-white flex items-center gap-2 transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5 text-[#FF4F9A]" />
                    <span>{loc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Optional Caption */}
          <div>
            <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">
              Media / Document Caption (Optional)
            </label>
            <input
              type="text"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="e.g. Captured in Varanasi during sunset"
              className="w-full px-4 py-2.5 rounded-2xl bg-[#1C1C22] border border-[#303039] text-white text-xs focus:border-[#FF4F9A] outline-none"
            />
          </div>

          {/* Post Audience Selector */}
          <div className="p-4 rounded-3xl bg-[#1C1C22] border border-[#303039]">
            <label className="block text-xs font-bold text-white mb-2 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-[#FF4F9A]" />
              Post Audience & Visibility
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
              {[
                {
                  value: 'PUBLIC',
                  label: 'Public',
                  desc: 'Anyone can view',
                  icon: Globe,
                },
                {
                  value: 'FOLLOWERS',
                  label: 'Followers Only',
                  desc: 'Approved followers only',
                  icon: Users,
                },
                {
                  value: 'ONLY_ME',
                  label: 'Only Me',
                  desc: 'Private to you',
                  icon: Lock,
                },
              ].map(opt => {
                const Icon = opt.icon;
                const isSelected = audience === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAudience(opt.value as AudienceType)}
                    className={clsx(
                      'flex flex-col items-start p-3 rounded-2xl border text-left transition-all',
                      isSelected
                        ? 'bg-[#FF4F9A]/15 border-[#FF4F9A] text-white shadow-md'
                        : 'bg-[#141418] border-[#303039] text-[#B8B8C2] hover:text-white'
                    )}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs mb-0.5">
                      <Icon className="w-3.5 h-3.5 text-[#FF4F9A]" />
                      <span>{opt.label}</span>
                    </div>
                    <span className="text-[10px] text-[#B8B8C2]">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-[#B8B8C2]">
              * If your account is set to Private, posts are automatically restricted to approved followers.
            </p>
          </div>

          {/* Category & Community Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-[#1C1C22] border border-[#303039] text-white text-xs focus:border-[#FF4F9A] outline-none"
              >
                {CATEGORIES.filter(c => c !== 'All').map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">
                Post to Community (Optional)
              </label>
              <select
                value={communityId}
                onChange={e => setCommunityId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-[#1C1C22] border border-[#303039] text-white text-xs focus:border-[#FF4F9A] outline-none"
              >
                <option value="">Personal Feed (No community)</option>
                {communities.map(comm => (
                  <option key={comm.id} value={comm.id}>
                    {comm.name} ({comm.category})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">Tags (up to 10)</label>
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="Type tag and press Enter (e.g. photography, travel)..."
              className="w-full px-4 py-2.5 rounded-2xl bg-[#1C1C22] border border-[#303039] text-white text-xs focus:border-[#FF4F9A] outline-none mb-2"
            />
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map(t => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#26262E] text-white text-xs font-medium"
                  >
                    #{t}
                    <button type="button" onClick={() => handleRemoveTag(t)}>
                      <X className="w-3 h-3 text-[#B8B8C2] hover:text-white" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Audio & Background Music Attachment */}
          <div className="p-4 rounded-2xl bg-[#1C1C22] border border-[#303039] space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-white flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-[#FF4F9A]" />
                Audio & Background Music (Optional)
              </label>
              <span className="text-[10px] text-[#757582]">Licensed & Voice</span>
            </div>

            {attachedMusicTrack ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#141418] border border-[#FF4F9A]/40 gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg overflow-hidden bg-[#26262E] flex-shrink-0">
                    {attachedMusicTrack.coverUrl ? (
                      <img src={attachedMusicTrack.coverUrl} alt={attachedMusicTrack.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#FF4F9A]">
                        <Music className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{attachedMusicTrack.title}</p>
                    <p className="text-[11px] text-[#B8B8C2] truncate">{attachedMusicTrack.artist}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachedMusicTrack(null)}
                  className="p-1 rounded-lg text-[#757582] hover:text-rose-400 hover:bg-[#26262E] transition-colors"
                  title="Remove music track"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : attachedAudioUrl ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#141418] border border-[#FF4F9A]/40 gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#FF4F9A]/15 text-[#FF4F9A] flex items-center justify-center flex-shrink-0">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white">Voice Note Attached</p>
                    <p className="text-[11px] text-[#B8B8C2]">{attachedAudioDuration ? `${attachedAudioDuration}s duration` : 'Audio recording'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAttachedAudioUrl(null);
                    setAttachedAudioDuration(null);
                  }}
                  className="p-1 rounded-lg text-[#757582] hover:text-rose-400 hover:bg-[#26262E] transition-colors"
                  title="Remove voice note"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : showVoiceRecorder ? (
              <VoiceRecorder
                onRecorded={({ audioUrl, duration }) => {
                  setAttachedAudioUrl(audioUrl);
                  setAttachedAudioDuration(duration);
                  setShowVoiceRecorder(false);
                }}
                onCancel={() => setShowVoiceRecorder(false)}
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowMusicModal(true)}
                  className="py-2.5 px-3 rounded-xl bg-[#141418] hover:bg-[#26262E] text-xs font-semibold text-[#B8B8C2] hover:text-white border border-[#303039] transition-colors flex items-center justify-center gap-1.5"
                >
                  <Music className="w-3.5 h-3.5 text-[#FF4F9A]" />
                  Add Music
                </button>
                <button
                  type="button"
                  onClick={() => setShowVoiceRecorder(true)}
                  className="py-2.5 px-3 rounded-xl bg-[#141418] hover:bg-[#26262E] text-xs font-semibold text-[#B8B8C2] hover:text-white border border-[#303039] transition-colors flex items-center justify-center gap-1.5"
                >
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                  Record Voice
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Upload & Live Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <label className="block text-xs font-semibold text-[#B8B8C2]">
            {postType === 'DOCUMENT'
              ? 'Upload Document (PDF, DOC, DOCX)'
              : postType === 'VIDEO'
              ? 'Upload Video File'
              : 'Media Upload'}
          </label>

          {/* Video Upload Area */}
          {postType === 'VIDEO' && (
            <div className="space-y-4">
              <div
                onClick={() => videoInputRef.current?.click()}
                className={clsx(
                  'border-2 border-dashed rounded-3xl p-6 min-h-[260px] flex flex-col items-center justify-center text-center cursor-pointer transition-all relative overflow-hidden',
                  videoPreview || videoUrl
                    ? 'border-[#FF4F9A]/40 bg-[#141418]'
                    : 'border-[#303039] hover:border-[#FF4F9A]/50 bg-[#1C1C22]'
                )}
              >
                {videoPreview || videoUrl ? (
                  <div className="w-full flex flex-col items-center">
                    <video
                      src={videoPreview || videoUrl}
                      controls
                      playsInline
                      className="max-h-[240px] w-full rounded-2xl object-contain bg-black shadow-lg mb-2"
                    />
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        videoInputRef.current?.click();
                      }}
                      className="text-xs text-[#FF8FBD] hover:underline font-semibold"
                    >
                      Click to replace video
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-2xl bg-[#FF4F9A]/10 border border-[#FF4F9A]/20 flex items-center justify-center text-[#FF4F9A] mb-3">
                      <Film className="w-7 h-7" />
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1">Select Video File</h4>
                    <p className="text-xs text-[#B8B8C2] max-w-xs">
                      {isUploading
                        ? 'Uploading video...'
                        : 'MP4, WebM, or MOV format. Max size 200MB.'}
                    </p>
                  </>
                )}

                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleVideoFileChange(e.target.files[0])}
                />
              </div>

              {/* Video URL fallback */}
              <div className="p-4 rounded-2xl bg-[#1C1C22] border border-[#303039] space-y-2">
                <label className="block text-[11px] font-semibold text-[#B8B8C2]">
                  Or enter external video link
                </label>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={e => {
                    setVideoUrl(e.target.value);
                    if (e.target.value) setVideoPreview(e.target.value);
                  }}
                  placeholder="https://... (.mp4 link)"
                  className="w-full px-3 py-2 rounded-xl bg-[#141418] border border-[#303039] text-white text-xs focus:border-[#FF4F9A] outline-none"
                />
              </div>
            </div>
          )}

          {/* Document Upload Area */}
          {postType === 'DOCUMENT' && (
            <div className="space-y-4">
              <div
                onClick={() => docInputRef.current?.click()}
                className={clsx(
                  'border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all',
                  fileUrl
                    ? 'border-emerald-500/50 bg-emerald-950/10'
                    : 'border-[#303039] hover:border-[#FF4F9A]/50 bg-[#1C1C22]'
                )}
              >
                <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-3">
                  <FileText className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1">
                  {fileName ? fileName : 'Choose PDF, DOC, or DOCX'}
                </h4>
                <p className="text-xs text-[#B8B8C2] max-w-xs">
                  {isUploading
                    ? 'Uploading and processing document...'
                    : fileUrl
                    ? 'Document uploaded successfully! Click to change.'
                    : 'Drag and drop or click to upload. Max size 30MB.'}
                </p>

                <input
                  ref={docInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleDocFileChange(e.target.files[0])}
                />
              </div>

              {fileUrl && (
                <div className="p-4 rounded-2xl bg-[#1C1C22] border border-[#303039] flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{fileName}</p>
                      <p className="text-[10px] text-[#B8B8C2]">
                        {docType || 'Document'} • {fileSize ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFileUrl('');
                      setFileName('');
                      setDocType(undefined);
                    }}
                    className="p-1 rounded-lg text-[#B8B8C2] hover:text-red-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Photo / Artwork Upload Area */}
          {(postType === 'PHOTO' || postType === 'ART') && (
            <div className="space-y-4">
              <div
                onClick={() => imageInputRef.current?.click()}
                className={clsx(
                  'border-2 border-dashed rounded-3xl p-6 min-h-[280px] flex flex-col items-center justify-center text-center cursor-pointer transition-all relative overflow-hidden',
                  imagePreview || imageUrl
                    ? 'border-[#FF4F9A]/40 bg-[#141418]'
                    : 'border-[#303039] hover:border-[#FF4F9A]/50 bg-[#1C1C22]'
                )}
              >
                {imagePreview || imageUrl ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img
                      src={imagePreview || imageUrl}
                      alt="Preview"
                      className="max-h-[300px] w-auto rounded-2xl object-contain shadow-md"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center text-white text-xs font-bold">
                      Click to replace
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-2xl bg-[#FF4F9A]/10 border border-[#FF4F9A]/20 flex items-center justify-center text-[#FF4F9A] mb-3">
                      <Camera className="w-7 h-7" />
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1">Upload Photo or Artwork</h4>
                    <p className="text-xs text-[#B8B8C2] max-w-xs">
                      {isUploading
                        ? 'Uploading high-res image...'
                        : 'JPG, PNG, WEBP, or GIF. Max 15MB.'}
                    </p>
                  </>
                )}

                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleImageFileChange(e.target.files[0])}
                />
              </div>
            </div>
          )}

          {/* Thought / Text Only */}
          {postType === 'THOUGHT' && (
            <div className="p-6 rounded-3xl bg-[#1C1C22] border border-[#303039] text-center">
              <MessageSquareQuote className="w-8 h-8 text-[#FF4F9A] mx-auto mb-2 opacity-80" />
              <h4 className="text-sm font-bold text-white mb-1">Creative Thought or Essay</h4>
              <p className="text-xs text-[#B8B8C2]">
                Your thought will be displayed in typography format. You can optionally upload a background visual if desired.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Music Track Selector Modal */}
      <MusicTrackSelectorModal
        isOpen={showMusicModal}
        onClose={() => setShowMusicModal(false)}
        selectedTrackId={attachedMusicTrack?.id}
        onSelectTrack={(track) => {
          setAttachedMusicTrack(track);
          setAttachedAudioUrl(null);
          setAttachedAudioDuration(null);
          toast.success(`Attached "${track.title}" by ${track.artist}`);
        }}
      />
    </div>
  );
}
