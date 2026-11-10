import React, { useState, useEffect } from 'react';
import {
  X, Search, Send, Check, MessageSquare, Users, User, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '@/services/api';
import type { Conversation, Post, FollowUserItem } from '@/types';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface ChatShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: Post;
}

interface ShareTarget {
  id: string; // conversation ID or user ID
  type: 'conversation' | 'user';
  name: string;
  subtitle: string;
  avatarUrl?: string | null;
  isGroup?: boolean;
}

export function ChatShareModal({ isOpen, onClose, post }: ChatShareModalProps) {
  const navigate = useNavigate();
  const [targets, setTargets] = useState<ShareTarget[]>([]);
  const [filteredTargets, setFilteredTargets] = useState<ShareTarget[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<ShareTarget | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSelectedTarget(null);
      setCustomMessage('');
      setSearchQuery('');
      setIsSending(false);
      return;
    }

    const fetchData = async () => {
      try {
        setIsLoading(true);

        const [convRes, followRes] = await Promise.allSettled([
          api.get('/messages/conversations'),
          api.get('/users/me/following?limit=50'),
        ]);

        const items: ShareTarget[] = [];
        const seenUserIds = new Set<string>();

        // 1. Existing conversations
        if (convRes.status === 'fulfilled' && convRes.value.data?.conversations) {
          const list: Conversation[] = convRes.value.data.conversations;
          list.forEach(c => {
            const name = c.isGroup
              ? c.title || 'Group Chat'
              : c.otherUser?.displayName || c.otherUser?.username || 'Chat';
            const subtitle = c.isGroup ? 'Group Conversation' : `@${c.otherUser?.username || 'user'}`;
            const avatarUrl = c.isGroup ? c.avatarUrl : c.otherUser?.avatarUrl;

            if (!c.isGroup && c.otherUser?.id) {
              seenUserIds.add(c.otherUser.id);
            }

            items.push({
              id: c.id,
              type: 'conversation',
              name,
              subtitle,
              avatarUrl,
              isGroup: c.isGroup,
            });
          });
        }

        // 2. Friends / Followed users who might not have an active chat yet
        if (followRes.status === 'fulfilled' && followRes.value.data?.users) {
          const followList: FollowUserItem[] = followRes.value.data.users;
          followList.forEach(u => {
            if (!seenUserIds.has(u.id)) {
              items.push({
                id: u.id,
                type: 'user',
                name: u.displayName || u.username,
                subtitle: `@${u.username}`,
                avatarUrl: u.avatarUrl,
                isGroup: false,
              });
            }
          });
        }

        setTargets(items);
        setFilteredTargets(items);
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [isOpen]);

  // Live search filtering
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTargets(targets);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredTargets(
      targets.filter(
        t => t.name.toLowerCase().includes(q) || t.subtitle.toLowerCase().includes(q)
      )
    );
  }, [searchQuery, targets]);

  if (!isOpen) return null;

  const handleShare = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!selectedTarget) {
      toast.error('Please select a friend or conversation to share with');
      return;
    }

    if (isSending) return;

    try {
      setIsSending(true);

      const payload: {
        postId: string;
        message: string;
        conversationId?: string;
        recipientId?: string;
      } = {
        postId: post.id,
        message: customMessage.trim(),
      };

      if (selectedTarget.type === 'conversation') {
        payload.conversationId = selectedTarget.id;
      } else {
        payload.recipientId = selectedTarget.id;
      }

      const { data } = await api.post('/messages/share-post', payload);

      const resolvedConvId =
        data.conversationId ||
        data.message?.conversationId ||
        (selectedTarget.type === 'conversation' ? selectedTarget.id : null);

      toast.success('Shared directly to chat!');
      onClose();

      if (resolvedConvId) {
        navigate(`/messages?conversationId=${resolvedConvId}`);
      } else {
        navigate('/messages');
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#1C1C22] border border-[#303039] rounded-3xl p-5 sm:p-6 shadow-2xl relative text-white"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#303039]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-[#FF4F9A]/15 text-[#FF4F9A] border border-[#FF4F9A]/30">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Share to Chat</h3>
              <p className="text-xs text-[#B8B8C2]">Send this post into a MUSELY conversation</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-[#B8B8C2] hover:text-white hover:bg-[#26262F] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Post Preview Strip */}
        <div className="my-3.5 p-2.5 rounded-2xl bg-[#141418] border border-[#2B2B36] flex items-center gap-3">
          {post.imageUrl ? (
            <img
              src={post.imageUrl}
              alt={post.title}
              className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-[#303039]"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-[#26262F] flex items-center justify-center flex-shrink-0 text-xs font-bold text-[#FF4F9A]">
              Post
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-semibold text-white truncate">{post.title}</h4>
            <p className="text-[11px] text-[#757582] truncate">by @{post.author.username}</p>
          </div>
        </div>

        {/* Share Form */}
        <form onSubmit={handleShare}>
          {/* Search bar */}
          <div className="relative mb-2.5">
            <Search className="w-4 h-4 text-[#757582] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search friends or chats..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#141418] border border-[#303039] text-xs text-white rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-[#FF4F9A] transition-colors"
            />
          </div>

          {/* Targets List */}
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 mb-3.5">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-[#757582] text-xs gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#FF4F9A]" />
                Loading conversations & friends...
              </div>
            ) : filteredTargets.length === 0 ? (
              <div className="text-center py-6 text-xs text-[#757582]">
                {searchQuery ? 'No matching friends or chats found' : 'No conversations or friends found'}
              </div>
            ) : (
              filteredTargets.map(target => {
                const isSelected = selectedTarget?.id === target.id;

                return (
                  <button
                    key={`${target.type}-${target.id}`}
                    type="button"
                    onClick={() => setSelectedTarget(target)}
                    className={clsx(
                      'w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all',
                      isSelected
                        ? 'bg-[#FF4F9A]/15 border-[#FF4F9A] text-white shadow-sm'
                        : 'bg-[#141418]/60 border-[#2B2B36] hover:border-[#3E3E4B] text-[#B8B8C2]'
                    )}
                  >
                    {target.avatarUrl ? (
                      <img
                        src={target.avatarUrl}
                        alt={target.name}
                        className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-[#303039]"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-[#26262F] flex items-center justify-center font-bold text-xs text-[#FF4F9A] flex-shrink-0">
                        {target.isGroup ? <Users className="w-4 h-4" /> : <User className="w-4 h-4" />}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={clsx('text-xs font-semibold truncate', isSelected ? 'text-white' : 'text-[#E4E4E7]')}>
                        {target.name}
                      </p>
                      <p className="text-[10px] text-[#757582] truncate">{target.subtitle}</p>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-[#FF4F9A] text-white flex items-center justify-center flex-shrink-0 shadow-md">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Optional Message input */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Add thoughts or message (optional)..."
              value={customMessage}
              onChange={e => setCustomMessage(e.target.value)}
              maxLength={300}
              className="w-full bg-[#141418] border border-[#303039] text-xs text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#FF4F9A] transition-colors"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2.5 rounded-xl border border-[#303039] text-xs font-semibold text-[#B8B8C2] hover:text-white hover:bg-[#26262F] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedTarget || isSending}
              className="flex-1 py-2.5 rounded-xl bg-[#FF4F9A] text-white text-xs font-bold hover:bg-[#FF358B] transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF4F9A]/20"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending to Chat...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send to Chat</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
