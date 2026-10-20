import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Globe, Calendar, Settings, Grid, Bookmark, FolderHeart,
  MapPin, MessageSquare, ShieldAlert, BadgeCheck, Lock,
  Clock, Check, UserPlus, UserCheck
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { MasonryGrid } from '@/components/posts/MasonryGrid';
import type { User, Post, PaginationMeta, Collection } from '@/types';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user: currentUser, isAuthenticated } = useAuth();

  const [profile, setProfile] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'created' | 'saved' | 'collections'>('created');
  const [posts, setPosts] = useState<Post[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowPending, setIsFollowPending] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [page, setPage] = useState(1);

  const isOwner = currentUser?.username === username;

  // Fetch user profile info
  const fetchProfile = useCallback(async () => {
    if (!username) return;
    try {
      const { data } = await api.get(`/users/${username}`);
      setProfile(data.user);
      setIsFollowing(data.user.isFollowing || false);
      setIsFollowPending(data.user.isFollowPending || false);
      setFollowersCount(data.user._count?.followers || 0);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, [username]);

  // Fetch posts or collections based on active tab
  const fetchTabContent = useCallback(async (tab: string, pageNum: number, append = false) => {
    if (!username) return;
    try {
      if (!append) setIsLoading(true);

      if (tab === 'collections') {
        const { data } = await api.get('/collections');
        setCollections(data.collections || []);
        setIsLoading(false);
        return;
      }

      const endpoint = tab === 'saved' ? `/users/${username}/saved` : `/users/${username}/posts`;
      const { data } = await api.get(`${endpoint}?page=${pageNum}&limit=20`);

      if (append) {
        setPosts(prev => [...prev, ...data.posts]);
      } else {
        setPosts(data.posts || []);
      }
      setPagination(data.pagination);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    setPage(1);
    fetchTabContent(activeTab, 1, false);
  }, [activeTab, fetchTabContent]);

  const handleFollow = async () => {
    if (!isAuthenticated) {
      toast.error('Please sign in to follow creators');
      return;
    }
    if (!profile) return;
    try {
      const { data } = await api.post(`/users/${profile.username}/follow`);
      setIsFollowing(data.following);
      setIsFollowPending(data.requestPending || false);
      setFollowersCount(data.count);

      if (data.requestPending) {
        toast.success('Follow request sent to private account');
      } else if (data.following) {
        toast.success(`Following @${profile.username}`);
        // Refresh posts since follower can now view private posts
        fetchTabContent(activeTab, 1, false);
      } else {
        toast.success(data.message || `Unfollowed @${profile.username}`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleLoadMore = () => {
    if (!pagination?.hasMore || isLoading || activeTab === 'collections') return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchTabContent(activeTab, nextPage, true);
  };

  const handlePostUpdate = (postId: string, updates: Partial<Post>) => {
    setPosts(prev => prev.map(p => (p.id === postId ? { ...p, ...updates } : p)));
  };

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#FF4F9A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Account is private and viewer is not owner and not follower
  const isPrivateLocked = profile.isPrivate && !isOwner && !isFollowing;

  return (
    <div className="min-h-screen py-8 max-w-screen-2xl mx-auto px-4">
      {/* Profile Header Card */}
      <div className="max-w-2xl mx-auto text-center mb-10">
        {/* Cover image */}
        {profile.coverUrl && (
          <div className="w-full h-36 rounded-3xl overflow-hidden mb-[-3rem] relative border border-[#303039]">
            <img src={profile.coverUrl} alt="Cover" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="relative inline-block mb-4 mt-2">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover shadow-lg border-4 border-[#0B0B0D] mx-auto"
            />
          ) : (
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-[#FF4F9A] text-white font-bold text-3xl flex items-center justify-center shadow-lg border-4 border-[#0B0B0D] mx-auto">
              {profile.displayName[0]?.toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 flex-wrap mb-1">
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">
            {profile.displayName}
          </h1>
          {profile.isVerified && (
            <span title="Verified MUSELY Account">
              <BadgeCheck className="w-6 h-6 text-blue-400 shrink-0" />
            </span>
          )}
          {profile.isPrivate && (
            <span
              title="Private Account"
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-950/60 text-purple-300 border border-purple-800/60"
            >
              <Lock className="w-3 h-3 text-purple-400" />
              Private
            </span>
          )}
        </div>

        <p className="text-sm text-[#B8B8C2]">@{profile.username}</p>

        {profile.bio && (
          <p className="text-sm text-[#D8D8E0] max-w-md mx-auto mt-3 leading-relaxed whitespace-pre-line">
            {profile.bio}
          </p>
        )}

        {/* Location & Interests */}
        {profile.location && (
          <div className="flex items-center justify-center gap-1.5 mt-2 text-xs text-[#FF8FBD]">
            <MapPin className="w-3.5 h-3.5 text-[#FF4F9A]" />
            <span>{profile.location}</span>
          </div>
        )}

        {profile.interests && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3 max-w-md mx-auto">
            {profile.interests.split(',').map(item => item.trim()).filter(Boolean).map(interest => (
              <span
                key={interest}
                className="px-2.5 py-0.5 rounded-full bg-[#1C1C22] border border-[#303039] text-[11px] font-medium text-[#B8B8C2]"
              >
                #{interest}
              </span>
            ))}
          </div>
        )}

        {/* Website & Joined */}
        <div className="flex flex-wrap items-center justify-center gap-4 mt-3 text-xs text-[#757582]">
          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-[#FF4F9A] transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              {profile.website.replace(/^https?:\/\//, '')}
            </a>
          )}
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            Joined {new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-center gap-6 mt-6 py-3 px-6 rounded-2xl bg-[#151519] border border-[#303039] inline-flex">
          <div className="text-center">
            <span className="block font-bold text-base text-white">
              {profile._count?.posts || 0}
            </span>
            <span className="text-[11px] text-[#757582] uppercase tracking-wider">Posts</span>
          </div>
          <div className="w-px h-6 bg-[#303039]" />
          <div className="text-center">
            <span className="block font-bold text-base text-white">
              {followersCount}
            </span>
            <span className="text-[11px] text-[#757582] uppercase tracking-wider">Followers</span>
          </div>
          <div className="w-px h-6 bg-[#303039]" />
          <div className="text-center">
            <span className="block font-bold text-base text-white">
              {profile._count?.following || 0}
            </span>
            <span className="text-[11px] text-[#757582] uppercase tracking-wider">Following</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-6 flex items-center justify-center gap-3">
          {isOwner ? (
            <Link
              to="/settings"
              className="px-5 py-2.5 rounded-2xl bg-[#1C1C22] hover:bg-[#26262E] text-white text-xs sm:text-sm font-semibold border border-[#303039] transition-colors flex items-center gap-2 shadow-sm"
            >
              <Settings className="w-4 h-4 text-[#FF4F9A]" />
              Edit Profile & Privacy
            </Link>
          ) : (
            <>
              <button
                onClick={handleFollow}
                className={clsx(
                  'px-6 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all shadow-sm flex items-center gap-2',
                  isFollowing
                    ? 'bg-[#1C1C22] text-[#B8B8C2] hover:text-white border border-[#303039]'
                    : isFollowPending
                    ? 'bg-purple-950/60 text-purple-300 border border-purple-800'
                    : 'bg-[#FF4F9A] text-white hover:bg-[#FF72AD] shadow-lg shadow-[#FF4F9A]/20'
                )}
              >
                {isFollowing ? (
                  <>
                    <UserCheck className="w-4 h-4" /> Following
                  </>
                ) : isFollowPending ? (
                  <>
                    <Clock className="w-4 h-4 text-purple-400" /> Requested
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" /> Follow
                  </>
                )}
              </button>

              <Link
                to={`/messages?userId=${profile.id}`}
                className="px-5 py-2.5 rounded-2xl bg-[#1C1C22] hover:bg-[#26262E] text-white text-xs sm:text-sm font-semibold border border-[#303039] transition-colors flex items-center gap-1.5"
              >
                <MessageSquare className="w-4 h-4 text-[#FF4F9A]" />
                Message
              </Link>
            </>
          )}
        </div>
      </div>

      {/* If Private & Not Follower: Show Private Account Lock Screen */}
      {isPrivateLocked ? (
        <div className="max-w-md mx-auto my-12 p-8 rounded-3xl bg-[#1C1C22] border border-[#303039] text-center shadow-xl animate-fade-in">
          <div className="w-16 h-16 rounded-3xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mx-auto mb-4 shadow-sm">
            <Lock className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">This Account is Private</h3>
          <p className="text-xs text-[#B8B8C2] leading-relaxed mb-6">
            Follow @{profile.username} to see their creative photos, documents, artwork, and posts.
          </p>
          <button
            onClick={handleFollow}
            className={clsx(
              'px-6 py-2.5 rounded-2xl text-xs font-semibold transition-all shadow-md',
              isFollowPending
                ? 'bg-purple-950 text-purple-300 border border-purple-800'
                : 'bg-[#FF4F9A] hover:bg-[#FF72AD] text-white'
            )}
          >
            {isFollowPending ? 'Follow Request Sent' : 'Request to Follow'}
          </button>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex items-center justify-center gap-2 border-b border-[#303039] mb-8">
            <button
              onClick={() => setActiveTab('created')}
              className={clsx(
                'flex items-center gap-2 px-6 py-3 border-b-2 text-xs sm:text-sm font-semibold transition-all -mb-px',
                activeTab === 'created'
                  ? 'border-[#FF4F9A] text-white'
                  : 'border-transparent text-[#B8B8C2] hover:text-white'
              )}
            >
              <Grid className="w-4 h-4 text-[#FF4F9A]" />
              Created
            </button>

            {isOwner && (
              <>
                <button
                  onClick={() => setActiveTab('saved')}
                  className={clsx(
                    'flex items-center gap-2 px-6 py-3 border-b-2 text-xs sm:text-sm font-semibold transition-all -mb-px',
                    activeTab === 'saved'
                      ? 'border-[#FF4F9A] text-white'
                      : 'border-transparent text-[#B8B8C2] hover:text-white'
                  )}
                >
                  <Bookmark className="w-4 h-4 text-[#FF4F9A]" />
                  Saved
                </button>
                <button
                  onClick={() => setActiveTab('collections')}
                  className={clsx(
                    'flex items-center gap-2 px-6 py-3 border-b-2 text-xs sm:text-sm font-semibold transition-all -mb-px',
                    activeTab === 'collections'
                      ? 'border-[#FF4F9A] text-white'
                      : 'border-transparent text-[#B8B8C2] hover:text-white'
                  )}
                >
                  <FolderHeart className="w-4 h-4 text-[#FF4F9A]" />
                  Collections
                </button>
              </>
            )}
          </div>

          {/* Tab Contents */}
          {activeTab === 'collections' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {collections.length === 0 ? (
                <div className="col-span-full py-16 text-center text-[#B8B8C2]">
                  No collections created yet.
                </div>
              ) : (
                collections.map(col => (
                  <Link
                    key={col.id}
                    to={`/collections/${col.id}`}
                    className="group card overflow-hidden p-3 border border-[#303039] hover:shadow-lg transition-all"
                  >
                    <div className="aspect-[4/3] rounded-2xl bg-[#26262E] overflow-hidden mb-3">
                      {col.posts?.[0]?.post?.imageUrl ? (
                        <img
                          src={col.posts[0].post.imageUrl}
                          alt={col.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#B8B8C2] text-xs">
                          Empty Board
                        </div>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm text-white truncate">
                      {col.name}
                    </h3>
                    <p className="text-xs text-[#B8B8C2] mt-0.5">
                      {col._count?.posts || 0} visual{col._count?.posts === 1 ? '' : 's'}
                    </p>
                  </Link>
                ))
              )}
            </div>
          ) : (
            <MasonryGrid
              posts={posts}
              isLoading={isLoading}
              pagination={pagination}
              onLoadMore={handleLoadMore}
              onPostUpdate={handlePostUpdate}
              emptyMessage={activeTab === 'saved' ? 'No saved visuals yet' : 'No posts shared yet'}
              emptySubtext={
                activeTab === 'saved'
                  ? 'Save visuals you love to find them here easily.'
                  : 'Visuals published by this creator will show up here.'
              }
            />
          )}
        </>
      )}
    </div>
  );
}
