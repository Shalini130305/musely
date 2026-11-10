import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell, Heart, MessageSquare, UserPlus, Users, CheckCheck,
  ExternalLink, Sparkles, Trash2, ShieldAlert, Settings,
  RotateCcw, ShieldCheck, Mail
} from 'lucide-react';
import api, { getErrorMessage } from '@/services/api';
import { presenceClient } from '@/services/presence';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export interface NotificationItem {
  id: string;
  type: string;
  read: boolean;
  isRead: boolean;
  createdAt: string;
  data?: any;
  actor: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
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

type FilterKey = 'all' | 'unread' | 'likes' | 'comments' | 'messages' | 'follows' | 'security';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/notifications?limit=50');
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Real-time notification updates
    const unsubNewNotif = presenceClient.on('newNotification', (data) => {
      if (data?.notification) {
        setNotifications((prev) => [data.notification, ...prev.filter(n => n.id !== data.notification.id)]);
      }
      if (typeof data?.unreadCount === 'number') {
        setUnreadCount(data.unreadCount);
      }
    });

    const unsubCount = presenceClient.on('notificationCount', (data) => {
      if (typeof data?.unreadCount === 'number') {
        setUnreadCount(data.unreadCount);
      }
    });

    return () => {
      unsubNewNotif();
      unsubCount();
    };
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map(n => ({ ...n, read: true, isRead: true })));
      setUnreadCount(0);
      toast.success('All marked as read');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleMarkSingleRead = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map(n => (n.id === id ? { ...n, read: true, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // quiet
    }
  };

  const handleDeleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter(n => n.id !== id));
      toast.success('Notification removed');
    } catch {
      toast.error('Failed to remove notification');
    }
  };

  const getIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'like':
        return <Heart className="w-4 h-4 text-[#FF4F9A] fill-current" />;
      case 'comment':
      case 'comment_reply':
        return <MessageSquare className="w-4 h-4 text-sky-400" />;
      case 'follow':
      case 'follow_request':
        return <UserPlus className="w-4 h-4 text-emerald-400" />;
      case 'message':
      case 'reaction':
        return <MessageSquare className="w-4 h-4 text-indigo-400" />;
      case 'security_alert':
        return <ShieldAlert className="w-4 h-4 text-amber-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-[#FF8FBD]" />;
    }
  };

  const getMessageText = (n: NotificationItem) => {
    switch (n.type?.toLowerCase()) {
      case 'like':
        return 'liked your post';
      case 'comment':
        return n.data?.commentSnippet ? `commented: "${n.data.commentSnippet}"` : 'commented on your post';
      case 'comment_reply':
        return 'replied to your comment';
      case 'follow':
        return 'started following you';
      case 'follow_request':
        return 'requested to follow your account';
      case 'message':
        return n.data?.preview ? `sent you a message: "${n.data.preview}"` : 'sent you a private message';
      case 'reaction':
        return `reacted ${n.data?.emoji || '❤️'} to your message`;
      case 'mention':
        return n.data?.preview ? `mentioned you: "${n.data.preview}"` : 'mentioned you in a post or comment';
      case 'marketplace':
        return n.data?.message || 'enquired about your marketplace item';
      case 'security_alert':
        return n.data?.message || 'Important security update for your account';
      case 'community':
        return `interacted with ${n.community?.name || 'your community'}`;
      default:
        return 'interacted with your profile';
    }
  };

  const getTargetUrl = (n: NotificationItem): string => {
    if (n.post) return `/post/${n.post.id}`;
    if (n.type === 'message' || n.type === 'reaction') return '/messages';
    if (n.type === 'security_alert' || n.type === 'follow_request') return '/settings';
    if (n.community) return `/communities/${n.community.slug}`;
    if (n.actor && n.actor.username !== 'musely') return `/profile/${n.actor.username}`;
    return '/notifications';
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

  // Filter items
  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === 'unread') return !n.read;
      if (filter === 'likes') return n.type === 'like';
      if (filter === 'comments') return n.type === 'comment' || n.type === 'comment_reply';
      if (filter === 'messages') return n.type === 'message' || n.type === 'reaction';
      if (filter === 'follows') return n.type === 'follow' || n.type === 'follow_request';
      if (filter === 'security') return n.type === 'security_alert';
      return true;
    });
  }, [notifications, filter]);

  // Group items by time (Today, This Week, Earlier)
  const groupedNotifications = useMemo(() => {
    const today: NotificationItem[] = [];
    const thisWeek: NotificationItem[] = [];
    const earlier: NotificationItem[] = [];

    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const oneWeekMs = 7 * oneDayMs;

    filtered.forEach((item) => {
      const itemTime = new Date(item.createdAt).getTime();
      const diff = now.getTime() - itemTime;

      if (diff < oneDayMs) {
        today.push(item);
      } else if (diff < oneWeekMs) {
        thisWeek.push(item);
      } else {
        earlier.push(item);
      }
    });

    return { today, thisWeek, earlier };
  }, [filtered]);

  const renderNotificationCard = (item: NotificationItem) => {
    const targetUrl = getTargetUrl(item);

    return (
      <div
        key={item.id}
        onClick={() => {
          if (!item.read) handleMarkSingleRead(item.id);
          navigate(targetUrl);
        }}
        className={clsx(
          'group relative p-4 rounded-2xl transition-all duration-200 border flex items-center gap-3.5 cursor-pointer',
          !item.read
            ? 'bg-[#1C1C23] border-[#FF4F9A]/40 shadow-sm hover:border-[#FF4F9A]'
            : 'bg-[#141418] border-[#303039]/70 opacity-90 hover:opacity-100 hover:border-[#FF4F9A]/30 hover:bg-[#1A1A20]'
        )}
      >
        {/* Unread indicator bar */}
        {!item.read && (
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-full bg-[#FF4F9A] shadow-pink-glow" />
        )}

        {/* Actor Avatar with Icon Badge */}
        <div className="relative flex-shrink-0 ml-1">
          <Link
            to={item.actor?.username !== 'musely' ? `/profile/${item.actor?.username}` : '#'}
            onClick={e => e.stopPropagation()}
          >
            {item.actor?.avatarUrl ? (
              <img
                src={item.actor.avatarUrl}
                alt={item.actor.displayName}
                className="w-11 h-11 rounded-full object-cover border border-[#303039]"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-[#FF4F9A] text-white flex items-center justify-center font-bold text-xs shadow-sm">
                {item.actor?.displayName?.[0]?.toUpperCase() || 'M'}
              </div>
            )}
          </Link>
          <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-[#0B0B0D] border border-[#303039]">
            {getIcon(item.type)}
          </div>
        </div>

        {/* Content info */}
        <div className="flex-1 min-w-0 pr-2">
          <div className="text-xs sm:text-sm text-white leading-snug">
            <Link
              to={item.actor?.username !== 'musely' ? `/profile/${item.actor?.username}` : '#'}
              onClick={e => e.stopPropagation()}
              className="font-bold text-white hover:text-[#FF4F9A] transition-colors"
            >
              {item.actor?.displayName}
            </Link>{' '}
            <span className="text-[#B8B8C2]">{getMessageText(item)}</span>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-[#757582]">{formatTime(item.createdAt)}</span>
            {!item.read && (
              <span className="text-[10px] font-bold text-[#FF4F9A] bg-[#FF4F9A]/10 px-1.5 py-0.2 rounded-full border border-[#FF4F9A]/20">
                New
              </span>
            )}
          </div>
        </div>

        {/* Target Preview or Action Button */}
        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {item.post && (
            <Link
              to={`/post/${item.post.id}`}
              className="w-12 h-12 rounded-xl overflow-hidden border border-[#303039] bg-[#0B0B0D] hover:border-[#FF4F9A] transition-colors group/post flex-shrink-0 shadow-sm"
            >
              {item.post.imageUrl ? (
                <img
                  src={item.post.imageUrl}
                  alt={item.post.title}
                  className="w-full h-full object-cover group-hover/post:scale-105 transition-transform"
                />
              ) : (
                <div className="w-full h-full p-1 text-[9px] text-[#B8B8C2] flex items-center justify-center text-center">
                  Thought
                </div>
              )}
            </Link>
          )}

          {item.type === 'message' && (
            <Link
              to="/messages"
              className="px-3 py-1.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-xs text-white font-semibold shadow-sm transition-colors"
            >
              Reply
            </Link>
          )}

          {item.type === 'follow' && item.actor?.username !== 'musely' && (
            <Link
              to={`/profile/${item.actor.username}`}
              className="px-3 py-1.5 rounded-xl bg-[#26262E] hover:bg-[#303039] text-xs text-[#FF8FBD] font-semibold border border-[#303039] transition-colors"
            >
              Profile
            </Link>
          )}

          {item.type === 'security_alert' && (
            <Link
              to="/settings"
              className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-xs text-amber-300 font-semibold border border-amber-500/30 transition-colors flex items-center gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Review
            </Link>
          )}

          {/* Delete Action Button */}
          <button
            onClick={(e) => handleDeleteNotification(item.id, e)}
            className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-[#757582] hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Delete notification"
            aria-label="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen py-8 max-w-3xl mx-auto px-4 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#303039]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-2.5">
            <Bell className="w-7 h-7 text-[#FF4F9A]" />
            Notifications
            {unreadCount > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#FF4F9A] text-white font-bold shadow-pink-glow">
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="text-xs text-[#B8B8C2] mt-1">
            Real-time activity on your genuine connections, thoughts, creations, and security updates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {notifications.some(n => !n.read) && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-[#FF8FBD] hover:text-white flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1C1C22] border border-[#303039] hover:bg-[#FF4F9A]/20 transition-all"
            >
              <CheckCheck className="w-4 h-4 text-[#FF4F9A]" />
              Mark all as read
            </button>
          )}

          <Link
            to="/settings"
            className="p-2 rounded-xl bg-[#1C1C22] border border-[#303039] text-[#B8B8C2] hover:text-white hover:border-[#FF4F9A]/40 transition-colors"
            title="Notification Settings"
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-2 custom-scrollbar">
        {[
          { key: 'all', label: `All (${notifications.length})` },
          { key: 'unread', label: `Unread (${unreadCount})` },
          { key: 'likes', label: 'Likes' },
          { key: 'comments', label: 'Comments' },
          { key: 'messages', label: 'Messages' },
          { key: 'follows', label: 'Follows' },
          { key: 'security', label: 'Security' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as FilterKey)}
            className={clsx(
              'px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0',
              filter === tab.key
                ? 'bg-[#FF4F9A] text-white shadow-pink-glow'
                : 'bg-[#1C1C22] text-[#B8B8C2] hover:text-white border border-[#303039]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-4 rounded-2xl bg-[#1C1C22] border border-[#303039] animate-pulse flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-full bg-[#2B2B36]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-[#2B2B36] rounded w-3/4" />
                <div className="h-3 bg-[#2B2B36] rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center flex flex-col items-center justify-center p-8 rounded-3xl bg-[#141418] border border-[#303039]">
          <div className="w-16 h-16 rounded-2xl bg-[#1C1C22] border border-[#303039] flex items-center justify-center mb-4 shadow-sm">
            <Sparkles className="w-8 h-8 text-[#FF4F9A]" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No notifications found</h3>
          <p className="text-xs text-[#B8B8C2] max-w-sm mb-6 leading-relaxed">
            {filter === 'unread'
              ? "You're all caught up! There are no unread notifications right now."
              : "When people like, comment, message, or follow your profile, your genuine updates appear here."}
          </p>
          <div className="flex items-center gap-3">
            {filter !== 'all' ? (
              <button
                onClick={() => setFilter('all')}
                className="px-4 py-2 rounded-xl bg-[#26262E] hover:bg-[#303039] text-xs font-semibold text-white border border-[#303039] transition-colors"
              >
                View all notifications
              </button>
            ) : (
              <Link
                to="/explore"
                className="px-5 py-2.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white text-xs font-semibold transition-colors shadow-pink-glow"
              >
                Discover Creators
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Today */}
          {groupedNotifications.today.length > 0 && (
            <div className="space-y-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#FF8FBD] px-1">Today</h2>
              {groupedNotifications.today.map(renderNotificationCard)}
            </div>
          )}

          {/* This Week */}
          {groupedNotifications.thisWeek.length > 0 && (
            <div className="space-y-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#B8B8C2] px-1">This Week</h2>
              {groupedNotifications.thisWeek.map(renderNotificationCard)}
            </div>
          )}

          {/* Earlier */}
          {groupedNotifications.earlier.length > 0 && (
            <div className="space-y-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#757582] px-1">Earlier</h2>
              {groupedNotifications.earlier.map(renderNotificationCard)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
