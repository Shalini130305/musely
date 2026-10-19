import { useState, useEffect, useCallback } from 'react';
import { MasonryGrid } from '@/components/posts/MasonryGrid';
import type { Post, PaginationMeta } from '@/types';
import api, { getErrorMessage } from '@/services/api';
import { Flame, Clock, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function ExplorePage() {
  const [filter, setFilter] = useState<'trending' | 'recent' | 'saved'>('trending');
  const [posts, setPosts] = useState<Post[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchExplorePosts = useCallback(async (currentFilter: string, pageNum: number, append = false) => {
    try {
      if (!append) setIsLoading(true);
      const params = new URLSearchParams();
      params.append('page', pageNum.toString());
      params.append('limit', '20');

      let endpoint = '/posts';
      if (currentFilter === 'trending') {
        params.append('sort', 'popular');
        endpoint = '/search';
      }

      const { data } = await api.get(`${endpoint}?${params.toString()}`);
      if (append) {
        setPosts(prev => [...prev, ...data.posts]);
      } else {
        setPosts(data.posts);
      }
      setPagination(data.pagination);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    fetchExplorePosts(filter, 1, false);
  }, [filter, fetchExplorePosts]);

  const handleLoadMore = () => {
    if (!pagination?.hasMore || isLoading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchExplorePosts(filter, nextPage, true);
  };

  const handlePostUpdate = (postId: string, updates: Partial<Post>) => {
    setPosts(prev =>
      prev.map(p => (p.id === postId ? { ...p, ...updates } : p))
    );
  };

  return (
    <div className="min-h-screen py-6 max-w-screen-2xl mx-auto px-4">
      {/* Explore Banner Header */}
      <div className="mb-8 rounded-3xl p-8 bg-gradient-to-r from-[#FF4F9A]/15 via-[#1C1C22] to-[#151519] border border-[#303039] relative overflow-hidden shadow-xl">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FF4F9A] text-white text-[11px] font-bold mb-3 shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
            Original Discovery • India
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-white mb-2">
            Discover. Express. Connect.
          </h1>
          <p className="text-xs sm:text-sm text-[#B8B8C2] leading-relaxed">
            Explore authentic photography, original short videos, artwork, thoughts, and creative stories shared by real people across India.
          </p>
        </div>

        {/* Ambient glow decoration */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-[#FF4F9A]/10 to-transparent pointer-events-none" />
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-[#303039] pb-4 mb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('trending')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all',
              filter === 'trending'
                ? 'bg-[#FF4F9A] text-white shadow-lg shadow-[#FF4F9A]/20'
                : 'bg-[#1C1C22] text-[#B8B8C2] hover:text-white border border-[#303039]'
            )}
          >
            <Flame className="w-4 h-4" />
            Top Stories & Visuals
          </button>
          <button
            onClick={() => setFilter('recent')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all',
              filter === 'recent'
                ? 'bg-[#FF4F9A] text-white shadow-lg shadow-[#FF4F9A]/20'
                : 'bg-[#1C1C22] text-[#B8B8C2] hover:text-white border border-[#303039]'
            )}
          >
            <Clock className="w-4 h-4" />
            Latest Releases
          </button>
        </div>
      </div>

      {/* Masonry Grid */}
      <MasonryGrid
        posts={posts}
        isLoading={isLoading}
        pagination={pagination}
        onLoadMore={handleLoadMore}
        onPostUpdate={handlePostUpdate}
        emptyMessage="No posts found in explore"
        emptySubtext="Check back soon as creators publish new work!"
      />
    </div>
  );
}
