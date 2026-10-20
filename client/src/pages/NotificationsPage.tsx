import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Heart, MessageSquare, UserPlus, Users, CheckCheck, ExternalLink, Sparkles } from 'lucide-react';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface NotificationActor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface NotificationItem {
  id: string;
  type: 'LIKE' | 'COMMENT' | 'FOLLOW' | 'FOLLOW_REQUEST' | 'MESSAGE' | 'COMMUNITY_JOIN' | 'COMMUNITY_POST';
  isRead: boolean;
  createdAt: string;
  actor: NotificationActor;
  post?: {
    id: string;
    title: string;
    imageUrl: string | null;
  } | null;
  community?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const fetchNotifications = async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/notifications');
      setNotifications(data.notifications || []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      toast.success('All marked as read');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleMarkSingleRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
    } catch {
      // silent
    }
  };

  const filtered = notifications.filter(n => (filter === 'unread' ? !n.isRead : true));

  const getIcon = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'LIKE':
        return <Heart className="w-4 h-4 text-[#FF4F9A] fill-current" />;
      case 'COMMENT':
        return <MessageSquare className="w-4 h-4 text-sky-400" />;
      case 'FOLLOW':
        return <UserPlus className="w-4 h-4 text-emerald-400" />;
      case 'FOLLOW_REQUEST':
        return <UserPlus className="w-4 h-4 text-amber-400" />;
      case 'COMMUNITY_JOIN':
      case 'COMMUNITY_POST':
        return <Users className="w-4 h-4 text-[#FF8FBD]" />;
      case 'MESSAGE':
        return <MessageSquare className="w-4 h-4 text-indigo-400" />;
      default:
        return <Bell className="w-4 h-4 text-yellow-400" />;
    }
  };

  const getMessageText = (n: NotificationItem) => {
    switch (n.type?.toUpperCase()) {
      case 'LIKE':
        return 'liked your post';
      case 'COMMENT':
        return 'commented on your post';
      case 'FOLLOW':
        return 'started following you';
      case 'FOLLOW_REQUEST':
        return 'requested to follow you';
      case 'MESSAGE':
        return 'sent you a private message';
      case 'COMMUNITY_JOIN':
        return `joined ${n.community?.name || 'your community'}`;
      case 'COMMUNITY_POST':
        return `posted in ${n.community?.name || 'a community you follow'}`;
      default:
        return 'interacted with your profile';
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="min-h-screen py-8 max-w-3xl mx-auto px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#303039]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-2.5">
            <Bell className="w-7 h-7 text-[#FF4F9A]" />
            Notifications
          </h1>
          <p className="text-xs text-[#B8B8C2] mt-1">
            Real-time updates on your genuine connections, posts, and communities.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {notifications.some(n => !n.isRead) && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-[#FF8FBD] hover:text-[#FF4F9A] flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1C1C22] border border-[#303039] transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all as read
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={clsx(
            'px-4 py-1.5 rounded-full text-xs font-semibold transition-colors',
            filter === 'all'
              ? 'bg-[#FF4F9A] text-white'
              : 'bg-[#1C1C22] text-[#B8B8C2] hover:text-white border border-[#303039]'
          )}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={clsx(
            'px-4 py-1.5 rounded-full text-xs font-semibold transition-colors',
            filter === 'unread'
              ? 'bg-[#FF4F9A] text-white'
              : 'bg-[#1C1C22] text-[#B8B8C2] hover:text-white border border-[#303039]'
          )}
        >
          Unread ({notifications.filter(n => !n.isRead).length})
        </button>
      </div>

      {/* Notifications List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-4 rounded-2xl bg-[#1C1C22] border border-[#303039] animate-pulse flex gap-3">
              <div className="w-10 h-10 rounded-full bg-[#303039]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-[#303039] rounded w-3/4" />
                <div className="h-3 bg-[#303039] rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center flex flex-col items-center justify-center p-6 rounded-3xl bg-[#151519] border border-[#303039]">
          <div className="w-16 h-16 rounded-2xl bg-[#1C1C22] border border-[#303039] flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-[#FF4F9A]" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No notifications yet</h3>
          <p className="text-xs text-[#B8B8C2] max-w-sm mb-6">
            When authentic people like your creations, follow your profile, or chat with you, you'll see genuine updates here.
          </p>
          <Link
            to="/create"
            className="px-5 py-2.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white text-xs font-semibold transition-colors shadow-lg shadow-[#FF4F9A]/20"
          >
            Create Your First Post
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(item => (
            <div
              key={item.id}
              onClick={() => !item.isRead && handleMarkSingleRead(item.id)}
              className={clsx(
                'group p-3.5 sm:p-4 rounded-2xl transition-all duration-200 border flex items-center gap-3.5',
                item.isRead
                  ? 'bg-[#151519] border-[#303039] opacity-80 hover:opacity-100'
                  : 'bg-[#1C1C22] border-[#FF4F9A]/40 shadow-sm'
              )}
            >
              {/* Actor Avatar with Icon Badge */}
              <div className="relative flex-shrink-0">
                <Link to={`/profile/${item.actor.username}`}>
                  {item.actor.avatarUrl ? (
                    <img
                      src={item.actor.avatarUrl}
                      alt={item.actor.displayName}
                      className="w-10 h-10 rounded-full object-cover border border-[#303039]"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#FF4F9A] text-white flex items-center justify-center font-bold text-xs">
                      {item.actor.displayName[0]?.toUpperCase()}
                    </div>
                  )}
                </Link>
                <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-[#0B0B0D] border border-[#303039]">
                  {getIcon(item.type)}
                </div>
              </div>

              {/* Content info */}
              <div className="flex-1 min-w-0">
                <div className="text-xs sm:text-sm text-white leading-snug">
                  <Link
                    to={`/profile/${item.actor.username}`}
                    className="font-bold text-white hover:text-[#FF4F9A] transition-colors"
                  >
                    {item.actor.displayName}
                  </Link>{' '}
                  <span className="text-[#B8B8C2]">{getMessageText(item)}</span>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-[#757582]">{formatTime(item.createdAt)}</span>
                  {!item.isRead && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF4F9A]" />
                  )}
                </div>
              </div>

              {/* Target Preview if post or community */}
              {item.post && (
                <Link
                  to={`/post/${item.post.id}`}
                  className="flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden border border-[#303039] bg-[#0B0B0D] hover:border-[#FF4F9A] transition-colors group/post"
                >
                  {item.post.imageUrl ? (
                    <img
                      src={item.post.imageUrl}
                      alt={item.post.title}
                      className="w-full h-full object-cover group-hover/post:scale-110 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full p-1 text-[9px] text-[#B8B8C2] flex items-center justify-center text-center">
                      Thought
                    </div>
                  )}
                </Link>
              )}

              {item.community && (
                <Link
                  to={`/communities/${item.community.slug}`}
                  className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-[#26262E] hover:bg-[#303039] text-[11px] text-[#FF8FBD] font-medium border border-[#303039] flex items-center gap-1 transition-colors"
                >
                  View <ExternalLink className="w-3 h-3" />
                </Link>
              )}

              {item.type === 'MESSAGE' && (
                <Link
                  to="/messages"
                  className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-[#FF4F9A] hover:bg-[#FF72AD] text-[11px] text-white font-medium transition-colors"
                >
                  Reply
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
