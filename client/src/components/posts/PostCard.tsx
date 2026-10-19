import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart,
  Bookmark,
  BookmarkCheck,
  Video,
  Palette,
  MessageSquareQuote,
  Users
} from 'lucide-react';
import type { Post } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import api, { getErrorMessage } from '@/services/api';
import { handleImageError } from '@/utils/imageFallback';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface PostCardProps {
  post: Post;
  onUpdate?: (postId: string, updates: Partial<Post>) => void;
}

export function PostCard({ post, onUpdate }: PostCardProps) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isLiked, setIsLiked] = useState(post.isLiked ?? false);
  const [isSaved, setIsSaved] = useState(post.isSaved ?? false);
  const [likeCount, setLikeCount] = useState(post._count?.likes ?? 0);

  const isThought = post.postType === 'THOUGHT' || !post.imageUrl;
  const isVideo = post.postType === 'VIDEO';
  const isArt = post.postType === 'ART';

  const aspectRatio = post.imageHeight && post.imageWidth
    ? post.imageHeight / post.imageWidth
    : 1.2;

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    try {
      const { data } = await api.post(`/posts/${post.id}/like`);
      setIsLiked(data.liked);
      setLikeCount(data.count);
      onUpdate?.(post.id, { isLiked: data.liked, _count: { ...post._count, likes: data.count } });
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    try {
      const { data } = await api.post(`/posts/${post.id}/save`);
      setIsSaved(data.saved);
      onUpdate?.(post.id, { isSaved: data.saved });
      toast.success(data.saved ? 'Saved to collection' : 'Removed from collection');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  // Render Thought Card
  if (isThought) {
    return (
      <div className="masonry-item group mb-4">
        <Link
          to={`/post/${post.id}`}
          className="block rounded-3xl p-5 bg-gradient-to-br from-[#1C1C22] via-[#17171D] to-[#151519] border border-[#303039] hover:border-[#FF4F9A]/60 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-[#FF4F9A]/10"
        >
          {/* Header pill */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FF4F9A]/15 text-[#FF8FBD] text-[10px] font-bold border border-[#FF4F9A]/30">
              <MessageSquareQuote className="w-3 h-3 text-[#FF4F9A]" /> Thought
            </span>

            {post.category && (
              <span className="text-[10px] text-[#757582] font-medium">
                {post.category}
              </span>
            )}
          </div>

          {/* Thought Content */}
          <div className="space-y-2 mb-4">
            <h3 className="text-sm font-bold text-white group-hover:text-[#FF4F9A] transition-colors leading-snug">
              {post.title}
            </h3>
            {post.description && (
              <p className="text-xs text-[#B8B8C2] line-clamp-4 leading-relaxed font-serif italic">
                "{post.description}"
              </p>
            )}
          </div>

          {/* Community badge if applicable */}
          {post.community && (
            <div className="mb-3 flex items-center gap-1 text-[11px] text-[#FF8FBD]">
              <Users className="w-3 h-3" />
              <span>in {post.community.name}</span>
            </div>
          )}

          {/* Footer with Author and Actions */}
          <div className="pt-3 border-t border-[#303039]/60 flex items-center justify-between">
            <div
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                navigate(`/profile/${post.author.username}`);
              }}
              className="flex items-center gap-2 group/author cursor-pointer"
            >
              {post.author.avatarUrl ? (
                <img
                  src={post.author.avatarUrl}
                  alt={post.author.displayName}
                  className="w-5 h-5 rounded-full object-cover border border-[#303039]"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-[#FF4F9A] text-white flex items-center justify-center text-[10px] font-bold">
                  {post.author.displayName[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-xs text-[#B8B8C2] group-hover/author:text-white transition-colors truncate max-w-[100px]">
                {post.author.displayName}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleLike}
                className={clsx(
                  'px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors',
                  isLiked ? 'text-[#FF4F9A] bg-[#FF4F9A]/15' : 'text-[#757582] hover:text-white'
                )}
              >
                <Heart className={clsx('w-3.5 h-3.5', isLiked && 'fill-current')} />
                {likeCount > 0 && <span>{likeCount}</span>}
              </button>

              <button
                type="button"
                onClick={handleSave}
                className={clsx(
                  'p-1.5 rounded-lg transition-colors',
                  isSaved ? 'text-[#FF4F9A] bg-[#FF4F9A]/15' : 'text-[#757582] hover:text-white'
                )}
              >
                {isSaved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </Link>
      </div>
    );
  }

  // Render Visual / Media Card (Photo, Video, Art)
  return (
    <div className="masonry-item group mb-4">
      <Link to={`/post/${post.id}`} className="post-card block">
        {/* Media Container */}
        <div
          className="relative w-full bg-[#1C1C22] rounded-3xl overflow-hidden border border-[#303039]"
          style={{ paddingBottom: `${Math.min(Math.max(aspectRatio * 100, 50), 200)}%` }}
        >
          <img
            src={post.imageUrl || ''}
            alt={post.title}
            onError={handleImageError}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />

          {/* Type Badges */}
          <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5">
            {isVideo && (
              <span className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-white text-[10px] font-bold flex items-center gap-1 border border-white/10">
                <Video className="w-3 h-3 text-[#FF4F9A]" /> Video
              </span>
            )}
            {isArt && (
              <span className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-white text-[10px] font-bold flex items-center gap-1 border border-white/10">
                <Palette className="w-3 h-3 text-[#FF4F9A]" /> Artwork
              </span>
            )}
          </div>

          {/* Overlay */}
          <div className="overlay" />

          {/* Action buttons */}
          <div className="actions">
            <div className="text-white text-xs font-semibold truncate flex-1 mr-2">
              {post.title}
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={handleLike}
                className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all duration-200',
                  isLiked
                    ? 'bg-[#FF4F9A] text-white shadow-lg shadow-[#FF4F9A]/40'
                    : 'bg-black/60 text-white hover:bg-black/80'
                )}
                aria-label={isLiked ? 'Unlike' : 'Like'}
              >
                <Heart className={clsx('w-4 h-4', isLiked && 'fill-current')} />
              </button>
              <button
                onClick={handleSave}
                className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all duration-200',
                  isSaved
                    ? 'bg-[#FF4F9A] text-white shadow-lg shadow-[#FF4F9A]/40'
                    : 'bg-black/60 text-white hover:bg-black/80'
                )}
                aria-label={isSaved ? 'Unsave' : 'Save'}
              >
                {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Info below media */}
        <div className="px-1.5 pt-2 pb-1">
          <p className="text-xs sm:text-sm font-semibold text-white line-clamp-1 leading-snug group-hover:text-[#FF4F9A] transition-colors">
            {post.title}
          </p>

          <div className="flex items-center justify-between gap-2 mt-1.5">
            <div
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                navigate(`/profile/${post.author.username}`);
              }}
              className="flex items-center gap-1.5 group/author cursor-pointer min-w-0"
            >
              {post.author.avatarUrl ? (
                <img
                  src={post.author.avatarUrl}
                  alt={post.author.displayName}
                  className="w-5 h-5 rounded-full object-cover border border-[#303039]"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-[#FF4F9A] flex items-center justify-center text-white text-[10px] font-bold">
                  {post.author.displayName[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-[11px] text-[#B8B8C2] group-hover/author:text-white transition-colors truncate">
                {post.author.displayName}
              </span>
            </div>

            {likeCount > 0 && (
              <span className="text-[11px] text-[#757582] flex items-center gap-1 flex-shrink-0">
                <Heart className="w-3 h-3 text-[#FF4F9A]" /> {likeCount}
              </span>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
