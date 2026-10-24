import { useState } from 'react';
import { Link } from 'react-router-dom';
import InfiniteScroll from 'react-infinite-scroll-component';
import { PostCard } from './PostCard';
import { PostSkeleton } from './PostSkeleton';
import { ShareModal } from '@/components/share/ShareModal';
import type { Post, PaginationMeta } from '@/types';
import { Sparkles, Plus, Compass, Share2 } from 'lucide-react';

interface MasonryGridProps {
  posts: Post[];
  isLoading?: boolean;
  pagination?: PaginationMeta;
  onLoadMore?: () => void;
  onPostUpdate?: (postId: string, updates: Partial<Post>) => void;
  emptyMessage?: string;
  emptySubtext?: string;
}

export function MasonryGrid({
  posts,
  isLoading = false,
  pagination,
  onLoadMore,
  onPostUpdate,
  emptyMessage = 'Your world starts here.',
  emptySubtext = 'Share what inspires you, discover new ideas, and connect with people who share your interests.',
}: MasonryGridProps) {
  const [isShareOpen, setIsShareOpen] = useState(false);

  const handleInviteFriends = () => {
    setIsShareOpen(true);
  };

  if (isLoading && posts.length === 0) {
    return (
      <div className="masonry-grid px-4 py-4 max-w-screen-2xl mx-auto">
        {Array.from({ length: 12 }).map((_, i) => (
          <PostSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!isLoading && posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-3xl bg-[#1C1C22] border border-[#303039] flex items-center justify-center mb-5 shadow-xl">
          <Sparkles className="w-8 h-8 text-[#FF4F9A]" />
        </div>
        <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
          {emptyMessage}
        </h3>
        <p className="text-xs sm:text-sm text-[#B8B8C2] leading-relaxed mb-8">
          {emptySubtext}
        </p>

        {/* 3 Explicit actions from Prompt */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <Link
            to="/create"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white text-xs font-bold transition-all shadow-lg shadow-[#FF4F9A]/20 flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Create Your First Post
          </Link>

          <Link
            to="/explore"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#1C1C22] hover:bg-[#26262E] text-white text-xs font-bold border border-[#303039] transition-all flex items-center justify-center gap-1.5"
          >
            <Compass className="w-4 h-4 text-[#FF8FBD]" />
            Explore Categories
          </Link>

          <button
            type="button"
            onClick={handleInviteFriends}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#1C1C22] hover:bg-[#26262E] text-white text-xs font-bold border border-[#303039] transition-all flex items-center justify-center gap-1.5"
          >
            <Share2 className="w-4 h-4 text-[#FF4F9A]" />
            Invite Friends
          </button>
        </div>

        <ShareModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          item={{
            id: 'musely-invite',
            type: 'profile',
            title: 'MUSELY – Creative Social Network & Discovery Platform',
            text: 'Discover artwork, photography, design inspiration, and connect with creative minds across India on MUSELY.',
            url: window.location.origin,
            canDownload: false,
          }}
        />
      </div>
    );
  }

  if (pagination && onLoadMore) {
    return (
      <InfiniteScroll
        dataLength={posts.length}
        next={onLoadMore}
        hasMore={pagination.hasMore}
        loader={
          <div className="masonry-grid px-4 py-4 max-w-screen-2xl mx-auto">
            {Array.from({ length: 4 }).map((_, i) => (
              <PostSkeleton key={i} />
            ))}
          </div>
        }
        endMessage={
          posts.length > 0 ? (
            <p className="text-center text-xs text-[#757582] py-8">
              You've explored all authentic posts ✨
            </p>
          ) : null
        }
      >
        <div className="masonry-grid px-4 py-4 max-w-screen-2xl mx-auto">
          {posts.map(post => (
            <PostCard key={post.id} post={post} onUpdate={onPostUpdate} />
          ))}
        </div>
      </InfiniteScroll>
    );
  }

  return (
    <div className="masonry-grid px-4 py-4 max-w-screen-2xl mx-auto">
      {posts.map(post => (
        <PostCard key={post.id} post={post} onUpdate={onPostUpdate} />
      ))}
    </div>
  );
}
