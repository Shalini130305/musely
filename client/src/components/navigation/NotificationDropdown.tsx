import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart, MessageSquare, UserPlus, ShieldAlert, Sparkles,
  CheckCheck, ExternalLink, ArrowRight, X
} from 'lucide-react';
import api from '@/services/api';
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

interface NotificationDropdownProps {
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  onClose: () => void;
  onMarkAllRead: () => void;
  onNotificationClick: (id: string, targetUrl: string) => void;
}

export function NotificationDropdown({
  notifications,
  unreadCount,
  isLoading,
  onClose,
  onMarkAllRead,
  onNotificationClick,
}: NotificationDropdownProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filtered = notifications.filter(n => (filter === 'unread' ? !n.read : true));

  const getIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'like':
        return <Heart className="w-3.5 h-3.5 text-[#FF4F9A] fill-current" />;
      case 'comment':
      case 'comment_reply':
        return <MessageSquare className="w-3.5 h-3.5 text-sky-400" />;
      case 'follow':
      case 'follow_request':
        return <UserPlus className="w-3.5 h-3.5 text-emerald-400" />;
      case 'message':
      case 'reaction':
        return <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />;
      case 'security_alert':
        return <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Sparkles className="w-3.5 h-3.5 text-[#FF8FBD]" />;
    }
  };

  const getNotificationText = (n: NotificationItem) => {
    switch (n.type?.toLowerCase()) {
      case 'like':
        return 'liked your post';
      case 'comment':
        return 'commented on your post';
      case 'comment_reply':
        return 'replied to your comment';
      case 'follow':
        return 'started following you';
      case 'follow_request':
        return 'requested to follow you';
      case 'message':
        return n.data?.preview ? `"${n.data.preview}"` : 'sent you a message';
      case 'reaction':
        return `reacted ${n.data?.emoji || '❤️'} to your message`;
      case 'mention':
        return 'mentioned you';
      case 'marketplace':
        return 'sent an enquiry about your item';
      case 'security_alert':
        return n.data?.message || 'Important security update';
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

  const formatShortTime = (isoString: string) => {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return `${Math.floor(diffDays / 7)}w`;
  };

  const handleItemClick = (n: NotificationItem) => {
    const targetUrl = getTargetUrl(n);
    onNotificationClick(n.id, targetUrl);
    onClose();
    navigate(targetUrl);
  };

  return (
    <div
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-h-[85vh] bg-[#16161C]/98 backdrop-blur-xl border border-[#303039] rounded-3xl shadow-2xl z-50 flex flex-col overflow-hidden animate-scale-in"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="p-4 pb-3 border-b border-[#303039]/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-bold text-white text-base">Notifications</h3>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-[#FF4F9A] text-white text-[10px] font-bold shadow-pink-glow">
              {unreadCount} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="text-[11px] font-medium text-[#FF8FBD] hover:text-[#FF4F9A] transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[#202028]"
              title="Mark all as read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#757582] hover:text-white hover:bg-[#202028] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-4 py-2 border-b border-[#303039]/40 bg-[#121217]/60">
        <button
          onClick={() => setFilter('all')}
          className={clsx(
            'px-3 py-1 rounded-full text-xs font-semibold transition-all',
            filter === 'all'
              ? 'bg-[#FF4F9A] text-white shadow-sm'
              : 'text-[#B8B8C2] hover:text-white hover:bg-[#202028]'
          )}
        >
          All
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={clsx(
            'px-3 py-1 rounded-full text-xs font-semibold transition-all',
            filter === 'unread'
              ? 'bg-[#FF4F9A] text-white shadow-sm'
              : 'text-[#B8B8C2] hover:text-white hover:bg-[#202028]'
          )}
        >
          Unread {unreadCount > 0 && `(${unreadCount})`}
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#303039]/30 custom-scrollbar max-h-96">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-[#26262E]" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-[#26262E] rounded w-3/4" />
                  <div className="h-2.5 bg-[#26262E] rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 px-6 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-[#202028] border border-[#303039] flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6 text-[#FF4F9A]" />
            </div>
            <p className="text-sm font-semibold text-white">No {filter === 'unread' ? 'unread ' : ''}notifications</p>
            <p className="text-xs text-[#B8B8C2] mt-1 max-w-xs">
              When people like your creations, message you, or follow your profile, you'll see them here.
            </p>
          </div>
        ) : (
          filtered.slice(0, 15).map((n) => (
            <div
              key={n.id}
              onClick={() => handleItemClick(n)}
              className={clsx(
                'group p-3.5 flex items-center gap-3 transition-colors cursor-pointer select-none',
                !n.read
                  ? 'bg-[#1F1F27]/80 hover:bg-[#262631]'
                  : 'hover:bg-[#1C1C24]'
              )}
            >
              {/* Avatar + Sub-icon */}
              <div className="relative flex-shrink-0">
                {n.actor?.avatarUrl ? (
                  <img
                    src={n.actor.avatarUrl}
                    alt={n.actor.displayName}
                    className="w-10 h-10 rounded-full object-cover border border-[#303039]"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#FF4F9A] text-white flex items-center justify-center font-bold text-xs">
                    {n.actor?.displayName?.[0]?.toUpperCase() || 'M'}
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-[#0B0B0D] border border-[#303039]">
                  {getIcon(n.type)}
                </div>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0 pr-1">
                <p className="text-xs text-white leading-snug line-clamp-2">
                  <span className="font-bold text-white hover:text-[#FF4F9A] transition-colors">
                    {n.actor?.displayName}
                  </span>{' '}
                  <span className="text-[#B8B8C2]">{getNotificationText(n)}</span>
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-[#757582]">{formatShortTime(n.createdAt)}</span>
                  {!n.read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF4F9A] ring-2 ring-[#FF4F9A]/20" />
                  )}
                </div>
              </div>

              {/* Right Action / Target Preview */}
              {n.post ? (
                <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden border border-[#303039] bg-[#0B0B0D]">
                  {n.post.imageUrl ? (
                    <img src={n.post.imageUrl} alt={n.post.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full text-[8px] text-[#757582] flex items-center justify-center text-center p-0.5">
                      Thought
                    </div>
                  )}
                </div>
              ) : n.type === 'message' ? (
                <span className="flex-shrink-0 px-2 py-1 rounded-lg bg-[#FF4F9A]/20 hover:bg-[#FF4F9A]/30 text-[10px] text-[#FF8FBD] font-medium border border-[#FF4F9A]/30 transition-colors">
                  Reply
                </span>
              ) : null}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-2.5 border-t border-[#303039]/80 bg-[#121217]/90 text-center">
        <Link
          to="/notifications"
          onClick={onClose}
          className="text-xs text-[#FF8FBD] hover:text-[#FF4F9A] font-medium flex items-center justify-center gap-1.5 py-1 transition-colors"
        >
          <span>View all notifications</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
