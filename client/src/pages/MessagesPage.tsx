import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  MessageSquare, Send, Search, User, MoreVertical, ShieldAlert, UserX,
  ArrowLeft, Sparkles, Check, CheckCheck, Smile, X, Reply,
  Forward, Pencil, Trash2, Copy, Users, Plus, Pin, BellOff, Archive,
  MailOpen, FileText, Lock, Info, CornerDownLeft, Loader2,
  Paperclip, Image as ImageIcon, Film, Music, Mic, Play, Pause,
  Download, CheckSquare, Square
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import api, { getErrorMessage } from "@/services/api";
import toast from "react-hot-toast";
import clsx from "clsx";
import type { Message, Conversation, MessageReaction, MessageAttachment } from "@/types";
import { downloadFile } from "@/utils/downloadHelper";
import { presenceClient } from "@/services/presence";

const EMOJI_GROUPS = [
  { label: "Smileys", emojis: ["😀","😂","🥹","😍","🥰","😎","🤩","😅","😭","😤","🤔","😏","😒","🙃","😌","😔","🥺","😢","😠","🤯","😱","😴","🤤","🥳"] },
  { label: "Hearts", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","💔","💞","💕","💓","💗","💖","💝","💟","❣️","💘"] },
  { label: "Hands", emojis: ["👍","👎","👏","🙌","🤝","🫶","✊","👋","🤙","💪","☝️","👌","✌️","🤞","👈","👉","👆","👇"] },
  { label: "Nature", emojis: ["🌸","🌺","🌻","🌹","🌷","🌼","💐","🍀","🍁","🍃","🌿","🌱","🌊","🔥","⭐","🌟","💫","✨"] },
  { label: "Food", emojis: ["🍕","🍔","🌮","🍜","🍣","🍰","🎂","🧁","🍩","🍫","🍭","🥤","☕","🧋","🍵","🥂","🍾"] },
  { label: "Symbols", emojis: ["💯","🔥","✅","❌","⚡","💥","🎉","🎊","🏆","🎯","💎","👑","🔑","🚀","🌈","🎵","🎶","📸","💻","📱","🔔"] },
];

const formatTime = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
};

const formatMsgTime = (iso?: string | null) => {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const getRelativeLastSeen = (iso?: string | null) => {
  if (!iso) return "last seen a while ago";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "online";
  if (mins < 60) return `last seen ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `last seen ${hrs}h ago`;
  return `last seen ${Math.floor(hrs / 24)}d ago`;
};

const isOnline = (iso?: string | null) => {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 2 * 60 * 1000;
};

const getConvName = (conv: Conversation, _myId?: string) => {
  if (conv.isGroup) return conv.title || "Group";
  return conv.otherUser?.displayName || conv.displayName || "Unknown";
};

const getConvAvatar = (conv: Conversation) => {
  if (conv.isGroup) return conv.avatarUrl;
  return conv.otherUser?.avatarUrl || conv.avatarUrl;
};

const formatFileSize = (bytes?: number) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface AvatarProps {
  url?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
  online?: boolean;
}

function Avatar({ url, name, size = "md", online: onl }: AvatarProps) {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-14 h-14 text-xl" : "w-11 h-11 text-sm";
  const dot = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";
  return (
    <div className="relative flex-shrink-0">
      {url ? (
        <img src={url} alt={name || ""} className={`${sz} rounded-full object-cover border border-[#303039]`} />
      ) : (
        <div className={`${sz} rounded-full bg-gradient-to-br from-[#FF4F9A] to-[#9B59B6] text-white flex items-center justify-center font-bold`}>
          {name?.[0]?.toUpperCase() || "?"}
        </div>
      )}
      {onl && <span className={`absolute bottom-0 right-0 ${dot} bg-emerald-500 rounded-full ring-2 ring-[#0B0B0D]`} />}
    </div>
  );
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [tab, setTab] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute bottom-full mb-2 right-0 w-72 bg-[#1C1C22] border border-[#303039] rounded-2xl shadow-2xl z-50 overflow-hidden">
      <div className="flex gap-1 p-2 border-b border-[#303039] overflow-x-auto">
        {EMOJI_GROUPS.map((g, i) => (
          <button key={i} onClick={() => setTab(i)}
            type="button"
            className={clsx("text-xs px-2 py-1 rounded-lg whitespace-nowrap transition-colors", tab === i ? "bg-[#FF4F9A] text-white" : "text-[#B8B8C2] hover:bg-[#26262E]")}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-0.5 p-2 max-h-44 overflow-y-auto">
        {EMOJI_GROUPS[tab].emojis.map(e => (
          <button key={e} onClick={() => { onSelect(e); onClose(); }}
            type="button"
            className="text-xl p-1 rounded-lg hover:bg-[#26262E] transition-colors text-center">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ReactionBarProps {
  reactions?: MessageReaction[];
  myId: string;
  onReact: (emoji: string) => void;
}

function ReactionBar({ reactions = [], myId, onReact }: ReactionBarProps) {
  const grouped: Record<string, { count: number; mine: boolean; names: string[] }> = {};
  for (const r of reactions) {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, mine: false, names: [] };
    grouped[r.emoji].count++;
    grouped[r.emoji].names.push(r.displayName);
    if (r.userId === myId) grouped[r.emoji].mine = true;
  }
  if (!Object.keys(grouped).length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Object.entries(grouped).map(([emoji, data]) => (
        <button key={emoji} onClick={() => onReact(emoji)}
          type="button"
          title={data.names.join(", ")}
          className={clsx("flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-all",
            data.mine ? "bg-[#FF4F9A]/20 border border-[#FF4F9A]/60 text-[#FF4F9A]" : "bg-[#1C1C22] border border-[#303039] text-white hover:border-[#FF4F9A]/40")}>
          {emoji} <span className="text-[10px]">{data.count}</span>
        </button>
      ))}
    </div>
  );
}

interface VoiceNotePlayerProps {
  url: string;
  isMe: boolean;
}

function VoiceNotePlayer({ url, isMe }: VoiceNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const updateTime = () => {
      setCurrentTime(audio.currentTime);
      setProgress((audio.currentTime / (audio.duration || 1)) * 100);
    };
    const loadedMetadata = () => setDuration(audio.duration || 0);
    const onEnded = () => { setIsPlaying(false); setProgress(0); };
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", loadedMetadata);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", loadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    audioRef.current.currentTime = pct * duration;
  };

  const formatSecs = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className={clsx("flex items-center gap-2.5 p-2 rounded-2xl min-w-[210px] max-w-xs", isMe ? "bg-white/10" : "bg-[#26262E]")}>
      <audio ref={audioRef} src={url} preload="metadata" />
      <button type="button" onClick={togglePlay}
        className={clsx("w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-95 shadow-md",
          isMe ? "bg-white text-[#FF4F9A]" : "bg-[#FF4F9A] text-white")}>
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div onClick={handleSeek} className="h-2 bg-white/20 rounded-full cursor-pointer relative overflow-hidden mb-1">
          <div className="h-full bg-[#FF4F9A] rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between items-center text-[10px] text-[#B8B8C2]">
          <span>{formatSecs(currentTime)}</span>
          <span className="flex items-center gap-1">
            <Mic className="w-2.5 h-2.5 text-[#FF4F9A]" />
            {duration ? formatSecs(duration) : "Voice note"}
          </span>
        </div>
      </div>
    </div>
  );
}

function DocumentCard({ attachment, isMe }: { attachment: MessageAttachment; isMe: boolean }) {
  const ext = (attachment.fileName || "").split(".").pop()?.toUpperCase() || "FILE";
  const badgeColors: Record<string, string> = {
    PDF: "bg-rose-500/20 text-rose-400 border-rose-500/30",
    DOC: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    DOCX: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    XLS: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    XLSX: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    PPT: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    PPTX: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    TXT: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  };
  const badgeStyle = badgeColors[ext] || "bg-[#303039] text-[#B8B8C2] border-[#40404C]";

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    downloadFile({
      url: attachment.fileUrl,
      fileName: attachment.fileName,
      fileId: attachment.fileId || undefined,
      mimeType: attachment.fileType,
    });
  };

  return (
    <div className={clsx("flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer group/doc",
      isMe ? "bg-white/10 hover:bg-white/15 border-white/20" : "bg-[#26262E] hover:bg-[#303039] border-[#303039]")}
      onClick={handleDownload}>
      <div className={clsx("w-9 h-9 rounded-lg border flex items-center justify-center font-bold text-[10px] flex-shrink-0 tracking-wider", badgeStyle)}>
        {ext.slice(0, 4)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate group-hover/doc:text-[#FF4F9A] transition-colors">{attachment.fileName}</p>
        <p className="text-[10px] text-[#B8B8C2] mt-0.5">{formatFileSize(attachment.fileSize)}</p>
      </div>
      <button type="button" onClick={handleDownload}
        className="p-1.5 rounded-lg text-[#B8B8C2] hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
        title="Download file">
        <Download className="w-4 h-4" />
      </button>
    </div>
  );
}

function MediaLightbox({ url, fileName, onClose }: { url: string; fileName?: string; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4" onClick={onClose}>
      <div className="absolute top-4 right-4 flex items-center gap-3 z-10" onClick={e => e.stopPropagation()}>
        <a href={url} download={fileName || "image"} target="_blank" rel="noreferrer"
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors" title="Download">
          <Download className="w-5 h-5" />
        </a>
        <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors" title="Close">
          <X className="w-5 h-5" />
        </button>
      </div>
      <img src={url} alt={fileName || "Full size"}
        onClick={e => e.stopPropagation()}
        className="max-h-[85vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl" />
      {fileName && <p className="text-xs text-[#B8B8C2] mt-3 truncate max-w-md">{fileName}</p>}
    </div>
  );
}

function DeleteConfirmModal({
  msg,
  isMe,
  isAdmin,
  onDeleteForEveryone,
  onDeleteForMe,
  onClose,
}: {
  msg: Message;
  isMe: boolean;
  isAdmin: boolean;
  onDeleteForEveryone: () => void;
  onDeleteForMe: () => void;
  onClose: () => void;
}) {
  const canDeleteForEveryone = (isMe || isAdmin) && !msg.isDeleted;
  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Delete Message?</h4>
            <p className="text-xs text-[#B8B8C2]">Choose how you want to delete this message.</p>
          </div>
        </div>
        <div className="space-y-2 pt-2">
          {canDeleteForEveryone && (
            <button onClick={onDeleteForEveryone}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20">
              <Trash2 className="w-4 h-4" /> Delete for Everyone
            </button>
          )}
          <button onClick={onDeleteForMe}
            className="w-full py-2.5 px-4 rounded-xl bg-[#26262E] hover:bg-[#303039] text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2">
            <User className="w-4 h-4" /> Delete for Me
          </button>
          <button onClick={onClose}
            className="w-full py-2 px-4 rounded-xl text-[#757582] hover:text-white text-xs transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface MessageMenuProps {
  msg: Message;
  isMe: boolean;
  disallowForwarding?: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDeletePrompt: () => void;
  onForward: () => void;
  onSelect: () => void;
  onCopy: () => void;
  onClose: () => void;
}

function MessageMenu({ msg, isMe, disallowForwarding, onReply, onEdit, onDeletePrompt, onForward, onSelect, onCopy, onClose }: MessageMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  const item = "flex items-center gap-2 px-3 py-2 text-xs hover:bg-[#26262E] transition-colors cursor-pointer w-full text-left";
  return (
    <div ref={ref} className={clsx("absolute bottom-full mb-1 w-44 bg-[#1C1C22] border border-[#303039] rounded-2xl shadow-2xl z-40 py-1 overflow-hidden", isMe ? "right-0" : "left-0")}>
      <button className={`${item} text-white`} onClick={() => { onReply(); onClose(); }}><Reply className="w-3.5 h-3.5 text-[#FF4F9A]" /> Reply</button>
      {!msg.isDeleted && msg.content && <button className={`${item} text-white`} onClick={() => { onCopy(); onClose(); }}><Copy className="w-3.5 h-3.5 text-[#B8B8C2]" /> Copy Text</button>}
      {!disallowForwarding && !msg.isDeleted && <button className={`${item} text-white`} onClick={() => { onForward(); onClose(); }}><Forward className="w-3.5 h-3.5 text-violet-400" /> Forward</button>}
      <button className={`${item} text-white`} onClick={() => { onSelect(); onClose(); }}><CheckSquare className="w-3.5 h-3.5 text-sky-400" /> Select Message</button>
      {isMe && !msg.isDeleted && <button className={`${item} text-white`} onClick={() => { onEdit(); onClose(); }}><Pencil className="w-3.5 h-3.5 text-amber-400" /> Edit</button>}
      <button className={`${item} text-rose-400 border-t border-[#303039] mt-1`} onClick={() => { onDeletePrompt(); onClose(); }}><Trash2 className="w-3.5 h-3.5" /> Delete…</button>
    </div>
  );
}

interface PendingUploadItem {
  file: File;
  id: string;
  name: string;
  size: number;
  category: "image" | "video" | "audio" | "document";
  previewUrl?: string;
}

export default function MessagesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const directUserId = searchParams.get("userId");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [convDetail, setConvDetail] = useState<any | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingConvs, setIsLoadingConvs] = useState(true);
  const [isLoadingMsgs, setIsLoadingMsgs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileChat, setShowMobileChat] = useState(false);

  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [editText, setEditText] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);

  // Attachments and uploads
  const [pendingUploads, setPendingUploads] = useState<PendingUploadItem[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [activeLightbox, setActiveLightbox] = useState<{ url: string; fileName?: string } | null>(null);

  // Audio / Voice note recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Multi-select mode
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());

  // Delete modal
  const [deleteModalMsg, setDeleteModalMsg] = useState<Message | null>(null);

  // Typing state
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimerRef = useRef<any>(null);
  const isTypingSent = useRef(false);

  // Modals & Navigation
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showConvInfo, setShowConvInfo] = useState(false);
  const [showConvMenu, setShowConvMenu] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [forwardTargetConv, setForwardTargetConv] = useState("");

  const [newChatUsername, setNewChatUsername] = useState("");
  const [isStartingChat, setIsStartingChat] = useState(false);

  const [groupTitle, setGroupTitle] = useState("");
  const [groupMemberQuery, setGroupMemberQuery] = useState("");
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [groupMemberResults, setGroupMemberResults] = useState<any[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [msgSearchQuery, setMsgSearchQuery] = useState("");

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<any>(null);
  const typingPollingRef = useRef<any>(null);
  const convMenuRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  // Real-time online presence: userId -> { isOnline, lastSeenAt }
  const [onlineUsers, setOnlineUsers] = useState<Map<string, { isOnline: boolean; lastSeenAt: string | null }>>(new Map());
  const selectedConvRef = useRef<Conversation | null>(null);
  selectedConvRef.current = selectedConv;

  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await api.get("/messages/conversations");
      setConversations(data.conversations || []);
      return data.conversations as Conversation[];
    } catch (err) {
      toast.error(getErrorMessage(err));
      return [];
    } finally {
      setIsLoadingConvs(false);
    }
  }, []);

  const fetchMessages = useCallback(async (convId: string, markRead = true) => {
    try {
      const { data } = await api.get(`/messages/conversations/${convId}`);
      setMessages(data.messages || []);
      setConvDetail(data.conversation);
      if (markRead) {
        api.post(`/messages/conversations/${convId}/read`).catch(() => {});
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, unreadCount: 0 } : c));
      } else {
        api.post(`/messages/conversations/${convId}/delivered`).catch(() => {});
      }
    } catch {}
  }, []);

  const pollTyping = useCallback(async (convId: string) => {
    try {
      const { data } = await api.get(`/messages/conversations/${convId}/typing`);
      setTypingUsers(data.typingUsers || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (directUserId && user) {
      (async () => {
        try {
          const { data } = await api.post("/messages/conversations", { recipientId: directUserId });
          const convs = await fetchConversations();
          const target = convs.find(c => c.id === data.conversation.id) || { id: data.conversation.id, ...data.conversation } as any;
          setSelectedConv(target);
          setShowMobileChat(true);
          setSearchParams({});
        } catch (err) {
          toast.error(getErrorMessage(err));
        }
      })();
    } else {
      fetchConversations().then(convs => {
        if (convs.length > 0 && !selectedConv && window.innerWidth >= 768) {
          setSelectedConv(convs[0]);
        }
      });
    }
  }, [directUserId, user, fetchConversations, setSearchParams]);

  // Subscribe to real-time WebSocket events
  useEffect(() => {
    const unsubPresence = presenceClient.on('presenceChange', ({ userId, isOnline, lastSeenAt }) => {
      setOnlineUsers(prev => {
        const next = new Map(prev);
        next.set(userId, { isOnline, lastSeenAt });
        return next;
      });
      // Also update conversation list with fresh lastSeenAt
      setConversations(prev => prev.map(c => {
        if (!c.isGroup && c.otherUser?.id === userId) {
          return { ...c, otherUser: { ...c.otherUser!, lastSeenAt: lastSeenAt ?? c.otherUser!.lastSeenAt } };
        }
        return c;
      }));
    });

    const unsubDelivered = presenceClient.on('messageDelivered', ({ messageId, conversationId }) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, status: 'DELIVERED' } : m
      ));
      setConversations(prev => prev.map(c => {
        if (c.id === conversationId && c.lastMessage && c.lastMessage.id === messageId) {
          return { ...c, lastMessage: { ...c.lastMessage, status: 'DELIVERED' } };
        }
        return c;
      }));
    });

    const unsubRead = presenceClient.on('messagesRead', ({ conversationId }) => {
      // Update all messages in this conversation sent by current user to READ
      setMessages(prev => prev.map(m =>
        m.conversationId === conversationId && m.senderId === user?.id
          ? { ...m, status: 'READ', isRead: true }
          : m
      ));
      setConversations(prev => prev.map(c => {
        if (c.id === conversationId && c.lastMessage && c.lastMessage.senderId === user?.id) {
          return { ...c, lastMessage: { ...c.lastMessage, status: 'READ', isRead: true } };
        }
        return c;
      }));
    });

    const unsubNewMessage = presenceClient.on('newMessage', ({ message }) => {
      const conv = selectedConvRef.current;
      // If the message is in the active conversation, append it
      if (conv && message.conversationId === conv.id) {
        setMessages(prev => {
          if (prev.some(m => m.id === message.id)) return prev; // deduplicate
          return [...prev, message];
        });
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
        // Mark as read immediately
        api.post(`/messages/conversations/${conv.id}/read`).catch(() => {});
      }
      // Bump unread count for other conversations
      setConversations(prev => prev.map(c => {
        if (c.id !== message.conversationId) return c;
        const isActive = conv?.id === c.id;
        return {
          ...c,
          lastMessage: {
            id: message.id,
            content: message.content,
            createdAt: message.createdAt,
            senderId: message.senderId,
            isRead: isActive,
            status: message.status,
            hasAttachment: message.attachments?.length > 0,
          },
          unreadCount: isActive ? 0 : (c.unreadCount || 0) + 1,
        };
      }));
    });

    const unsubTyping = presenceClient.on('typingChange', ({ conversationId, displayName, isTyping }) => {
      const conv = selectedConvRef.current;
      if (!conv || conv.id !== conversationId) return;
      setTypingUsers(prev => {
        if (isTyping) {
          return prev.includes(displayName) ? prev : [...prev, displayName];
        } else {
          return prev.filter(n => n !== displayName);
        }
      });
    });

    return () => {
      unsubPresence();
      unsubDelivered();
      unsubRead();
      unsubNewMessage();
      unsubTyping();
    };
  }, [user?.id]);

  useEffect(() => {
    if (selectedConv) {
      setIsLoadingMsgs(true);
      fetchMessages(selectedConv.id).finally(() => {
        setIsLoadingMsgs(false);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "instant" }), 30);
      });
      // Polling kept as fallback at 10s (WebSocket is primary)
      pollingRef.current = setInterval(() => fetchMessages(selectedConv.id, false), 10_000);
      // Typing polling only needed if WS is unavailable — keep at 4s as safety net
      typingPollingRef.current = setInterval(() => pollTyping(selectedConv.id), 4_000);
      return () => {
        if (pollingRef.current) clearInterval(pollingRef.current);
        if (typingPollingRef.current) clearInterval(typingPollingRef.current);
      };
    }
  }, [selectedConv?.id, fetchMessages, pollTyping]);

  // Click-outside close for conversation header menu
  useEffect(() => {
    if (!showConvMenu) return;
    const handler = (e: MouseEvent) => {
      if (convMenuRef.current && !convMenuRef.current.contains(e.target as Node)) setShowConvMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showConvMenu]);

  // Click-outside close for attachment menu
  useEffect(() => {
    if (!showAttachMenu) return;
    const handler = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) setShowAttachMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAttachMenu]);

  // Group member search — debounced API call
  useEffect(() => {
    if (!groupMemberQuery.trim()) {
      setGroupMemberResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/search/users?q=${encodeURIComponent(groupMemberQuery.trim())}`);
        const results = (data.users || []).filter((u: any) =>
          u.id !== user?.id && !groupMembers.some((m: any) => m.id === u.id)
        );
        setGroupMemberResults(results);
      } catch { setGroupMemberResults([]); }
    }, 350);
    return () => clearTimeout(timer);
  }, [groupMemberQuery, user?.id, groupMembers]);

  const handleInputChange = (val: string) => {
    setInputText(val);
    if (!selectedConv) return;
    if (!isTypingSent.current) {
      api.post(`/messages/conversations/${selectedConv.id}/typing`, { isTyping: true }).catch(() => {});
      isTypingSent.current = true;
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      api.post(`/messages/conversations/${selectedConv.id}/typing`, { isTyping: false }).catch(() => {});
      isTypingSent.current = false;
    }, 2500);
  };

  // Attachment file handling
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, category: "image" | "video" | "audio" | "document") => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const maxDocSize = 30 * 1024 * 1024; // 30MB
    const valid: PendingUploadItem[] = [];

    for (const file of files) {
      if (file.size > maxDocSize) {
        toast.error(`${file.name} is too large (max 30MB)`);
        continue;
      }
      const previewUrl = category === "image" ? URL.createObjectURL(file) : undefined;
      valid.push({
        file,
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        category,
        previewUrl,
      });
    }

    setPendingUploads(prev => [...prev, ...valid]);
    setShowAttachMenu(false);
    e.target.value = "";
  };

  const removePendingUpload = (id: string) => {
    setPendingUploads(prev => {
      const item = prev.find(p => p.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(p => p + 1);
      }, 1000);
    } catch {
      toast.error("Microphone access was denied or is unavailable.");
    }
  };

  const cancelRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
  };

  const finishAndSendRecording = async () => {
    if (!mediaRecorderRef.current || !selectedConv) return;
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const audioFile = new File([audioBlob], `voice_note_${Date.now()}.webm`, { type: "audio/webm" });
      setIsRecording(false);
      setRecordingSeconds(0);
      audioChunksRef.current = [];

      // Upload and send voice note
      const uploadToast = toast.loading("Sending voice note…");
      try {
        const formData = new FormData();
        formData.append("files", audioFile);
        const { data: uploadRes } = await api.post("/upload/batch", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        const attachments = (uploadRes.files || []).map((f: any) => ({
          fileId: f.fileId,
          fileName: f.fileName,
          fileUrl: f.fileUrl,
          fileType: f.fileType,
          fileSize: f.fileSize,
        }));

        const { data: msgRes } = await api.post("/messages/send", {
          conversationId: selectedConv.id,
          content: "🎤 Voice message",
          attachments,
        });

        setMessages(prev => [...prev, msgRes.message]);
        toast.success("Voice note sent!", { id: uploadToast });
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      } catch (err) {
        toast.error(getErrorMessage(err), { id: uploadToast });
      }
    };

    mediaRecorderRef.current.stop();
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedConv) return;
    const content = inputText.trim();
    const hasFiles = pendingUploads.length > 0;
    if (!content && !hasFiles) return;

    setIsSending(true);
    setInputText("");
    const currentReplyTo = replyTo;
    setReplyTo(null);

    let attachments: any[] = [];

    // Upload pending files if any
    if (hasFiles) {
      setUploadProgress(10);
      try {
        const formData = new FormData();
        pendingUploads.forEach(p => formData.append("files", p.file));
        const { data: uploadRes } = await api.post("/upload/batch", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (ev) => {
            if (ev.total) setUploadProgress(Math.round((ev.loaded * 90) / ev.total));
          },
        });
        attachments = (uploadRes.files || []).map((f: any) => ({
          fileId: f.fileId,
          fileName: f.fileName,
          fileUrl: f.fileUrl,
          fileType: f.fileType,
          fileSize: f.fileSize,
        }));
      } catch (err) {
        toast.error(`Upload failed: ${getErrorMessage(err)}`);
        setIsSending(false);
        setUploadProgress(null);
        return;
      }
      setPendingUploads([]);
      setUploadProgress(null);
    }

    try {
      const { data } = await api.post("/messages/send", {
        conversationId: selectedConv.id,
        content,
        replyToId: currentReplyTo?.id || null,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      setMessages(prev => [...prev, data.message]);
      setConversations(prev => prev.map(c => c.id === selectedConv.id
        ? { ...c, lastMessage: { id: data.message.id, content: content || "📎 Attachment", createdAt: data.message.createdAt, senderId: data.message.senderId }, updatedAt: data.message.createdAt }
        : c));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setInputText(content);
      setReplyTo(currentReplyTo);
    } finally {
      setIsSending(false);
    }
  };

  const handleEditSave = async () => {
    if (!editingMsg || !editText.trim()) return;
    try {
      await api.put(`/messages/${editingMsg.id}`, { content: editText.trim() });
      setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, content: editText.trim(), isEdited: true, editedAt: new Date().toISOString() } : m));
      setEditingMsg(null);
      toast.success("Message edited");
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const executeDelete = async (msgId: string, mode: "forEveryone" | "forMe") => {
    try {
      await api.delete(`/messages/${msgId}`, { data: { mode } });
      if (mode === "forMe") {
        setMessages(prev => prev.filter(m => m.id !== msgId));
        toast.success("Deleted for you");
      } else {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isDeleted: true, content: "[This message was deleted]", reactions: [], attachments: [] } : m));
        toast.success("Deleted for everyone");
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleteModalMsg(null);
    }
  };

  const handleReaction = async (msgId: string, emoji: string) => {
    try {
      const { data } = await api.post(`/messages/${msgId}/reactions`, { emoji });
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        const reactions = [...(m.reactions || [])];
        if (data.action === "removed") return { ...m, reactions: reactions.filter(r => !(r.userId === user!.id && r.emoji === emoji)) };
        reactions.push({ id: data.reaction.id, emoji, userId: user!.id, username: user!.username, displayName: user!.displayName });
        return { ...m, reactions };
      }));
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const handleForward = async () => {
    if (!forwardMsg || !forwardTargetConv) return;
    try {
      await api.post("/messages/forward", { messageId: forwardMsg.id, targetConversationId: forwardTargetConv });
      toast.success("Message forwarded");
      setShowForwardModal(false); setForwardMsg(null); setForwardTargetConv("");
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  // Multi-select handlers
  const toggleSelectMessage = (id: string) => {
    setSelectedMsgIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setIsSelectMode(false);
      return next;
    });
  };

  const copySelectedMessages = () => {
    const selected = messages.filter(m => selectedMsgIds.has(m.id));
    const text = selected.map(m => `[${m.sender?.displayName || "Unknown"}] (${formatMsgTime(m.createdAt)}): ${m.content}`).join("\n");
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${selected.length} messages`);
    setIsSelectMode(false);
    setSelectedMsgIds(new Set());
  };

  const deleteSelectedMessages = async () => {
    if (!window.confirm(`Delete ${selectedMsgIds.size} selected message(s)?`)) return;
    for (const id of selectedMsgIds) {
      await api.delete(`/messages/${id}`, { data: { mode: "forMe" } }).catch(() => {});
    }
    setMessages(prev => prev.filter(m => !selectedMsgIds.has(m.id)));
    toast.success("Messages deleted");
    setIsSelectMode(false);
    setSelectedMsgIds(new Set());
  };

  const scrollToMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-[#FF4F9A]", "bg-[#FF4F9A]/15");
      setTimeout(() => el.classList.remove("ring-2", "ring-[#FF4F9A]", "bg-[#FF4F9A]/15"), 1500);
    }
  };

  const setPref = async (prefs: Record<string, boolean>) => {
    if (!selectedConv) return;
    try {
      await api.patch(`/messages/conversations/${selectedConv.id}/preferences`, prefs);
      setSelectedConv(prev => prev ? { ...prev, ...prefs } : prev);
      setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, ...prefs } : c));
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const handleBlock = async () => {
    if (!selectedConv?.otherUser) return;
    if (!window.confirm(`Block ${selectedConv.otherUser.displayName}?`)) return;
    try {
      await api.post(`/moderation/block/${selectedConv.otherUser.id}`);
      toast.success(`Blocked @${selectedConv.otherUser.username}`);
      setSelectedConv(null); fetchConversations();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const handleReport = async () => {
    if (!selectedConv?.otherUser) return;
    const reason = window.prompt("Reason for reporting:");
    if (!reason) return;
    try {
      await api.post("/moderation/report", { targetUserId: selectedConv.otherUser.id, reason: "Harassment / Inappropriate Messages", details: reason });
      toast.success("Report submitted");
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const handleStartChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatUsername.trim()) return;
    setIsStartingChat(true);
    try {
      const { data: sd } = await api.get(`/search/users?q=${encodeURIComponent(newChatUsername.trim())}`);
      const found = sd.users?.[0];
      if (!found) { toast.error(`User @${newChatUsername.trim()} not found`); return; }
      if (found.id === user?.id) { toast.error("You cannot chat with yourself"); return; }
      const { data } = await api.post("/messages/conversations", { recipientId: found.id });
      const convs = await fetchConversations();
      const target = convs.find(c => c.id === data.conversation.id);
      if (target) { setSelectedConv(target); setShowMobileChat(true); }
      setShowNewChat(false); setNewChatUsername("");
      toast.success(`Chat with ${found.displayName} ready`);
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setIsStartingChat(false); }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupTitle.trim() || groupMembers.length === 0) return;
    setIsCreatingGroup(true);
    try {
      const { data } = await api.post("/messages/groups", { title: groupTitle.trim(), participantIds: groupMembers.map((m: any) => m.id) });
      const convs = await fetchConversations();
      const target = convs.find(c => c.id === data.conversationId);
      if (target) { setSelectedConv(target); setShowMobileChat(true); }
      setShowNewGroup(false); setGroupTitle(""); setGroupMembers([]);
      toast.success("Group created!");
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setIsCreatingGroup(false); }
  };

  const filteredConvs = conversations.filter(c => getConvName(c, user?.id || "").toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredMsgs = showMsgSearch && msgSearchQuery ? messages.filter(m => m.content?.toLowerCase().includes(msgSearchQuery.toLowerCase())) : messages;

  const getOtherUserOnline = (otherUserId?: string, lastSeenAt?: string | null): boolean => {
    if (!otherUserId) return false;
    const rt = onlineUsers.get(otherUserId);
    if (rt !== undefined) return rt.isOnline;
    // Fallback to timestamp-based check
    return isOnline(lastSeenAt);
  };

  const getHeaderSubtitle = () => {
    if (typingUsers.length > 0) return `${typingUsers.join(", ")} typing...`;
    if (selectedConv?.isGroup) return `${convDetail?.participants?.length || selectedConv.participantCount || 0} members`;
    if (selectedConv?.otherUser) {
      const rt = onlineUsers.get(selectedConv.otherUser.id);
      const online = rt !== undefined ? rt.isOnline : isOnline(selectedConv.otherUser.lastSeenAt);
      // For lastSeenAt, prefer WS-pushed timestamp if available
      const lastSeen = rt?.lastSeenAt ?? selectedConv.otherUser.lastSeenAt;
      return online ? "Online now" : getRelativeLastSeen(lastSeen);
    }
    return "";
  };

  const subtitle = getHeaderSubtitle();
  const isOnlineStatus = !selectedConv?.isGroup && getOtherUserOnline(selectedConv?.otherUser?.id, selectedConv?.otherUser?.lastSeenAt);

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 py-4 h-[calc(100vh-5rem)] flex flex-col">
      <div className="flex-1 rounded-3xl bg-[#151519] border border-[#303039] overflow-hidden flex shadow-2xl relative">

        {/* Hidden File Inputs */}
        <input ref={imageInputRef} type="file" multiple accept="image/*,video/*" onChange={e => handleFileSelect(e, "image")} className="hidden" />
        <input ref={docInputRef} type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt" onChange={e => handleFileSelect(e, "document")} className="hidden" />
        <input ref={audioInputRef} type="file" multiple accept="audio/*" onChange={e => handleFileSelect(e, "audio")} className="hidden" />

        {/* Left: Conversations List */}
        <div className={clsx("w-full md:w-80 lg:w-96 border-r border-[#303039] flex flex-col bg-[#0B0B0D]/60", showMobileChat ? "hidden md:flex" : "flex")}>
          <div className="p-4 border-b border-[#303039] flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#FF4F9A]" /> Messages
            </h2>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setShowNewGroup(true)} title="New Group" className="p-1.5 rounded-lg text-[#B8B8C2] hover:text-white hover:bg-[#1C1C22] transition-colors">
                <Users className="w-4 h-4" />
              </button>
              <button onClick={() => setShowNewChat(true)} className="text-xs px-3 py-1.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white font-semibold transition-colors flex items-center gap-1">
                <Plus className="w-3 h-3" /> New
              </button>
            </div>
          </div>

          <div className="p-3 border-b border-[#303039]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#757582]" />
              <input type="text" placeholder="Search conversations..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#1C1C22] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#303039]/40">
            {isLoadingConvs ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-3.5 flex gap-3 animate-pulse items-center">
                  <div className="w-11 h-11 rounded-full bg-[#303039]" />
                  <div className="flex-1 space-y-1.5"><div className="h-3.5 bg-[#303039] rounded w-2/3" /><div className="h-2.5 bg-[#303039] rounded w-1/2" /></div>
                </div>
              ))
            ) : filteredConvs.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#B8B8C2]">
                <p className="font-semibold text-white mb-1">No conversations</p>
                <p>Start a chat with a creator or friend.</p>
              </div>
            ) : (
              filteredConvs.map(conv => {
                const isSelected = selectedConv?.id === conv.id;
                const convName = getConvName(conv, user?.id || "");
                const convAvatar = getConvAvatar(conv);
                const online = !conv.isGroup && getOtherUserOnline(conv.otherUser?.id, conv.otherUser?.lastSeenAt);
                const hasUnread = (conv.unreadCount || 0) > 0;
                const isTypingInConv = (conv.activeTyping || []).length > 0;
                return (
                  <div key={conv.id} onClick={() => { setSelectedConv(conv); setShowMobileChat(true); }}
                    className={clsx("p-3.5 flex items-center gap-3 cursor-pointer transition-colors select-none",
                      isSelected ? "bg-[#1C1C22] border-l-4 border-l-[#FF4F9A]" : "hover:bg-[#1C1C22]/60",
                      conv.isMuted && "opacity-70")}>
                    <Avatar url={convAvatar} name={convName} online={online} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className={clsx("text-xs font-semibold truncate", hasUnread ? "text-white" : "text-[#D5D5DF]")}>{convName}</span>
                          {conv.isGroup && <Users className="w-3 h-3 text-[#757582] flex-shrink-0" />}
                          {conv.isPinned && <Pin className="w-3 h-3 text-[#FF4F9A] flex-shrink-0" />}
                          {conv.isMuted && <BellOff className="w-3 h-3 text-[#757582] flex-shrink-0" />}
                        </div>
                        <span className="text-[10px] text-[#757582] flex-shrink-0 ml-1">{formatTime(conv.lastMessage?.createdAt || conv.updatedAt)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className={clsx("text-[11px] truncate", hasUnread ? "text-white font-medium" : "text-[#757582]")}>
                          {isTypingInConv ? <span className="text-[#FF4F9A] italic">{(conv.activeTyping || []).join(", ")} typing…</span>
                            : conv.lastMessage?.content || (conv.lastMessage?.hasAttachment ? "📎 Attachment" : "No messages yet")}
                        </p>
                        {(conv.unreadCount || 0) > 0 && (
                          <span className="ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF4F9A] text-white text-[10px] font-bold flex items-center justify-center">
                            {(conv.unreadCount || 0) > 99 ? "99+" : conv.unreadCount}
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

        {/* Right: Active Chat */}
        <div className={clsx("flex-1 flex flex-col bg-[#0B0B0D]", showMobileChat ? "flex" : "hidden md:flex")}>
          {selectedConv ? (
            <>
              {/* Select Mode Action Bar */}
              {isSelectMode ? (
                <div className="px-4 py-3 bg-[#FF4F9A]/15 border-b border-[#FF4F9A]/30 flex items-center justify-between z-30">
                  <div className="flex items-center gap-3">
                    <button onClick={() => { setIsSelectMode(false); setSelectedMsgIds(new Set()); }}
                      className="p-1.5 rounded-lg text-white hover:bg-white/10 transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                    <span className="text-sm font-bold text-white">{selectedMsgIds.size} selected</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={copySelectedMessages} disabled={selectedMsgIds.size === 0}
                      className="p-2 rounded-xl text-white hover:bg-white/10 transition-colors disabled:opacity-40" title="Copy text">
                      <Copy className="w-4 h-4" />
                    </button>
                    <button onClick={() => {
                      const firstSelected = messages.find(m => selectedMsgIds.has(m.id));
                      if (firstSelected) { setForwardMsg(firstSelected); setShowForwardModal(true); }
                    }} disabled={selectedMsgIds.size === 0}
                      className="p-2 rounded-xl text-white hover:bg-white/10 transition-colors disabled:opacity-40" title="Forward">
                      <Forward className="w-4 h-4" />
                    </button>
                    <button onClick={deleteSelectedMessages} disabled={selectedMsgIds.size === 0}
                      className="p-2 rounded-xl text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-40" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Regular Chat Header */
                <div className="px-3.5 py-2.5 border-b border-[#303039] bg-[#151519] flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2.5">
                    <button onClick={() => setShowMobileChat(false)} className="md:hidden p-1 rounded-lg text-[#B8B8C2] hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
                    <button onClick={() => setShowConvInfo(true)} className="flex items-center gap-2.5 group text-left">
                      <Avatar url={getConvAvatar(selectedConv)} name={getConvName(selectedConv, user?.id || "")} online={isOnlineStatus} />
                      <div>
                        <h3 className="text-sm font-bold text-white group-hover:text-[#FF4F9A] transition-colors leading-tight">{getConvName(selectedConv, user?.id || "")}</h3>
                        <p className={clsx("text-[10px]", typingUsers.length > 0 ? "text-[#FF4F9A] animate-pulse" : isOnlineStatus ? "text-emerald-400" : "text-[#757582]")}>{subtitle}</p>
                      </div>
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setShowMsgSearch(p => !p); setMsgSearchQuery(""); }} className="p-1.5 rounded-lg text-[#B8B8C2] hover:text-white hover:bg-[#1C1C22] transition-colors">
                      <Search className="w-4 h-4" />
                    </button>
                    <button onClick={() => setShowConvInfo(true)} className="p-1.5 rounded-lg text-[#B8B8C2] hover:text-white hover:bg-[#1C1C22] transition-colors">
                      <Info className="w-4 h-4" />
                    </button>
                    <div className="relative" ref={convMenuRef}>
                      <button onClick={() => setShowConvMenu(p => !p)} className="p-1.5 rounded-lg text-[#B8B8C2] hover:text-white hover:bg-[#1C1C22] transition-colors">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {showConvMenu && (
                        <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl bg-[#1C1C22] border border-[#303039] shadow-xl py-1 z-30">
                          <button className="flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-[#26262E] transition-colors w-full text-left" onClick={() => { setIsSelectMode(true); setShowConvMenu(false); }}>
                            <CheckSquare className="w-3.5 h-3.5 text-sky-400" /> Select Messages
                          </button>
                          {!selectedConv.isGroup && <Link to={`/profile/${selectedConv.otherUser?.username}`} onClick={() => setShowConvMenu(false)} className="flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-[#26262E] transition-colors"><User className="w-3.5 h-3.5 text-[#FF4F9A]" /> View Profile</Link>}
                          <button className="flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-[#26262E] transition-colors w-full text-left" onClick={() => { setPref({ isPinned: !selectedConv.isPinned }); setShowConvMenu(false); }}><Pin className="w-3.5 h-3.5 text-violet-400" /> {selectedConv.isPinned ? "Unpin" : "Pin"} Chat</button>
                          <button className="flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-[#26262E] transition-colors w-full text-left" onClick={() => { setPref({ isMuted: !selectedConv.isMuted }); setShowConvMenu(false); }}><BellOff className="w-3.5 h-3.5 text-amber-400" /> {selectedConv.isMuted ? "Unmute" : "Mute"} Notifications</button>
                          <button className="flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-[#26262E] transition-colors w-full text-left" onClick={() => { setPref({ isArchived: !selectedConv.isArchived }); setShowConvMenu(false); }}><Archive className="w-3.5 h-3.5 text-sky-400" /> {selectedConv.isArchived ? "Unarchive" : "Archive"}</button>
                          <button className="flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-[#26262E] transition-colors w-full text-left" onClick={() => { setPref({ isMarkedUnread: true }); setShowConvMenu(false); }}><MailOpen className="w-3.5 h-3.5 text-[#B8B8C2]" /> Mark as Unread</button>
                          {!selectedConv.isGroup && <>
                            <div className="border-t border-[#303039] my-1" />
                            <button className="flex items-center gap-2 px-3 py-2 text-xs text-amber-400 hover:bg-[#26262E] transition-colors w-full text-left" onClick={() => { handleReport(); setShowConvMenu(false); }}><ShieldAlert className="w-3.5 h-3.5" /> Report User</button>
                            <button className="flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-[#26262E] transition-colors w-full text-left" onClick={() => { handleBlock(); setShowConvMenu(false); }}><UserX className="w-3.5 h-3.5" /> Block User</button>
                          </>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {showMsgSearch && (
                <div className="px-4 py-2 bg-[#151519] border-b border-[#303039] flex items-center gap-2">
                  <Search className="w-4 h-4 text-[#757582] flex-shrink-0" />
                  <input autoFocus type="text" placeholder="Search messages in this chat..." value={msgSearchQuery} onChange={e => setMsgSearchQuery(e.target.value)} className="flex-1 bg-transparent text-xs text-white outline-none placeholder:text-[#757582]" />
                  <button onClick={() => { setShowMsgSearch(false); setMsgSearchQuery(""); }}><X className="w-4 h-4 text-[#757582] hover:text-white" /></button>
                </div>
              )}

              {selectedConv.participantStatus === "PENDING_REQUEST" && (
                <div className="p-3 bg-amber-500/10 border-b border-amber-500/30 text-center">
                  <p className="text-xs text-amber-400 font-medium">This is a message request. Accept to continue the conversation.</p>
                  <div className="flex justify-center gap-2 mt-2">
                    <button onClick={async () => { await api.post(`/messages/conversations/${selectedConv.id}/accept`); await fetchConversations(); toast.success("Accepted!"); }} className="px-4 py-1 rounded-lg bg-emerald-500 text-white text-xs font-semibold">Accept</button>
                    <button onClick={async () => { await api.post(`/messages/conversations/${selectedConv.id}/decline`); setSelectedConv(null); await fetchConversations(); }} className="px-4 py-1 rounded-lg bg-rose-500 text-white text-xs font-semibold">Decline</button>
                  </div>
                </div>
              )}

              {/* Messages Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                {isLoadingMsgs ? (
                  <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 text-[#FF4F9A] animate-spin" /></div>
                ) : filteredMsgs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6">
                    <div className="w-12 h-12 rounded-full bg-[#1C1C22] border border-[#303039] flex items-center justify-center text-[#FF4F9A] mb-3"><Sparkles className="w-6 h-6" /></div>
                    <p className="text-sm font-bold text-white mb-1">{showMsgSearch ? "No messages match your search" : `Say hello to ${getConvName(selectedConv, user?.id || "")}!`}</p>
                    {!showMsgSearch && <p className="text-xs text-[#B8B8C2] max-w-xs">Send a message to start the conversation.</p>}
                  </div>
                ) : (
                  filteredMsgs.map((msg, idx) => {
                    const isMe = msg.senderId === user?.id;
                    const prevMsg = filteredMsgs[idx - 1];
                    const showSender = selectedConv.isGroup && !isMe && (!prevMsg || prevMsg.senderId !== msg.senderId);
                    const isGrouped = prevMsg && prevMsg.senderId === msg.senderId &&
                      (new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime()) < 5 * 60 * 1000;
                    const isSelected = selectedMsgIds.has(msg.id);

                    return (
                      <div key={msg.id} id={`msg-${msg.id}`}
                        onClick={() => { if (isSelectMode) toggleSelectMessage(msg.id); }}
                        className={clsx("flex flex-col transition-all rounded-2xl p-1",
                          isMe ? "items-end" : "items-start",
                          !isGrouped && "mt-3",
                          isSelected && "bg-[#FF4F9A]/15 ring-1 ring-[#FF4F9A]/50")}>
                        {showSender && <span className="text-[10px] text-[#FF4F9A] font-semibold ml-1 mb-0.5">{msg.sender?.displayName}</span>}
                        <div className={clsx("flex items-end gap-1.5 max-w-[85%] sm:max-w-[75%]", isMe ? "flex-row-reverse" : "flex-row")}>
                          {isSelectMode && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); toggleSelectMessage(msg.id); }}
                              className="self-center p-1 text-[#FF4F9A]">
                              {isSelected ? <CheckSquare className="w-5 h-5 fill-current" /> : <Square className="w-5 h-5 text-[#757582]" />}
                            </button>
                          )}
                          {selectedConv.isGroup && !isMe && !isGrouped && <Avatar url={msg.sender?.avatarUrl} name={msg.sender?.displayName} size="sm" />}
                          {selectedConv.isGroup && !isMe && isGrouped && <div className="w-8 flex-shrink-0" />}

                          <div className="relative group"
                            onContextMenu={(e) => {
                              if (isSelectMode || msg.isDeleted) return;
                              e.preventDefault();
                              setActiveMenu(msg.id);
                            }}>
                            {/* Quoted message preview */}
                            {msg.replyTo && (
                              <div onClick={() => msg.replyTo?.id && scrollToMessage(msg.replyTo.id)}
                                className={clsx("mb-1 px-2.5 py-1.5 rounded-xl border-l-2 text-[10px] cursor-pointer hover:opacity-90 transition-opacity",
                                  isMe ? "bg-[#FF4F9A]/15 border-[#FF4F9A] text-[#FF4F9A]/90" : "bg-[#26262E] border-[#FF4F9A] text-[#B8B8C2]")}>
                                <span className="font-semibold block">{msg.replyTo.senderDisplayName}</span>
                                <span className="truncate block max-w-[200px]">{msg.replyTo.content}</span>
                              </div>
                            )}

                            {/* Forwarded Tag */}
                            {msg.isForwarded && (
                              <div className={clsx("flex items-center gap-1 mb-0.5 text-[10px] text-[#757582]", isMe ? "justify-end" : "justify-start")}>
                                <Forward className="w-3 h-3" /> Forwarded
                              </div>
                            )}

                            {/* Message Bubble Content */}
                            <div className={clsx("px-3.5 py-2 text-xs sm:text-sm leading-relaxed break-words shadow-sm",
                              msg.isDeleted ? "italic text-[#757582] bg-[#1C1C22] border border-[#303039] rounded-2xl" :
                              isMe ? "bg-[#FF4F9A] text-white rounded-2xl rounded-br-sm" :
                              "bg-[#1C1C22] text-white border border-[#303039] rounded-2xl rounded-bl-sm")}>

                              {/* Attachments rendering */}
                              {(msg.attachments || []).length > 0 && (
                                <div className="mb-1.5 space-y-1.5">
                                  {(msg.attachments || []).map(att => {
                                    const isImg = att.fileType?.startsWith("image/");
                                    const isVid = att.fileType?.startsWith("video/");
                                    const isAud = att.fileType?.startsWith("audio/");
                                    return (
                                      <div key={att.id || att.fileName}>
                                        {isImg ? (
                                          <div onClick={() => setActiveLightbox({ url: att.fileUrl, fileName: att.fileName })}
                                            className="cursor-pointer overflow-hidden rounded-xl group/img relative">
                                            <img src={att.fileUrl} alt={att.fileName} className="max-w-full max-h-56 rounded-xl object-cover hover:scale-105 transition-transform duration-300" />
                                          </div>
                                        ) : isVid ? (
                                          <video src={att.fileUrl} controls className="max-w-full max-h-48 rounded-xl bg-black" />
                                        ) : isAud ? (
                                          <VoiceNotePlayer url={att.fileUrl} isMe={isMe} />
                                        ) : (
                                          <DocumentCard attachment={att} isMe={isMe} />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {msg.content && (
                                <span>
                                  {msg.content}
                                  {msg.isEdited && <span className="text-[10px] opacity-65 ml-1.5 font-normal">(edited)</span>}
                                </span>
                              )}
                            </div>

                            {/* Reactions display */}
                            <ReactionBar reactions={msg.reactions || []} myId={user?.id || ""} onReact={emoji => handleReaction(msg.id, emoji)} />

                            {/* WhatsApp-style Hover Action Bar */}
                            {!msg.isDeleted && !isSelectMode && (
                              <div className={clsx("absolute top-0 flex items-center gap-0.5 transition-opacity bg-[#1C1C22] border border-[#303039] rounded-xl px-1 py-0.5 shadow-xl z-20",
                                activeMenu === msg.id ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                                isMe ? "right-full mr-1.5" : "left-full ml-1.5")}>
                                {["👍","❤️","😂","😮","😢","🙏"].map(e => (
                                  <button key={e} onClick={() => handleReaction(msg.id, e)} className="text-sm hover:scale-125 transition-transform p-0.5">{e}</button>
                                ))}
                                <button onClick={() => setShowReactionPicker(msg.id)} className="p-0.5 text-[#757582] hover:text-white"><Smile className="w-3.5 h-3.5" /></button>
                                <div className="w-px h-4 bg-[#303039] mx-0.5" />
                                <button onClick={() => { setReplyTo(msg); textareaRef.current?.focus(); }} className="p-0.5 text-[#B8B8C2] hover:text-white" title="Reply"><Reply className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setActiveMenu(msg.id)} className="p-0.5 text-[#B8B8C2] hover:text-white" title="More"><MoreVertical className="w-3.5 h-3.5" /></button>
                              </div>
                            )}

                            {showReactionPicker === msg.id && (
                              <div className={clsx("absolute top-0 z-40", isMe ? "right-0" : "left-0")}>
                                <EmojiPicker onSelect={e => { handleReaction(msg.id, e); setShowReactionPicker(null); }} onClose={() => setShowReactionPicker(null)} />
                              </div>
                            )}

                            {activeMenu === msg.id && (
                              <MessageMenu msg={msg} isMe={isMe} disallowForwarding={convDetail?.disallowForwarding}
                                onReply={() => { setReplyTo(msg); textareaRef.current?.focus(); }}
                                onEdit={() => { setEditingMsg(msg); setEditText(msg.content); }}
                                onDeletePrompt={() => setDeleteModalMsg(msg)}
                                onForward={() => { setForwardMsg(msg); setShowForwardModal(true); }}
                                onSelect={() => { setIsSelectMode(true); toggleSelectMessage(msg.id); }}
                                onCopy={() => { navigator.clipboard.writeText(msg.content); toast.success("Copied!"); }}
                                onClose={() => setActiveMenu(null)} />
                            )}
                          </div>
                        </div>

                        {/* Timestamp & Status Checkmarks */}
                        <div className={clsx("flex items-center gap-1 mt-0.5 px-1", isMe ? "flex-row-reverse" : "flex-row")}>
                          <span className="text-[10px] text-[#757582]">{formatMsgTime(msg.createdAt)}</span>
                          {isMe && !msg.isDeleted && (
                            <span title={msg.status === "READ" || msg.isRead ? "Read" : msg.status === "DELIVERED" ? "Delivered" : "Sent"}>
                              {msg.status === "READ" || msg.isRead ? <CheckCheck className="w-3 h-3 text-[#FF4F9A]" />
                              : msg.status === "DELIVERED" ? <CheckCheck className="w-3 h-3 text-[#757582]" />
                              : <Check className="w-3 h-3 text-[#757582]" />}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div className="px-5 pb-1 flex items-center gap-2">
                  <div className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 bg-[#FF4F9A] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-[#FF4F9A] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-[#FF4F9A] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-[10px] text-[#757582] italic">{typingUsers.join(", ")} is typing…</span>
                </div>
              )}

              {/* Editing preview bar */}
              {editingMsg && (
                <div className="px-4 py-2 bg-sky-500/10 border-t border-sky-500/30 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-sky-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-[10px] text-sky-400 font-semibold">Editing message</p>
                    <input value={editText} onChange={e => setEditText(e.target.value)} autoFocus
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSave(); } if (e.key === "Escape") setEditingMsg(null); }}
                      className="w-full bg-transparent text-xs text-white outline-none" />
                  </div>
                  <button onClick={handleEditSave} className="text-sky-400 hover:text-sky-300"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditingMsg(null)} className="text-[#757582] hover:text-white"><X className="w-4 h-4" /></button>
                </div>
              )}

              {/* Reply preview bar */}
              {replyTo && !editingMsg && (
                <div className="px-4 py-2 bg-[#1C1C22] border-t border-[#303039] flex items-center gap-2">
                  <CornerDownLeft className="w-4 h-4 text-[#FF4F9A] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-[#FF4F9A] font-semibold">Replying to {replyTo.sender?.displayName}</p>
                    <p className="text-[11px] text-[#B8B8C2] truncate">{replyTo.content}</p>
                  </div>
                  <button onClick={() => setReplyTo(null)}><X className="w-4 h-4 text-[#757582] hover:text-white" /></button>
                </div>
              )}

              {/* Pending Attachments Shelf */}
              {pendingUploads.length > 0 && (
                <div className="p-3 bg-[#18181E] border-t border-[#303039]">
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {pendingUploads.map(item => (
                      <div key={item.id} className="relative flex-shrink-0 rounded-xl bg-[#26262E] border border-[#303039] p-1.5 flex items-center gap-2 max-w-[200px]">
                        {item.previewUrl ? (
                          <img src={item.previewUrl} alt={item.name} className="w-10 h-10 object-cover rounded-lg" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-[#303039] flex items-center justify-center text-xs font-bold text-white uppercase">
                            {item.category === "document" ? "DOC" : item.category === "audio" ? "AUD" : "VID"}
                          </div>
                        )}
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="text-xs text-white truncate">{item.name}</p>
                          <p className="text-[10px] text-[#B8B8C2]">{formatFileSize(item.size)}</p>
                        </div>
                        <button type="button" onClick={() => removePendingUpload(item.id)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600 transition-colors shadow">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {uploadProgress !== null && (
                    <div className="mt-2 w-full bg-[#26262E] rounded-full h-1.5 overflow-hidden">
                      <div className="bg-[#FF4F9A] h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  )}
                </div>
              )}

              {/* Chat Input Toolbar */}
              <div className="p-3 bg-[#151519] border-t border-[#303039] flex items-end gap-2 flex-shrink-0 relative">
                {isRecording ? (
                  /* Audio Recording Console */
                  <div className="flex-1 flex items-center justify-between px-4 py-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                      <span className="text-xs font-semibold">Recording Voice Note…</span>
                      <span className="text-xs font-mono font-bold text-white">
                        {Math.floor(recordingSeconds / 60)}:{recordingSeconds % 60 < 10 ? "0" : ""}{recordingSeconds % 60}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={cancelRecording} className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/20 transition-colors" title="Cancel">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={finishAndSendRecording} className="px-3 py-1 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition-colors flex items-center gap-1 shadow-lg shadow-rose-500/20">
                        <Send className="w-3.5 h-3.5" /> Send
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal Message Input + Attachment Toolbar */
                  <>
                    <div className="flex items-center gap-1 self-end pb-1.5">
                      {/* Emoji Picker Button */}
                      <div className="relative">
                        <button type="button" onClick={() => setShowEmojiPicker(p => !p)}
                          className="p-2 rounded-xl text-[#757582] hover:text-[#FF4F9A] transition-colors" title="Emoji">
                          <Smile className="w-5 h-5" />
                        </button>
                        {showEmojiPicker && <EmojiPicker onSelect={e => setInputText(p => p + e)} onClose={() => setShowEmojiPicker(false)} />}
                      </div>

                      {/* Attachment Menu Button */}
                      <div className="relative" ref={attachMenuRef}>
                        <button type="button" onClick={() => setShowAttachMenu(p => !p)}
                          className={clsx("p-2 rounded-xl transition-colors", showAttachMenu ? "text-[#FF4F9A] bg-[#FF4F9A]/15" : "text-[#757582] hover:text-white")}
                          title="Attach file">
                          <Paperclip className="w-5 h-5" />
                        </button>

                        {/* WhatsApp-style vertical popup */}
                        {showAttachMenu && (
                          <div className="absolute bottom-full mb-3 left-0 w-48 bg-[#1C1C22] border border-[#303039] rounded-2xl shadow-2xl p-2 space-y-1 z-40">
                            <button type="button" onClick={() => imageInputRef.current?.click()}
                              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-white hover:bg-[#26262E] transition-colors">
                              <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white"><ImageIcon className="w-4 h-4" /></span>
                              <span>Photos & Videos</span>
                            </button>
                            <button type="button" onClick={() => docInputRef.current?.click()}
                              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-white hover:bg-[#26262E] transition-colors">
                              <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-rose-500 to-orange-500 flex items-center justify-center text-white"><FileText className="w-4 h-4" /></span>
                              <span>Document</span>
                            </button>
                            <button type="button" onClick={() => audioInputRef.current?.click()}
                              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-white hover:bg-[#26262E] transition-colors">
                              <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white"><Music className="w-4 h-4" /></span>
                              <span>Audio File</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Auto-growing Textarea */}
                    <div className="flex-1 relative">
                      <textarea ref={textareaRef} rows={1}
                        placeholder="Type a message… (Shift+Enter for newline)"
                        value={inputText}
                        onChange={e => {
                          handleInputChange(e.target.value);
                          // Auto resize
                          e.target.style.height = "auto";
                          e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        maxLength={2000}
                        className="w-full px-4 py-2.5 rounded-2xl bg-[#0B0B0D] text-xs sm:text-sm text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none transition-colors resize-none max-h-32" />
                    </div>

                    {/* Voice note recorder button or Send button */}
                    {!inputText.trim() && pendingUploads.length === 0 ? (
                      <button type="button" onClick={startRecording}
                        className="p-2.5 rounded-xl bg-[#26262E] hover:bg-[#303039] text-[#FF4F9A] transition-all flex items-center justify-center self-end mb-0.5"
                        title="Hold or click to record voice note">
                        <Mic className="w-5 h-5" />
                      </button>
                    ) : (
                      <button type="button" onClick={() => handleSend()} disabled={isSending}
                        className="p-2.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center shadow-lg shadow-[#FF4F9A]/20 self-end mb-0.5"
                        title="Send (Enter)">
                        {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-20 h-20 rounded-3xl bg-[#1C1C22] border border-[#303039] flex items-center justify-center text-[#FF4F9A] mb-5 shadow-xl shadow-[#FF4F9A]/10">
                <MessageSquare className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Private Messaging</h3>
              <p className="text-xs text-[#B8B8C2] max-w-sm mb-6">Connect with creators and friends. Your messages are private and secure.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowNewChat(true)} className="px-5 py-2.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white text-xs font-semibold transition-colors shadow-lg shadow-[#FF4F9A]/20">New Message</button>
                <button onClick={() => setShowNewGroup(true)} className="px-5 py-2.5 rounded-xl bg-[#1C1C22] border border-[#303039] text-white text-xs font-semibold hover:bg-[#26262E] transition-colors">New Group</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalMsg && (
        <DeleteConfirmModal
          msg={deleteModalMsg}
          isMe={deleteModalMsg.senderId === user?.id}
          isAdmin={convDetail?.participants?.some((p: any) => p.userId === user?.id && p.role === "ADMIN") || false}
          onDeleteForEveryone={() => executeDelete(deleteModalMsg.id, "forEveryone")}
          onDeleteForMe={() => executeDelete(deleteModalMsg.id, "forMe")}
          onClose={() => setDeleteModalMsg(null)}
        />
      )}

      {/* Media Lightbox */}
      {activeLightbox && (
        <MediaLightbox
          url={activeLightbox.url}
          fileName={activeLightbox.fileName}
          onClose={() => setActiveLightbox(null)}
        />
      )}

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">New Direct Message</h3>
              <button onClick={() => setShowNewChat(false)}><X className="w-5 h-5 text-[#757582] hover:text-white" /></button>
            </div>
            <form onSubmit={handleStartChat}>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-[#B8B8C2] mb-1.5">MUSELY Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#FF4F9A] font-bold">@</span>
                  <input type="text" required autoFocus placeholder="e.g. shalini, aravind" value={newChatUsername} onChange={e => setNewChatUsername(e.target.value.replace(/^@/, ""))}
                    className="w-full pl-7 pr-3 py-2 rounded-xl bg-[#0B0B0D] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowNewChat(false)} className="px-4 py-2 rounded-xl bg-[#26262E] text-xs text-[#B8B8C2] hover:text-white">Cancel</button>
                <button type="submit" disabled={!newChatUsername.trim() || isStartingChat} className="px-5 py-2 rounded-xl bg-[#FF4F9A] text-xs text-white font-semibold disabled:opacity-50">{isStartingChat ? "Connecting…" : "Start Chat"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Group Modal */}
      {showNewGroup && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Create Group Chat</h3>
              <button onClick={() => setShowNewGroup(false)}><X className="w-5 h-5 text-[#757582] hover:text-white" /></button>
            </div>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#B8B8C2] mb-1.5">Group Name</label>
                <input type="text" required autoFocus placeholder="e.g. Creative Team" value={groupTitle} onChange={e => setGroupTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0B0B0D] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#B8B8C2] mb-1.5">Add Members</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#757582]" />
                  <input type="text" placeholder="Search by username…" value={groupMemberQuery} onChange={e => setGroupMemberQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#0B0B0D] text-xs text-white border border-[#303039] focus:border-[#FF4F9A] focus:outline-none" />
                </div>
                {groupMemberResults.length > 0 && (
                  <div className="mt-1 rounded-xl bg-[#26262E] border border-[#303039] overflow-hidden max-h-32 overflow-y-auto">
                    {groupMemberResults.map((u: any) => (
                      <button key={u.id} type="button" onClick={() => { setGroupMembers(p => [...p, u]); setGroupMemberQuery(""); setGroupMemberResults([]); }}
                        className="flex items-center gap-2 px-3 py-2 w-full hover:bg-[#303039] transition-colors text-left">
                        <Avatar url={u.avatarUrl} name={u.displayName} size="sm" />
                        <div><p className="text-xs text-white font-medium">{u.displayName}</p><p className="text-[10px] text-[#757582]">@{u.username}</p></div>
                      </button>
                    ))}
                  </div>
                )}
                {groupMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {groupMembers.map((m: any) => (
                      <span key={m.id} className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#FF4F9A]/20 border border-[#FF4F9A]/40 text-[10px] text-[#FF4F9A]">
                        {m.displayName}
                        <button type="button" onClick={() => setGroupMembers(p => p.filter((x: any) => x.id !== m.id))}><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowNewGroup(false)} className="px-4 py-2 rounded-xl bg-[#26262E] text-xs text-[#B8B8C2] hover:text-white">Cancel</button>
                <button type="submit" disabled={!groupTitle.trim() || groupMembers.length === 0 || isCreatingGroup}
                  className="px-5 py-2 rounded-xl bg-[#FF4F9A] text-xs text-white font-semibold disabled:opacity-50 flex items-center gap-1.5">
                  {isCreatingGroup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Forward Modal */}
      {showForwardModal && forwardMsg && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Forward Message</h3>
              <button onClick={() => { setShowForwardModal(false); setForwardMsg(null); }}><X className="w-5 h-5 text-[#757582] hover:text-white" /></button>
            </div>
            <div className="mb-4 p-3 rounded-xl bg-[#26262E] border border-[#303039] text-xs text-[#B8B8C2] truncate">
              <Forward className="w-3 h-3 inline mr-1 text-violet-400" />"{forwardMsg.content}"
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-[#B8B8C2] mb-1.5">Forward to…</label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {conversations.filter(c => c.id !== selectedConv?.id).map(c => {
                  const cName = getConvName(c, user?.id || "");
                  return (
                    <button key={c.id} type="button" onClick={() => setForwardTargetConv(c.id)}
                      className={clsx("flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-left transition-colors",
                        forwardTargetConv === c.id ? "bg-[#FF4F9A]/20 border border-[#FF4F9A]/40" : "hover:bg-[#26262E]")}>
                      <Avatar url={getConvAvatar(c)} name={cName} size="sm" />
                      <span className="text-xs text-white">{cName}</span>
                      {forwardTargetConv === c.id && <Check className="w-3.5 h-3.5 text-[#FF4F9A] ml-auto" />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowForwardModal(false); setForwardMsg(null); }} className="px-4 py-2 rounded-xl bg-[#26262E] text-xs text-[#B8B8C2] hover:text-white">Cancel</button>
              <button onClick={handleForward} disabled={!forwardTargetConv} className="px-5 py-2 rounded-xl bg-[#FF4F9A] text-xs text-white font-semibold disabled:opacity-50 flex items-center gap-1.5">
                <Forward className="w-3.5 h-3.5" /> Forward
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conv Info Modal */}
      {showConvInfo && selectedConv && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-white">{selectedConv.isGroup ? "Group Info" : "Contact Info"}</h3>
              <button onClick={() => setShowConvInfo(false)}><X className="w-5 h-5 text-[#757582] hover:text-white" /></button>
            </div>
            <div className="flex flex-col items-center mb-5">
              <Avatar url={getConvAvatar(selectedConv)} name={getConvName(selectedConv, user?.id || "")} size="lg" />
              <h4 className="mt-3 text-lg font-bold text-white">{getConvName(selectedConv, user?.id || "")}</h4>
              {!selectedConv.isGroup && selectedConv.otherUser && <p className="text-xs text-[#757582]">@{selectedConv.otherUser.username}</p>}
              {selectedConv.isGroup && <p className="text-xs text-[#757582]">{convDetail?.participants?.length || selectedConv.participantCount || 0} members</p>}
            </div>
            <div className="flex flex-wrap gap-2 justify-center mb-5">
              {selectedConv.isProtected && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px]">
                  <Lock className="w-3 h-3" /> Screenshot Protected
                </span>
              )}
              {selectedConv.disallowForwarding && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[10px]">
                  <Forward className="w-3 h-3" /> Forwarding Off
                </span>
              )}
            </div>
            {selectedConv.isGroup && convDetail?.participants && (
              <div className="mb-4">
                <p className="text-[10px] font-semibold text-[#757582] uppercase tracking-wider mb-2">Members</p>
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {convDetail.participants.map((p: any) => (
                    <div key={p.user?.id || p.id} className="flex items-center gap-2.5">
                      <Avatar url={p.user?.avatarUrl} name={p.user?.displayName} size="sm" />
                      <div className="flex-1">
                        <p className="text-xs text-white">{p.user?.displayName}</p>
                        <p className="text-[10px] text-[#757582]">@{p.user?.username}</p>
                      </div>
                      {p.role === "ADMIN" && <span className="text-[10px] text-[#FF4F9A] font-semibold">Admin</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!selectedConv.isGroup && selectedConv.otherUser && (
              <Link to={`/profile/${selectedConv.otherUser.username}`} onClick={() => setShowConvInfo(false)}
                className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-[#FF4F9A] text-white text-xs font-semibold hover:bg-[#FF72AD] transition-colors">
                <User className="w-4 h-4" /> View Full Profile
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
