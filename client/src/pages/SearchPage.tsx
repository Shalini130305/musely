import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { MasonryGrid } from '@/components/posts/MasonryGrid';
import type { Post, PaginationMeta, User } from '@/types';
import api, { getErrorMessage } from '@/services/api';
import { Search as SearchIcon, Users } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [searchInput, setSearchInput] = useState(query);
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  const executeSearch = useCallback(async (q: string, pageNum: number, append = false) => {
    if (!q.trim()) {
      setPosts([]);
      setUsers([]);
      return;
    }

    try {
      if (!append) setIsLoading(true);
      const params = new URLSearchParams();
      params.append('q', q);
      params.append('page', pageNum.toString());
      params.append('limit', '20');

      const { data } = await api.get(`/search?${params.toString()}`);
      if (append) {
        setPosts(prev => [...prev, ...data.posts]);
      } else {
        setPosts(data.posts || []);
        setUsers(data.users || []);
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
    executeSearch(query, 1, false);
  }, [query, executeSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSearchParams({ q: searchInput.trim() });
    }
  };

  const handleLoadMore = () => {
    if (!pagination?.hasMore || isLoading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    executeSearch(query, nextPage, true);
  };

  const handlePostUpdate = (postId: string, updates: Partial<Post>) => {
    setPosts(prev =>
      prev.map(p => (p.id === postId ? { ...p, ...updates } : p))
    );
  };

  return (
    <div className="min-h-screen py-6 max-w-screen-2xl mx-auto px-4">
      {/* Search Bar header */}
      <div className="max-w-2xl mx-auto mb-8 text-center">
        <form onSubmit={handleSearchSubmit} className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search keywords, artists, tags..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="input pl-12 pr-4 py-3.5 text-base rounded-2xl shadow-sm"
          />
        </form>

        {query && (
          <p className="mt-3 text-xs sm:text-sm text-charcoal-500">
            Results for <span className="font-semibold text-charcoal-900 dark:text-charcoal-100">"{query}"</span>
          </p>
        )}
      </div>

      {/* Matching Creators Section */}
      {users.length > 0 && (
        <div className="mb-10 p-6 rounded-3xl bg-cream-100 dark:bg-charcoal-800/50 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider text-charcoal-500">
            <Users className="w-4 h-4 text-accent-600" />
            Matching Creators
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {users.map(u => (
              <Link
                key={u.id}
                to={`/profile/${u.username}`}
                className="flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-charcoal-800 hover:shadow-md transition-all group"
              >
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt={u.displayName} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-accent-600 text-white font-bold flex items-center justify-center text-sm">
                    {u.displayName[0]?.toUpperCase()}
                  </div>
                )}
                <div className="truncate">
                  <h4 className="text-sm font-semibold text-charcoal-900 dark:text-charcoal-50 truncate group-hover:text-accent-600 transition-colors">
                    {u.displayName}
                  </h4>
                  <p className="text-xs text-charcoal-500 truncate">@{u.username}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Posts Results */}
      <MasonryGrid
        posts={posts}
        isLoading={isLoading}
        pagination={pagination}
        onLoadMore={handleLoadMore}
        onPostUpdate={handlePostUpdate}
        emptyMessage={query ? `No posts matching "${query}"` : 'Type in the search bar above to begin discovery'}
        emptySubtext={query ? 'Try different keywords or browse our categories!' : 'Discover art, architecture, fashion, interior ideas, and more.'}
      />
    </div>
  );
}
