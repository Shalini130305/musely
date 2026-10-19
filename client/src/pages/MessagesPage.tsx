import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  MessageSquare,
  Send,
  Search,
  User,
  MoreVertical,
  ShieldAlert,
  UserX,
  ArrowLeft,
  Sparkles,
  Check,
  CheckCheck
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface OtherUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface LastMessage {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  isRead: boolean;
}

interface ConversationItem {
  id: string;
  updatedAt: string;
  otherUser: OtherUser;
  lastMessage: LastMessage | null;
  unreadCount: number;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  isRead: boolean;
  sender: OtherUser;
}

export default function MessagesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const directUserId = searchParams.get('userId');

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoadingConvs, setIsLoadingConvs] = useState(true);
  const [isLoadingMsgs, setIsLoadingMsgs] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatUsername, setNewChatUsername] = useState('');
  const [isStartingChat, setIsStartingChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch all conversations
  const fetchConversations = useCallback(async (selectFirst = false) => {
    try {
      const { data } = await api.get('/messages/conversations');
      const convList: ConversationItem[] = data.conversations || [];
      setConversations(convList);

      if (selectFirst && convList.length > 0 && !selectedConversation) {
        setSelectedConversation(convList[0]);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLoadingConvs(false);
    }
  }, [selectedConversation]);

  // Handle direct message initiation from profile URL (?userId=...)
  useEffect(() => {
    if (directUserId && user) {
      const initiateChat = async () => {
        try {
          const { data } = await api.post('/messages/conversations', { recipientId: directUserId });
          await fetchConversations();
          const targetConv: ConversationItem = {
            id: data.conversation.id,
            updatedAt: data.conversation.updatedAt,
            otherUser: data.conversation.otherUser,
            lastMessage: null,
            unreadCount: 0,
          };
          setSelectedConversation(targetConv);
          setShowMobileChat(true);
          // clear query param
          setSearchParams({});
        } catch (err) {
          toast.error(getErrorMessage(err));
        }
      };
      initiateChat();
    } else {
      fetchConversations(true);
    }
  }, [directUserId, user, fetchConversations, setSearchParams]);

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async (convId: string, markRead = true) => {
    try {
      const { data } = await api.get(`/messages/conversations/${convId}`);
      setMessages(data.messages || []);
      if (markRead) {
        await api.post(`/messages/conversations/${convId}/read`).catch(() => {});
        setConversations(prev =>
          prev.map(c => (c.id === convId ? { ...c, unreadCount: 0 } : c))
        );
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, []);

  // When selected conversation changes
  useEffect(() => {
    if (!selectedConversation) return;

    setIsLoadingMsgs(true);
    fetchMessages(selectedConversation.id, true).finally(() => {
      setIsLoadingMsgs(false);
      setTimeout(scrollToBottom, 100);
    });

    // Poll messages every 4 seconds for real-time delivery
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(() => {
      fetchMessages(selectedConversation.id, false);
    }, 4000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [selectedConversation, fetchMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation || !inputText.trim() || isSending) return;

    const content = inputText.trim();
    setInputText('');
    try {
      setIsSending(true);
      const { data } = await api.post('/messages/send', {
        conversationId: selectedConversation.id,
        content,
      });

      setMessages(prev => [...prev, data.message]);
      setConversations(prev =>
        prev.map(c =>
          c.id === selectedConversation.id
            ? {
                ...c,
                lastMessage: {
                  id: data.message.id,
                  content: data.message.content,
                  createdAt: data.message.createdAt,
                  senderId: data.message.senderId,
                  isRead: false,
                },
                updatedAt: data.message.createdAt,
              }
            : c
        )
      );
      setTimeout(scrollToBottom, 50);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSending(false);
    }
  };

  const handleStartNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatUsername.trim()) return;

    try {
      setIsStartingChat(true);
      // Search for user by username
      const searchRes = await api.get(`/search/users?q=${encodeURIComponent(newChatUsername.trim())}`);
      const found = searchRes.data.users?.[0];
      if (!found) {
        toast.error(`User @${newChatUsername.trim()} not found`);
        return;
      }
      if (found.id === user?.id) {
        toast.error('You cannot chat with yourself');
        return;
      }

      const { data } = await api.post('/messages/conversations', { recipientId: found.id });
      await fetchConversations();
      const targetConv: ConversationItem = {
        id: data.conversation.id,
        updatedAt: data.conversation.updatedAt,
        otherUser: data.conversation.otherUser,
        lastMessage: null,
        unreadCount: 0,
      };
      setSelectedConversation(targetConv);
      setShowMobileChat(true);
      setIsNewChatModalOpen(false);
      setNewChatUsername('');
      toast.success(`Conversation with ${found.displayName} ready`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsStartingChat(false);
    }
  };

  const handleBlockUser = async () => {
    if (!selectedConversation) return;
    const other = selectedConversation.otherUser;
    if (!window.confirm(`Are you sure you want to block ${other.displayName}? They won't be able to message you.`)) return;

    try {
      await api.post(`/moderation/block/${other.id}`);
      toast.success(`Blocked @${other.username}`);
      setSelectedConversation(null);
      fetchConversations();
      setShowMenu(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleReportUser = async () => {
    if (!selectedConversation) return;
    const reason = window.prompt('Please provide a reason for reporting this user (e.g., spam, harassment, inappropriate content):');
    if (!reason) return;

    try {
      await api.post('/moderation/report', {
        targetUserId: selectedConversation.otherUser.id,
        reason: 'Harassment / Inappropriate Messages',
        details: reason,
      });
      toast.success('Report submitted to moderation team');
      setShowMenu(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const filteredConversations = conversations.filter(c =>
    c.otherUser.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.otherUser.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 py-4 h-[calc(100vh-5rem)] flex flex-col">
      {/* Container Card */}
      <div className="flex-1 rounded-3xl bg-[#151519] border border-[#303039] overflow-hidden flex shadow-2xl relative">
        {/* Left column: Conversations list */}
        <div
          className={clsx(
            'w-full md:w-80 lg:w-96 border-r border-[#303039] flex flex-col bg-[#0B0B0D]/60',
            showMobileChat ? 'hidden md:flex' : 'flex'
          )}
        >
          {/* Header */}
          <div className="p-4 border-b border-[#303039] flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#FF4F9A]" />
              Messages
            </h2>
            <button
              onClick={() => setIsNewChatModalOpen(true)}
              className="text-xs px-3 py-1.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white font-semibold transition-colors shadow-sm"
            >
              + New Chat
            </button>
          </div>

          {/* Search bar */}
          <div className="p-3 border-b border-[#303039]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#757582]" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#1C1C22] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none"
              />
            </div>
          </div>

          {/* Conversations list */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#303039]/40">
            {isLoadingConvs ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-3 animate-pulse items-center">
                    <div className="w-10 h-10 rounded-full bg-[#303039]" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-[#303039] rounded w-2/3" />
                      <div className="h-2.5 bg-[#303039] rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#B8B8C2]">
                <p className="font-semibold text-white mb-1">No chats yet</p>
                <p>Start a conversation with an authentic Indian creator or friend.</p>
              </div>
            ) : (
              filteredConversations.map(conv => {
                const isSelected = selectedConversation?.id === conv.id;
                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      setSelectedConversation(conv);
                      setShowMobileChat(true);
                    }}
                    className={clsx(
                      'p-3.5 flex items-center gap-3 cursor-pointer transition-colors select-none',
                      isSelected ? 'bg-[#1C1C22] border-l-4 border-l-[#FF4F9A]' : 'hover:bg-[#1C1C22]/60'
                    )}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {conv.otherUser.avatarUrl ? (
                        <img
                          src={conv.otherUser.avatarUrl}
                          alt={conv.otherUser.displayName}
                          className="w-11 h-11 rounded-full object-cover border border-[#303039]"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-[#FF4F9A] text-white flex items-center justify-center font-bold text-sm">
                          {conv.otherUser.displayName[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-semibold text-white truncate">
                          {conv.otherUser.displayName}
                        </span>
                        <span className="text-[10px] text-[#757582] flex-shrink-0 ml-1">
                          {formatTime(conv.lastMessage?.createdAt || conv.updatedAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-[#B8B8C2] truncate">
                          {conv.lastMessage?.content || 'No messages yet'}
                        </p>
                        {conv.unreadCount > 0 && (
                          <span className="ml-2 px-1.5 py-0.2 rounded-full bg-[#FF4F9A] text-white text-[10px] font-bold">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right column: Active Chat Conversation */}
        <div
          className={clsx(
            'flex-1 flex flex-col bg-[#0B0B0D]',
            showMobileChat ? 'flex' : 'hidden md:flex'
          )}
        >
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-3.5 border-b border-[#303039] bg-[#151519] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowMobileChat(false)}
                    className="md:hidden p-1 rounded-lg text-[#B8B8C2] hover:text-white"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>

                  <Link to={`/profile/${selectedConversation.otherUser.username}`} className="flex items-center gap-2.5 group">
                    {selectedConversation.otherUser.avatarUrl ? (
                      <img
                        src={selectedConversation.otherUser.avatarUrl}
                        alt={selectedConversation.otherUser.displayName}
                        className="w-9 h-9 rounded-full object-cover border border-[#303039]"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-[#FF4F9A] text-white flex items-center justify-center font-bold text-xs">
                        {selectedConversation.otherUser.displayName[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-[#FF4F9A] transition-colors leading-tight">
                        {selectedConversation.otherUser.displayName}
                      </h3>
                      <p className="text-[10px] text-[#B8B8C2]">
                        @{selectedConversation.otherUser.username}
                      </p>
                    </div>
                  </Link>
                </div>

                {/* Actions / Safety Menu */}
                <div className="relative">
                  <button
                    onClick={() => setShowMenu(p => !p)}
                    className="p-1.5 rounded-lg text-[#B8B8C2] hover:text-white hover:bg-[#1C1C22] transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {showMenu && (
                    <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl bg-[#1C1C22] border border-[#303039] shadow-xl py-1 z-30 animate-scale-in">
                      <Link
                        to={`/profile/${selectedConversation.otherUser.username}`}
                        onClick={() => setShowMenu(false)}
                        className="flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-[#26262E] transition-colors"
                      >
                        <User className="w-3.5 h-3.5 text-[#FF4F9A]" /> View Profile
                      </Link>
                      <button
                        onClick={handleReportUser}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-400 hover:bg-[#26262E] transition-colors text-left"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" /> Report User
                      </button>
                      <button
                        onClick={handleBlockUser}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-[#26262E] transition-colors text-left border-t border-[#303039]"
                      >
                        <UserX className="w-3.5 h-3.5" /> Block User
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Messages Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isLoadingMsgs ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-xs text-[#B8B8C2] animate-pulse">Loading message history...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6">
                    <div className="w-12 h-12 rounded-full bg-[#1C1C22] border border-[#303039] flex items-center justify-center text-[#FF4F9A] mb-3">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-white mb-1">
                      Say hello to {selectedConversation.otherUser.displayName}!
                    </p>
                    <p className="text-xs text-[#B8B8C2] max-w-xs">
                      Send a polite message to start a conversation about shared creative interests or projects.
                    </p>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMe = msg.senderId === user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={clsx(
                          'flex flex-col max-w-[80%] sm:max-w-[70%]',
                          isMe ? 'ml-auto items-end' : 'mr-auto items-start'
                        )}
                      >
                        <div
                          className={clsx(
                            'px-4 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed break-words shadow-sm',
                            isMe
                              ? 'bg-[#FF4F9A] text-white rounded-br-sm'
                              : 'bg-[#1C1C22] text-white border border-[#303039] rounded-bl-sm'
                          )}
                        >
                          {msg.content}
                        </div>
                        <div className="flex items-center gap-1 mt-1 px-1">
                          <span className="text-[10px] text-[#757582]">
                            {formatTime(msg.createdAt)}
                          </span>
                          {isMe && (
                            msg.isRead ? (
                              <CheckCheck className="w-3 h-3 text-[#FF4F9A]" />
                            ) : (
                              <Check className="w-3 h-3 text-[#757582]" />
                            )
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Text Input Bar */}
              <form onSubmit={handleSendMessage} className="p-3 bg-[#151519] border-t border-[#303039] flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type a text message..."
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  maxLength={1000}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[#0B0B0D] text-xs sm:text-sm text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || isSending}
                  className="p-2.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center shadow-lg shadow-[#FF4F9A]/20"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-3xl bg-[#1C1C22] border border-[#303039] flex items-center justify-center text-[#FF4F9A] mb-4">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Private Text Messaging</h3>
              <p className="text-xs text-[#B8B8C2] max-w-sm mb-6">
                Connect with authentic creators, artists, and friends directly on MUSELY. Select an ongoing conversation or start a new one.
              </p>
              <button
                onClick={() => setIsNewChatModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white text-xs font-semibold transition-colors shadow-lg shadow-[#FF4F9A]/20"
              >
                Start New Conversation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      {isNewChatModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Start New Chat</h3>
            <p className="text-xs text-[#B8B8C2] mb-4">
              Enter the exact username of the person you want to message.
            </p>

            <form onSubmit={handleStartNewChat}>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-[#B8B8C2] mb-1.5">
                  MUSELY Username
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#FF4F9A] font-bold">@</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. shalini, aravind, priya"
                    value={newChatUsername}
                    onChange={e => setNewChatUsername(e.target.value.replace(/^@/, ''))}
                    className="w-full pl-7 pr-3 py-2 rounded-xl bg-[#0B0B0D] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsNewChatModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#26262E] text-xs text-[#B8B8C2] hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newChatUsername.trim() || isStartingChat}
                  className="px-5 py-2 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-xs text-white font-semibold transition-colors disabled:opacity-50"
                >
                  {isStartingChat ? 'Connecting...' : 'Start Chat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
