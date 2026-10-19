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
  createdAt: string;
  _count?: {
    posts: number;
    followers: number;
    following: number;
  };
  isFollowing?: boolean;
}


export interface Tag {
  id: string;
  name: string;
}

export type PostType = 'PHOTO' | 'VIDEO' | 'THOUGHT' | 'ART' | 'COMMUNITY';

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
  createdAt: string;
  updatedAt: string;
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  tags: Tag[];
  _count: {
    likes: number;
    savedBy: number;
    comments: number;
  };
  isLiked?: boolean;
  isSaved?: boolean;
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

export interface Conversation {
  id: string;
  updatedAt: string;
  lastReadAt?: string;
  otherUser?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  lastMessage?: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
  } | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  read: boolean;
  createdAt: string;
  sender: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
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
