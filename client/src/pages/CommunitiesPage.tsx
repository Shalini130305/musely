import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Users, Plus, Search, Shield, Lock, Globe, Sparkles } from 'lucide-react';
import { CATEGORIES } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface CommunityItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  imageUrl?: string | null;
  isPrivate: boolean;
  memberCount: number;
  isMember: boolean;
  role?: string | null;
  creator: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export default function CommunitiesPage() {
  const { isAuthenticated } = useAuth();
  const [communities, setCommunities] = useState<CommunityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMyGroups, setFilterMyGroups] = useState(false);

  // Create Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Art & Design');
  const [imageUrl, setImageUrl] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCommunities = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (selectedCategory !== 'All') params.append('category', selectedCategory);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const { data } = await api.get(`/communities?${params.toString()}`);
      setCommunities(data.communities || []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  useEffect(() => {
    fetchCommunities();
  }, [fetchCommunities]);

  const handleJoinLeave = async (e: React.MouseEvent, comm: CommunityItem) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      toast.error('Please sign in to join communities');
      return;
    }

    try {
      if (comm.isMember) {
        await api.post(`/communities/${comm.slug}/leave`);
        setCommunities(prev =>
          prev.map(c =>
            c.id === comm.id
              ? { ...c, isMember: false, memberCount: Math.max(0, c.memberCount - 1) }
              : c
          )
        );
        toast.success(`Left ${comm.name}`);
      } else {
        await api.post(`/communities/${comm.slug}/join`);
        setCommunities(prev =>
          prev.map(c =>
            c.id === comm.id ? { ...c, isMember: true, memberCount: c.memberCount + 1 } : c
          )
        );
        toast.success(`Joined ${comm.name}!`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleCreateCommunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      toast.error('Name and description are required');
      return;
    }

    try {
      setIsSubmitting(true);
      const { data } = await api.post('/communities', {
        name: name.trim(),
        description: description.trim(),
        category,
        imageUrl: imageUrl.trim() || undefined,
        isPrivate,
      });

      toast.success('Community created!');
      setIsModalOpen(false);
      setName('');
      setDescription('');
      setImageUrl('');
      fetchCommunities();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayedCommunities = communities.filter(c => {
    if (filterMyGroups) return c.isMember;
    return true;
  });

  return (
    <div className="min-h-screen py-6 max-w-7xl mx-auto px-4">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-[#303039]">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF4F9A]/10 border border-[#FF4F9A]/30 text-xs font-bold text-[#FF8FBD] mb-2">
            <Users className="w-3.5 h-3.5 text-[#FF4F9A]" />
            Real Indian Interest Groups
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">
            Communities & Circles
          </h1>
          <p className="text-xs sm:text-sm text-[#B8B8C2] mt-1">
            Connect around shared arts, films, technology, culture, and creative passions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated && (
            <button
              onClick={() => setFilterMyGroups(p => !p)}
              className={clsx(
                'px-4 py-2 rounded-xl text-xs font-semibold border transition-colors',
                filterMyGroups
                  ? 'bg-[#FF4F9A] text-white border-[#FF4F9A]'
                  : 'bg-[#1C1C22] text-[#B8B8C2] hover:text-white border-[#303039]'
              )}
            >
              {filterMyGroups ? 'All Communities' : 'My Groups'}
            </button>
          )}

          <button
            onClick={() => {
              if (!isAuthenticated) {
                toast.error('Please sign in to create a community');
                return;
              }
              setIsModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-lg shadow-[#FF4F9A]/20"
          >
            <Plus className="w-4 h-4" />
            Create Community
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="space-y-3 mb-6">
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#757582]" />
          <input
            type="text"
            placeholder="Search communities by name or topic..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#1C1C22] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => setSelectedCategory('All')}
            className={clsx(
              'px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors',
              selectedCategory === 'All'
                ? 'bg-[#FF4F9A] text-white'
                : 'bg-[#1C1C22] text-[#B8B8C2] hover:text-white border border-[#303039]'
            )}
          >
            All Categories
          </button>
          {CATEGORIES.filter(c => c !== 'All').map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={clsx(
                'px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors',
                selectedCategory === cat
                  ? 'bg-[#FF4F9A] text-white'
                  : 'bg-[#1C1C22] text-[#B8B8C2] hover:text-white border border-[#303039]'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Communities */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-5 rounded-3xl bg-[#1C1C22] border border-[#303039] animate-pulse space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#303039]" />
              <div className="h-4 bg-[#303039] rounded w-2/3" />
              <div className="h-3 bg-[#303039] rounded w-full" />
            </div>
          ))}
        </div>
      ) : displayedCommunities.length === 0 ? (
        <div className="py-20 text-center flex flex-col items-center justify-center p-6 rounded-3xl bg-[#151519] border border-[#303039]">
          <div className="w-16 h-16 rounded-2xl bg-[#1C1C22] border border-[#303039] flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-[#FF4F9A]" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No communities found</h3>
          <p className="text-xs text-[#B8B8C2] max-w-sm mb-6">
            Be the pioneer! Create an original community for fellow creators and enthusiasts in {selectedCategory !== 'All' ? selectedCategory : 'India'}.
          </p>
          <button
            onClick={() => {
              if (!isAuthenticated) {
                toast.error('Please sign in to create a community');
                return;
              }
              setIsModalOpen(true);
            }}
            className="px-5 py-2.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white text-xs font-semibold transition-colors shadow-lg shadow-[#FF4F9A]/20"
          >
            Create This Community
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedCommunities.map(comm => (
            <Link
              key={comm.id}
              to={`/communities/${comm.slug}`}
              className="group p-5 rounded-3xl bg-[#151519] border border-[#303039] hover:border-[#FF4F9A]/50 transition-all duration-300 flex flex-col justify-between hover:shadow-xl hover:shadow-[#FF4F9A]/5"
            >
              <div>
                {/* Header row: Avatar & Badges */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden bg-[#1C1C22] border border-[#303039] flex-shrink-0 flex items-center justify-center text-[#FF4F9A] font-bold text-lg">
                    {comm.imageUrl ? (
                      <img src={comm.imageUrl} alt={comm.name} className="w-full h-full object-cover" />
                    ) : (
                      comm.name[0]?.toUpperCase()
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#1C1C22] border border-[#303039] text-[10px] font-medium text-[#FF8FBD]">
                      {comm.category}
                    </span>
                    {comm.isPrivate ? (
                      <span className="p-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20" title="Private Group">
                        <Lock className="w-3 h-3" />
                      </span>
                    ) : (
                      <span className="p-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="Public Group">
                        <Globe className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Name & Description */}
                <h3 className="text-base font-bold text-white group-hover:text-[#FF4F9A] transition-colors line-clamp-1 mb-1">
                  {comm.name}
                </h3>
                <p className="text-xs text-[#B8B8C2] line-clamp-2 leading-relaxed mb-4">
                  {comm.description}
                </p>
              </div>

              {/* Bottom row: Member count & Join button */}
              <div className="pt-3 border-t border-[#303039]/60 flex items-center justify-between">
                <span className="text-xs text-[#757582] flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <strong className="text-white font-semibold">{comm.memberCount}</strong> {comm.memberCount === 1 ? 'member' : 'members'}
                </span>

                <button
                  type="button"
                  onClick={e => handleJoinLeave(e, comm)}
                  className={clsx(
                    'px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors',
                    comm.isMember
                      ? 'bg-[#1C1C22] text-[#B8B8C2] hover:text-rose-400 border border-[#303039]'
                      : 'bg-[#FF4F9A] hover:bg-[#FF72AD] text-white shadow-sm'
                  )}
                >
                  {comm.isMember ? (comm.role === 'OWNER' ? 'Owner' : 'Joined') : 'Join'}
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Community Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-white mb-1">Create an Authentic Community</h3>
            <p className="text-xs text-[#B8B8C2] mb-5">
              Start an original space for discussions, post sharing, and group chat with real members.
            </p>

            <form onSubmit={handleCreateCommunity} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">
                  Community Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bangalore Indie Filmmakers, Chennai Typography Club"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={60}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0B0D] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">
                  Description *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="What is this community about? Who should join?"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  maxLength={500}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0B0D] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">
                    Category
                  </label>
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
                  <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">
                    Avatar or Icon URL (Optional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={imageUrl}
                    onChange={e => setImageUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0B0D] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-[#151519] border border-[#303039] flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-white">Private Community</p>
                  <p className="text-[11px] text-[#B8B8C2]">
                    Only approved members can access posts and group chat
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={e => setIsPrivate(e.target.checked)}
                  className="w-4 h-4 accent-[#FF4F9A] cursor-pointer"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#26262E] text-xs text-[#B8B8C2] hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || !description.trim() || isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-xs text-white font-semibold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Community'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
