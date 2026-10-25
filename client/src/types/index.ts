export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  coverUrl?: string | null;
  bio: string | null;
  website: string | null;
  location?: string | null;
  interests?: string | null;
  theme?: 'dark' | 'light' | 'system';
  isVerified?: boolean;
  isAdmin?: boolean;
  isPrivate?: boolean;
  twoFactorEnabled?: boolean;
  lastSeenAt?: string | null;
  createdAt: string;
  _count?: {
    posts: number;
    followers: number;
    following: number;
  };
  isFollowing?: boolean;
  isFollowPending?: boolean;
  hasPendingRequestFrom?: boolean;
}

export interface Tag {
  id: string;
  name: string;
}

export type PostType = 'PHOTO' | 'VIDEO' | 'THOUGHT' | 'ART' | 'COMMUNITY' | 'DOCUMENT';
export type AudienceType = 'PUBLIC' | 'FOLLOWERS' | 'ONLY_ME';
export type DocType = 'PDF' | 'DOC' | 'DOCX' | 'IMAGE' | 'VIDEO' | 'AUDIO';

export interface Post {
  id: string;
  title: string;
  description: string | null;
  postType: PostType;
  imageUrl: string;
  videoUrl?: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  category: string;
  destUrl: string | null;
  communityId?: string | null;
  community?: { id: string; name: string; slug: string } | null;
  audience?: AudienceType;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  docType?: DocType | null;
  caption?: string | null;
  createdAt: string;
  updatedAt: string;
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'isPrivate'>;
  tags: Tag[];
  _count: {
    likes: number;
    savedBy: number;
    comments: number;
  };
  isLiked?: boolean;
  isSaved?: boolean;
}

export interface UserSettings {
  isPrivate: boolean;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  pushNotifications: boolean;
  allowComments: boolean;
  allowLikes: boolean;
  activityStatus: boolean;
  searchDiscoverable: boolean;
  profileVisible: boolean;
  analyticsTracking: boolean;
  showOnlineStatus?: boolean;
  showLastSeen?: boolean;
  showReadReceipts?: boolean;
  whoCanMessage?: 'EVERYONE' | 'FOLLOWERS' | 'NOBODY';
  whoCanAddToGroups?: 'EVERYONE' | 'FOLLOWERS' | 'NOBODY';
  allowForwarding?: boolean;
  hideNotificationPreview?: boolean;
  screenshotProtection?: boolean;
}

export interface FollowRequest {
  id: string;
  requesterId: string;
  targetId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  requester: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'bio'>;
}

export interface AnalyticsTrendPoint {
  date: string;
  views: number;
  interactions: number;
  followersGained: number;
}

export interface AnalyticsSummary {
  profileViews: { total: number; period: number };
  posts: { total: number; published: number };
  interactions: {
    period: { likes: number; comments: number; saves: number; shares: number; total: number };
    allTime: { likes: number; comments: number; saves: number; shares: number; total: number };
  };
  views: { period: number; total: number };
  followers: { total: number; gained: number; lost: number; net: number };
  engagementRate: { rate: number; formula: string };
  sessions: { totalSessions: number; totalActiveMinutes: number; avgSessionMinutes: number };
}

export interface AnalyticsTopPost {
  id: string;
  title: string;
  imageUrl: string;
  docType?: string | null;
  fileName?: string | null;
  audience: string;
  createdAt: string;
  likes: number;
  comments: number;
  saves: number;
  views: number;
  interactions: number;
  engagementRate: number;
}

export interface AnalyticsDashboardResponse {
  period: string;
  summary: AnalyticsSummary;
  topPosts: AnalyticsTopPost[];
  trends: AnalyticsTrendPoint[];
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  user?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  _count?: { posts: number };
  posts?: Array<{ post: { imageUrl: string } }>;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
}

export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'save' | 'message' | 'community';
  read: boolean;
  createdAt: string;
  postId: string | null;
  communityId?: string | null;
  sender: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'> | null;
}

export interface MessageReaction {
  id: string;
  emoji: string;
  userId: string;
  username: string;
  displayName: string;
}

export interface MessageAttachment {
  id?: string;
  fileId?: string | null;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  batchId?: string | null;
  batchName?: string | null;
}

export interface ConversationParticipantInfo {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  status: string;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  title?: string | null;
  displayName?: string;
  avatarUrl?: string | null;
  creatorId?: string | null;
  disallowForwarding?: boolean;
  isProtected?: boolean;
  updatedAt: string;
  myRole?: string;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  isMarkedUnread?: boolean;
  participantStatus?: string;
  lastReadAt?: string;
  participantCount?: number;
  participants?: ConversationParticipantInfo[];
  otherUser?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'lastSeenAt'> | null;
  lastMessage?: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
    isRead?: boolean;
    status?: string;
    hasAttachment?: boolean;
  } | null;
  unreadCount?: number;
  activeTyping?: string[];
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  isRead: boolean;
  status?: string;
  isEdited?: boolean;
  editedAt?: string | null;
  isDeleted?: boolean;
  isForwarded?: boolean;
  sender: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  replyTo?: {
    id: string;
    content: string;
    senderDisplayName: string;
    senderUsername: string;
  } | null;
  reactions?: MessageReaction[];
  attachments?: MessageAttachment[];
  deletedForUserIds?: string[];
}

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  imageUrl: string | null;
  isPublic: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  _count?: {
    members: number;
    posts: number;
    messages?: number;
  };
  isMember?: boolean;
  role?: 'ADMIN' | 'MODERATOR' | 'MEMBER';
}

export interface CommunityMessage {
  id: string;
  communityId: string;
  senderId: string;
  content: string;
  createdAt: string;
  sender: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasMore: boolean;
}

export interface PostsResponse {
  posts: Post[];
  pagination: PaginationMeta;
}

export interface SearchResponse {
  posts: Post[];
  users: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'bio' | '_count'>[];
  pagination: PaginationMeta;
}

export const CATEGORIES = [
  'All',
  'Thoughts',
  'Photos',
  'Videos',
  'Art',
  'Entertainment',
  'Technology',
  'Fashion',
  'Gaming',
  'Music',
  'Indian Culture',
  'Travel',
  'Food',
  'Architecture',
] as const;

export type Category = typeof CATEGORIES[number];
