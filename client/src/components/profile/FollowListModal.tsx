import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { X, Search, Check, UserPlus, UserMinus, ShieldAlert, BadgeCheck } from 'lucide-react';
import api, { getErrorMessage } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import type { FollowUserItem } from '@/types';

interface FollowListModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'followers' | 'following';
  username: string;
  totalCount: number;
  onCountChange?: (delta: number) => void;
}

export function FollowListModal({
  isOpen,
  onClose,
  type,
  username,
  totalCount,
  onCountChange,
}: FollowListModalProps) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<FollowUserItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [count, setCount] = useState(totalCount);

  // Unfollow confirmation modal state
  const [confirmTarget, setConfirmTarget] = useState<FollowUserItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!isOpen) return;
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      params.append('limit', '50');

      const endpoint =
        username === currentUser?.username
          ? `/users/me/${type}`
          : `/users/${username}/${type}`;

      const { data } = await api.get(`${endpoint}?${params.toString()}`);
      setUsers(data.users || []);
      if (!search.trim() && typeof data.total === 'number') {
        setCount(data.total);
      }
    } catch (err: any) {
      if (err?.response?.data?.isPrivate) {
        toast.error(err.response.data.message || 'This account is private');
      } else {
        toast.error(getErrorMessage(err));
      }
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, type, username, currentUser?.username, search]);

  useEffect(() => {
    if (isOpen) {
      setCount(totalCount);
      fetchUsers();
    } else {
      setUsers([]);
      setSearch('');
      setConfirmTarget(null);
    }
  }, [isOpen, totalCount, fetchUsers]);

  const handleFollowToggle = async (target: FollowUserItem) => {
    if (!currentUser) {
      toast.error('Please sign in to follow creators');
      return;
    }

    // If currently following, ask for confirmation before unfollowing
    if (target.isFollowing) {
      setConfirmTarget(target);
      return;
    }

    try {
      setIsProcessing(true);
      const { data } = await api.post(`/users/${target.username}/follow`);
      setUsers((prev) =>
        prev.map((u) => (u.id === target.id ? { ...u, isFollowing: true } : u))
      );

      if (data.requestPending) {
        toast.success(`Follow request sent to @${target.username}`);
      } else {
        toast.success(`Following @${target.username}`);
      }

      // If we are looking at our own 'following' list, count increases
      if (type === 'following' && username === currentUser.username) {
        setCount((prev) => prev + 1);
        onCountChange?.(1);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmUnfollow = async () => {
    if (!confirmTarget) return;
    try {
      setIsProcessing(true);
      await api.post(`/users/${confirmTarget.username}/follow`);
      setUsers((prev) =>
        prev.map((u) => (u.id === confirmTarget.id ? { ...u, isFollowing: false } : u))
      );
      toast.success(`Unfollowed @${confirmTarget.username}`);

      // If viewing our own following list, decrement
      if (type === 'following' && username === currentUser?.username) {
        setCount((prev) => Math.max(0, prev - 1));
        onCountChange?.(-1);
      }
      setConfirmTarget(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-[#141418] border border-[#303039] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#303039]">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold font-display text-white capitalize">
              {type === 'followers' ? 'Followers' : 'Following'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-[#1C1C22] border border-[#303039] text-xs font-semibold text-[#FF4F9A]">
              {count}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#B8B8C2] hover:text-white hover:bg-[#1C1C22] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-[#303039]/60">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#757582] w-4 h-4" />
            <input
              type="text"
              placeholder={`Search ${type}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-[#1C1C22] text-white placeholder-[#757582] border border-[#303039] focus:outline-none focus:border-[#FF4F9A]"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#303039]/40 p-2 scrollbar-none">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-7 h-7 border-3 border-[#FF4F9A] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-[#757582]">Loading {type}...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-xs text-[#757582]">
              {search.trim() ? 'No users matching your search.' : `No ${type} yet.`}
            </div>
          ) : (
            users.map((targetUser) => {
              const isSelf = currentUser?.id === targetUser.id;
              return (
                <div
                  key={targetUser.id}
                  className="flex items-center justify-between p-3 rounded-2xl hover:bg-[#1C1C22]/60 transition-colors gap-3"
                >
                  <Link
                    to={`/profile/${targetUser.username}`}
                    onClick={onClose}
                    className="flex items-center gap-3 min-w-0 flex-1 group"
                  >
                    {targetUser.avatarUrl ? (
                      <img
                        src={targetUser.avatarUrl}
                        alt={targetUser.displayName}
                        className="w-10 h-10 rounded-full object-cover border border-[#303039] flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#FF4F9A] text-white font-bold text-sm flex items-center justify-center flex-shrink-0">
                        {targetUser.displayName[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-white group-hover:text-[#FF4F9A] transition-colors truncate">
                          {targetUser.displayName}
                        </span>
                        {targetUser.isVerified && (
                          <BadgeCheck className="w-3.5 h-3.5 text-[#FF4F9A] flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-[#757582] truncate">@{targetUser.username}</p>
                    </div>
                  </Link>

                  {!isSelf && currentUser && (
                    <button
                      onClick={() => handleFollowToggle(targetUser)}
                      disabled={isProcessing}
                      className={clsx(
                        'px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 flex-shrink-0 shadow-sm',
                        targetUser.isFollowing
                          ? 'bg-[#1C1C22] text-[#B8B8C2] hover:text-rose-400 hover:border-rose-500/40 border border-[#303039]'
                          : 'bg-[#FF4F9A] hover:bg-[#FF72AD] text-white shadow-pink-glow'
                      )}
                    >
                      {targetUser.isFollowing ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Following
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          Follow
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Unfollow Confirmation Dialog */}
      {confirmTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-[#1A1A20] border border-[#303039] p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <UserMinus className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white mb-1">
                Unfollow @{confirmTarget.username}?
              </h3>
              <p className="text-xs text-[#B8B8C2] leading-relaxed">
                You will no longer see their posts in your home feed. You can follow them back anytime.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setConfirmTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#26262E] hover:bg-[#303039] text-white text-xs font-semibold transition-colors border border-[#303039]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUnfollow}
                disabled={isProcessing}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition-colors shadow-lg shadow-rose-500/20"
              >
                {isProcessing ? 'Unfollowing...' : 'Unfollow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
