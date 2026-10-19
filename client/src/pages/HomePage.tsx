import { useState, useEffect, useCallback } from 'react';
import { MasonryGrid } from '@/components/posts/MasonryGrid';
import { CATEGORIES, type Category, type Post, type PaginationMeta } from '@/types';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function HomePage() {
  const [selectedCategory, setSelectedCategory] = useState<Category>('All');
  const [posts, setPosts] = useState<Post[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchPosts = useCallback(async (cat: Category, pageNum: number, append = false) => {
    try {
      if (!append) setIsLoading(true);
      const params = new URLSearchParams();
      params.append('page', pageNum.toString());
      params.append('limit', '20');
      if (cat !== 'All') {
        params.append('category', cat);
      }

      const { data } = await api.get(`/posts?${params.toString()}`);
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
    fetchPosts(selectedCategory, 1, false);
  }, [selectedCategory, fetchPosts]);

  const handleLoadMore = () => {
    if (!pagination?.hasMore || isLoading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPosts(selectedCategory, nextPage, true);
  };

  const handlePostUpdate = (postId: string, updates: Partial<Post>) => {
    setPosts(prev =>
      prev.map(p => (p.id === postId ? { ...p, ...updates } : p))
    );
  };

  return (
    <div className="min-h-screen py-4">
      {/* Category Pills Header */}
      <div className="sticky top-16 z-30 bg-[#0B0B0D]/95 backdrop-blur-md py-3 border-b border-[#303039] mb-4">
        <div className="max-w-screen-2xl mx-auto px-4 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={clsx(
                'px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 select-none cursor-pointer',
                selectedCategory === category
                  ? 'bg-[#FF4F9A] text-white shadow-lg shadow-[#FF4F9A]/20'
                  : 'bg-[#1C1C22] text-[#B8B8C2] hover:text-white border border-[#303039]'
              )}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Container */}
      <div className="w-full">
        <MasonryGrid
          posts={posts}
          isLoading={isLoading}
          pagination={pagination}
          onLoadMore={handleLoadMore}
          onPostUpdate={handlePostUpdate}
          emptyMessage={`No inspiration found in ${selectedCategory}`}
          emptySubtext="Be the creative pioneer and share the first image in this space!"
        />
      </div>
    </div>
  );
}
