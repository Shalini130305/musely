import React, { useState, useEffect } from 'react';
import {
  X, Search, Send, Check, MessageSquare, Users, Loader2, ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '@/services/api';
import type { Conversation, Post } from '@/types';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface ChatShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: Post;
}

export function ChatShareModal({ isOpen, onClose, post }: ChatShareModalProps) {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sentConversationId, setSentConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedConversationId(null);
      setCustomMessage('');
      setSentConversationId(null);
      return;
    }

    const fetchConversations = async () => {
      try {
        setIsLoading(true);
        const { data } = await api.get('/messages/conversations');
        const list: Conversation[] = data.conversations || [];
        setConversations(list);
        setFilteredConversations(list);
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    };

    fetchConversations();
  }, [isOpen]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredConversations(conversations);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredConversations(
      conversations.filter(c => {
        const title = (c.isGroup ? c.title : c.otherUser?.displayName || c.otherUser?.username) || '';
        return title.toLowerCase().includes(q);
      })
    );
  }, [searchQuery, conversations]);

  if (!isOpen) return null;

  const handleShare = async () => {
    if (!selectedConversationId) {
      toast.error('Please select a conversation to share to');
      return;
    }

    try {
      setIsSending(true);
      await api.post('/messages/share-post', {
        conversationId: selectedConversationId,
        postId: post.id,
        message: customMessage.trim(),
      });

      setSentConversationId(selectedConversationId);
      toast.success('Shared directly to chat!');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSending(false);
    }
  };

  const handleGoToChat = () => {
    onClose();
    if (sentConversationId) {
      navigate(`/messages?conversationId=${sentConversationId}`);
    } else {
      navigate('/messages');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
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
            onClick={onClose}
            className="p-1.5 rounded-full text-[#B8B8C2] hover:text-white hover:bg-[#26262F] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Post Preview Strip */}
        <div className="my-4 p-3 rounded-2xl bg-[#141418] border border-[#2B2B36] flex items-center gap-3">
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

        {sentConversationId ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Post Sent Successfully!</h4>
              <p className="text-xs text-[#B8B8C2] mt-1">Your message and post preview are now in the chat thread.</p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-[#303039] text-xs font-semibold text-[#B8B8C2] hover:text-white hover:bg-[#26262F] transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleGoToChat}
                className="flex-1 py-2.5 rounded-xl bg-[#FF4F9A] text-white text-xs font-bold hover:bg-[#FF358B] transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF4F9A]/20"
              >
                <span>Open Chat</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Search conversations */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-[#757582] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#141418] border border-[#303039] text-xs text-white rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-[#FF4F9A] transition-colors"
              />
            </div>

            {/* Conversation list */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 mb-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-[#757582] text-xs gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#FF4F9A]" />
                  Loading conversations...
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="text-center py-6 text-xs text-[#757582]">
                  {searchQuery ? 'No matching conversations' : 'No active conversations yet'}
                </div>
              ) : (
                filteredConversations.map(conv => {
                  const title = conv.isGroup
                    ? conv.title || 'Group Chat'
                    : conv.otherUser?.displayName || conv.otherUser?.username || 'Chat';
                  const avatar = conv.isGroup ? conv.avatarUrl : conv.otherUser?.avatarUrl;
                  const isSelected = selectedConversationId === conv.id;

                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => setSelectedConversationId(conv.id)}
                      className={clsx(
                        'w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all',
                        isSelected
                          ? 'bg-[#FF4F9A]/15 border-[#FF4F9A] text-white'
                          : 'bg-[#141418]/60 border-[#2B2B36] hover:border-[#3E3E4B] text-[#B8B8C2]'
                      )}
                    >
                      {avatar ? (
                        <img src={avatar} alt={title} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#26262F] flex items-center justify-center font-bold text-xs text-[#FF4F9A] flex-shrink-0">
                          {conv.isGroup ? <Users className="w-4 h-4" /> : title[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={clsx('text-xs font-semibold truncate', isSelected ? 'text-white' : 'text-[#E4E4E7]')}>
                          {title}
                        </p>
                        <p className="text-[10px] text-[#757582] truncate">
                          {conv.isGroup ? 'Group Conversation' : `@${conv.otherUser?.username || 'user'}`}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-[#FF4F9A] text-white flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Custom message input */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Add a message (optional)..."
                value={customMessage}
                onChange={e => setCustomMessage(e.target.value)}
                maxLength={300}
                className="w-full bg-[#141418] border border-[#303039] text-xs text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#FF4F9A] transition-colors"
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-[#303039] text-xs font-semibold text-[#B8B8C2] hover:text-white hover:bg-[#26262F] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleShare}
                disabled={!selectedConversationId || isSending}
                className="flex-1 py-2.5 rounded-xl bg-[#FF4F9A] text-white text-xs font-bold hover:bg-[#FF358B] transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF4F9A]/20"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sharing...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send to Chat</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
