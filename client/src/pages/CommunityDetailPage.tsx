import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Users,
  MessageSquare,
  FileText,
  Lock,
  Globe,
  Share2,
  ShieldAlert,
  Send,
  Plus,
  ArrowLeft,
  Sparkles,
  Crown
} from 'lucide-react';
import { PostCard } from '@/components/posts/PostCard';
import { ShareModal } from '@/components/share/ShareModal';
import type { Post } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface CommunityDetail {
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
  createdAt: string;
  creator: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

interface CommunityMessage {
  id: string;
  content: string;
  createdAt: string;
  sender: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

interface MemberItem {
  id: string;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export default function CommunityDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isAuthenticated } = useAuth();

  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'posts' | 'chat' | 'members'>('posts');
  const [posts, setPosts] = useState<Post[]>([]);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<any>(null);

  const fetchCommunityDetails = useCallback(async () => {
    if (!slug) return;
    try {
      setIsLoading(true);
      const { data } = await api.get(`/communities/${slug}`);
      setCommunity(data.community);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  const fetchPosts = useCallback(async () => {
    if (!slug) return;
    try {
      const { data } = await api.get(`/communities/${slug}/posts`);
      setPosts(data.posts || []);
    } catch {
      // silent
    }
  }, [slug]);

  const fetchChatMessages = useCallback(async () => {
    if (!slug) return;
    try {
      const { data } = await api.get(`/communities/${slug}/chat`);
      setMessages(data.messages || []);
    } catch {
      // silent
    }
  }, [slug]);

  const fetchMembers = useCallback(async () => {
    if (!slug) return;
    try {
      const { data } = await api.get(`/communities/${slug}/members`);
      setMembers(data.members || []);
    } catch {
      // silent
    }
  }, [slug]);

  useEffect(() => {
    fetchCommunityDetails();
  }, [fetchCommunityDetails]);

  useEffect(() => {
    if (!community) return;

    if (activeTab === 'posts') {
      fetchPosts();
    } else if (activeTab === 'chat' && community.isMember) {
      fetchChatMessages();
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(fetchChatMessages, 4000);
    } else if (activeTab === 'members') {
      fetchMembers();
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [activeTab, community, fetchPosts, fetchChatMessages, fetchMembers]);

  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const handleJoinLeave = async () => {
    if (!community) return;
    if (!isAuthenticated) {
      toast.error('Please sign in to join');
      return;
    }

    try {
      if (community.isMember) {
        await api.post(`/communities/${community.slug}/leave`);
        setCommunity(prev =>
          prev ? { ...prev, isMember: false, memberCount: Math.max(0, prev.memberCount - 1) } : null
        );
        toast.success(`Left ${community.name}`);
      } else {
        await api.post(`/communities/${community.slug}/join`);
        setCommunity(prev =>
          prev ? { ...prev, isMember: true, memberCount: prev.memberCount + 1 } : null
        );
        toast.success(`Joined ${community.name}!`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!community || !chatInput.trim() || isSendingChat) return;

    const content = chatInput.trim();
    setChatInput('');
    try {
      setIsSendingChat(true);
      const { data } = await api.post(`/communities/${community.slug}/chat`, { content });
      setMessages(prev => [...prev, data.message]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleShare = () => {
    setIsShareModalOpen(true);
  };

  const handleReport = async () => {
    if (!community) return;
    const reason = window.prompt('Why are you reporting this community?');
    if (!reason) return;
    try {
      await api.post('/moderation/report', {
        targetCommunityId: community.id,
        reason: 'Community Guideline Violation',
        details: reason,
      });
      toast.success('Report submitted to moderation');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen py-12 max-w-5xl mx-auto px-4 flex items-center justify-center">
        <p className="text-sm text-[#B8B8C2] animate-pulse">Loading community...</p>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="min-h-screen py-16 max-w-xl mx-auto px-4 text-center">
        <h2 className="text-xl font-bold text-white mb-2">Community Not Found</h2>
        <p className="text-xs text-[#B8B8C2] mb-6">
          This community does not exist or may have been removed.
        </p>
        <Link to="/communities" className="btn-primary px-4 py-2 text-xs">
          Explore Communities
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-6 max-w-5xl mx-auto px-4">
      {/* Back button */}
      <Link
        to="/communities"
        className="inline-flex items-center gap-1.5 text-xs text-[#B8B8C2] hover:text-white mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to all communities
      </Link>

      {/* Community Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#151519] border border-[#303039] mb-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#FF4F9A]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-[#1C1C22] border-2 border-[#303039] flex-shrink-0 flex items-center justify-center text-[#FF4F9A] font-bold text-2xl shadow-lg">
              {community.imageUrl ? (
                <img src={community.imageUrl} alt={community.name} className="w-full h-full object-cover" />
              ) : (
                community.name[0]?.toUpperCase()
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-xl sm:text-2xl font-bold text-white">{community.name}</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-[#1C1C22] border border-[#303039] text-[10px] font-semibold text-[#FF8FBD]">
                  {community.category}
                </span>
                {community.isPrivate ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px]">
                    <Lock className="w-3 h-3" /> Private
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                    <Globe className="w-3 h-3" /> Public
                  </span>
                )}
              </div>

              <p className="text-xs sm:text-sm text-[#B8B8C2] max-w-xl leading-relaxed mb-3">
                {community.description}
              </p>

              <div className="flex items-center gap-4 text-xs text-[#757582] flex-wrap">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <strong className="text-white font-semibold">{community.memberCount}</strong> {community.memberCount === 1 ? 'member' : 'members'}
                </span>
                <span>•</span>
                <span>
                  Founded by{' '}
                  <Link
                    to={`/profile/${community.creator.username}`}
                    className="text-white font-medium hover:text-[#FF4F9A] transition-colors"
                  >
                    @{community.creator.username}
                  </Link>
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              onClick={handleShare}
              className="p-2.5 rounded-xl bg-[#1C1C22] hover:bg-[#26262E] text-[#B8B8C2] hover:text-white border border-[#303039] transition-colors"
              title="Share Community"
            >
              <Share2 className="w-4 h-4" />
            </button>

            <button
              onClick={handleReport}
              className="p-2.5 rounded-xl bg-[#1C1C22] hover:bg-[#26262E] text-[#B8B8C2] hover:text-amber-400 border border-[#303039] transition-colors"
              title="Report Community"
            >
              <ShieldAlert className="w-4 h-4" />
            </button>

            <button
              onClick={handleJoinLeave}
              className={clsx(
                'px-5 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-lg',
                community.isMember
                  ? 'bg-[#1C1C22] text-[#B8B8C2] hover:text-rose-400 border border-[#303039]'
                  : 'bg-[#FF4F9A] hover:bg-[#FF72AD] text-white shadow-[#FF4F9A]/20'
              )}
            >
              {community.isMember ? (community.role === 'OWNER' ? 'Owner' : 'Joined Community') : 'Join Community'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#303039] mb-6">
        <button
          onClick={() => setActiveTab('posts')}
          className={clsx(
            'flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors',
            activeTab === 'posts'
              ? 'border-[#FF4F9A] text-white'
              : 'border-transparent text-[#B8B8C2] hover:text-white'
          )}
        >
          <FileText className="w-4 h-4" />
          Discussions & Posts ({posts.length})
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          className={clsx(
            'flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors',
            activeTab === 'chat'
              ? 'border-[#FF4F9A] text-white'
              : 'border-transparent text-[#B8B8C2] hover:text-white'
          )}
        >
          <MessageSquare className="w-4 h-4" />
          Group Chat
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={clsx(
            'flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors',
            activeTab === 'members'
              ? 'border-[#FF4F9A] text-white'
              : 'border-transparent text-[#B8B8C2] hover:text-white'
          )}
        >
          <Users className="w-4 h-4" />
          Members ({community.memberCount})
        </button>
      </div>

      {/* Tab 1: Posts */}
      {activeTab === 'posts' && (
        <div>
          {community.isMember && (
            <div className="mb-6 p-4 rounded-2xl bg-[#151519] border border-[#303039] flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white">Share with this community</p>
                <p className="text-[11px] text-[#B8B8C2]">
                  Publish original artwork, photographs, or thoughts directly to {community.name}.
                </p>
              </div>
              <Link
                to={`/create?communityId=${community.id}`}
                className="px-4 py-2 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Post Here
              </Link>
            </div>
          )}

          {posts.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center p-6 rounded-3xl bg-[#151519] border border-[#303039]">
              <div className="w-16 h-16 rounded-2xl bg-[#1C1C22] border border-[#303039] flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-[#FF4F9A]" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">No posts in this community yet</h3>
              <p className="text-xs text-[#B8B8C2] max-w-sm mb-6">
                Be the first to share an inspiring photo, artwork, or thought with fellow members.
              </p>
              {community.isMember && (
                <Link
                  to={`/create?communityId=${community.id}`}
                  className="px-5 py-2.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white text-xs font-semibold transition-colors shadow-lg shadow-[#FF4F9A]/20"
                >
                  Create First Post
                </Link>
              )}
            </div>
          ) : (
            <div className="masonry-grid">
              {posts.map(p => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Group Text Chat */}
      {activeTab === 'chat' && (
        <div className="rounded-3xl bg-[#151519] border border-[#303039] h-[550px] flex flex-col shadow-xl overflow-hidden">
          {!community.isMember ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Lock className="w-12 h-12 text-[#FF4F9A] mb-3" />
              <h3 className="text-base font-bold text-white mb-1">Members-Only Group Chat</h3>
              <p className="text-xs text-[#B8B8C2] max-w-xs mb-4">
                Join {community.name} to participate in live discussions and group chat with members.
              </p>
              <button
                onClick={handleJoinLeave}
                className="px-5 py-2.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white text-xs font-semibold transition-colors"
              >
                Join Community to Chat
              </button>
            </div>
          ) : (
            <>
              {/* Chat Message Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <MessageSquare className="w-10 h-10 text-[#757582] mb-2" />
                    <p className="text-xs font-bold text-white">No group messages yet</p>
                    <p className="text-[11px] text-[#B8B8C2]">
                      Start the group conversation with fellow members!
                    </p>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMe = msg.sender.id === user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={clsx(
                          'flex gap-2.5 max-w-[85%] sm:max-w-[75%]',
                          isMe ? 'ml-auto flex-row-reverse' : 'mr-auto'
                        )}
                      >
                        <Link to={`/profile/${msg.sender.username}`} className="flex-shrink-0">
                          {msg.sender.avatarUrl ? (
                            <img
                              src={msg.sender.avatarUrl}
                              alt={msg.sender.displayName}
                              className="w-7 h-7 rounded-full object-cover border border-[#303039]"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-[#FF4F9A] text-white flex items-center justify-center font-bold text-[10px]">
                              {msg.sender.displayName[0]?.toUpperCase()}
                            </div>
                          )}
                        </Link>

                        <div>
                          <div className={clsx('flex items-center gap-1.5 mb-0.5', isMe && 'justify-end')}>
                            <span className="text-[10px] font-bold text-[#B8B8C2]">
                              {isMe ? 'You' : msg.sender.displayName}
                            </span>
                            <span className="text-[9px] text-[#757582]">
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div
                            className={clsx(
                              'px-3.5 py-2 rounded-2xl text-xs leading-relaxed break-words',
                              isMe
                                ? 'bg-[#FF4F9A] text-white rounded-tr-sm'
                                : 'bg-[#1C1C22] text-white border border-[#303039] rounded-tl-sm'
                            )}
                          >
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendChat} className="p-3 bg-[#0B0B0D] border-t border-[#303039] flex items-center gap-2">
                <input
                  type="text"
                  placeholder={`Message #${community.name}...`}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  maxLength={1000}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[#1C1C22] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isSendingChat}
                  className="p-2.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white disabled:opacity-40 transition-colors flex items-center justify-center"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* Tab 3: Members Directory */}
      {activeTab === 'members' && (
        <div className="rounded-3xl bg-[#151519] border border-[#303039] p-6 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-[#FF4F9A]" />
            Genuine Community Members ({members.length})
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {members.map(m => (
              <div
                key={m.id}
                className="p-3 rounded-2xl bg-[#1C1C22] border border-[#303039] flex items-center justify-between gap-3"
              >
                <Link to={`/profile/${m.user.username}`} className="flex items-center gap-2.5 min-w-0">
                  {m.user.avatarUrl ? (
                    <img
                      src={m.user.avatarUrl}
                      alt={m.user.displayName}
                      className="w-9 h-9 rounded-full object-cover border border-[#303039]"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-[#FF4F9A] text-white flex items-center justify-center font-bold text-xs">
                      {m.user.displayName[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="truncate">
                    <p className="text-xs font-bold text-white hover:text-[#FF4F9A] transition-colors truncate">
                      {m.user.displayName}
                    </p>
                    <p className="text-[10px] text-[#757582] truncate">@{m.user.username}</p>
                  </div>
                </Link>

                {m.role === 'OWNER' && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF4F9A]/15 text-[#FF8FBD] text-[10px] font-bold border border-[#FF4F9A]/30 flex-shrink-0">
                    <Crown className="w-3 h-3 text-[#FF4F9A]" /> Owner
                  </span>
                )}
                {m.role === 'MODERATOR' && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[10px] font-bold border border-blue-500/30 flex-shrink-0">
                    Mod
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {community && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          item={{
            id: community.slug,
            type: 'community',
            title: `${community.name} Community on MUSELY`,
            text: community.description || `Join ${community.name} on MUSELY - India's Creative Discovery Platform`,
            url: `${window.location.origin}/communities/${community.slug}`,
            canDownload: false,
          }}
        />
      )}
    </div>
  );
}
