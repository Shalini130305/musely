import { useState, useEffect, useCallback } from 'react';
import { MasonryGrid } from '@/components/posts/MasonryGrid';
import { CATEGORIES, type Category, type Post, type PostType, type PaginationMeta } from '@/types';
import api, { getErrorMessage } from '@/services/api';
import { Flame, Clock, Sparkles, Image, Palette, FileText, MessageSquare, Video, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const FORMAT_FILTERS: { id: 'ALL' | PostType; label: string; icon: any }[] = [
  { id: 'ALL', label: 'All Formats', icon: Layers },
  { id: 'PHOTO', label: 'Photos', icon: Image },
  { id: 'ART', label: 'Artwork', icon: Palette },
  { id: 'DOCUMENT', label: 'Documents', icon: FileText },
  { id: 'THOUGHT', label: 'Thoughts', icon: MessageSquare },
  { id: 'VIDEO', label: 'Videos', icon: Video },
];

export default function ExplorePage() {
  const [sort, setSort] = useState<'popular' | 'recent'>('popular');
  const [selectedFormat, setSelectedFormat] = useState<'ALL' | PostType>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<Category>('All');
  const [posts, setPosts] = useState<Post[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchExplorePosts = useCallback(
    async (currentSort: string, format: string, cat: string, pageNum: number, append = false) => {
      try {
        if (!append) setIsLoading(true);
        const params = new URLSearchParams();
        params.append('page', pageNum.toString());
        params.append('limit', '20');
        params.append('sort', currentSort);

        if (format !== 'ALL') {
          params.append('type', format);
        }

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
    },
    []
  );

  useEffect(() => {
    setPage(1);
    fetchExplorePosts(sort, selectedFormat, selectedCategory, 1, false);
  }, [sort, selectedFormat, selectedCategory, fetchExplorePosts]);

  const handleLoadMore = () => {
    if (!pagination?.hasMore || isLoading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchExplorePosts(sort, selectedFormat, selectedCategory, nextPage, true);
  };

  const handlePostUpdate = (postId: string, updates: Partial<Post>) => {
    setPosts(prev =>
      prev.map(p => (p.id === postId ? { ...p, ...updates } : p))
    );
  };

  return (
    <div className="min-h-screen py-6 max-w-screen-2xl mx-auto px-4">
      {/* Explore Banner Header */}
      <div className="mb-8 rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-[#FF4F9A]/15 via-[#1C1C22] to-[#151519] border border-[#303039] relative overflow-hidden shadow-xl">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FF4F9A] text-white text-[11px] font-bold mb-3 shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
            Original Discovery • India
          </div>
          <h1 className="text-2xl sm:text-4xl font-display font-bold tracking-tight text-white mb-2">
            Discover. Express. Connect.
          </h1>
          <p className="text-xs sm:text-sm text-[#B8B8C2] leading-relaxed">
            Explore authentic photography, original artwork, research documents, poetry, thoughts, and creative stories shared by creators across India.
          </p>
        </div>

        {/* Ambient glow decoration */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-[#FF4F9A]/10 to-transparent pointer-events-none" />
      </div>

      {/* Primary Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#303039] pb-4 mb-6">
        {/* Sort Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSort('popular')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer',
              sort === 'popular'
                ? 'bg-[#FF4F9A] text-white shadow-lg shadow-[#FF4F9A]/20'
                : 'bg-[#1C1C22] text-[#B8B8C2] hover:text-white border border-[#303039]'
            )}
          >
            <Flame className="w-4 h-4" />
            Top Stories & Visuals
          </button>
          <button
            onClick={() => setSort('recent')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer',
              sort === 'recent'
                ? 'bg-[#FF4F9A] text-white shadow-lg shadow-[#FF4F9A]/20'
                : 'bg-[#1C1C22] text-[#B8B8C2] hover:text-white border border-[#303039]'
            )}
          >
            <Clock className="w-4 h-4" />
            Latest Releases
          </button>
        </div>

        {/* Category Dropdown Filter */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value as Category)}
            className="bg-[#1C1C22] text-xs font-medium text-white border border-[#303039] rounded-xl px-3 py-2 outline-none focus:border-[#FF4F9A] cursor-pointer"
          >
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>
                {cat === 'All' ? 'All Categories' : cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Format Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-4 mb-4">
        {FORMAT_FILTERS.map(f => {
          const Icon = f.icon;
          const isSelected = selectedFormat === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setSelectedFormat(f.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all select-none cursor-pointer',
                isSelected
                  ? 'bg-white text-black font-bold shadow-sm'
                  : 'bg-[#1C1C22] text-[#B8B8C2] hover:text-white border border-[#303039]'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Masonry Grid */}
      <MasonryGrid
        posts={posts}
        isLoading={isLoading}
        pagination={pagination}
        onLoadMore={handleLoadMore}
        onPostUpdate={handlePostUpdate}
        emptyMessage={`No ${selectedFormat === 'ALL' ? 'creations' : selectedFormat.toLowerCase() + 's'} found`}
        emptySubtext="Be the first creator to share something inspiring in this format!"
      />
    </div>
  );
}
