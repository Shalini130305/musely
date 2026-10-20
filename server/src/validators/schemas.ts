import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  displayName: z.string().min(1, 'Display name is required').max(50, 'Display name too long'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password too long'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(500).optional().nullable(),
  website: z.string().url('Invalid URL').optional().nullable().or(z.literal('')),
  location: z.string().max(100).optional().nullable(),
  interests: z.string().max(1000).optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
  coverUrl: z.string().optional().nullable(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
});

export const updateSettingsSchema = z.object({
  isPrivate: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  inAppNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  allowComments: z.boolean().optional(),
  allowLikes: z.boolean().optional(),
  activityStatus: z.boolean().optional(),
  searchDiscoverable: z.boolean().optional(),
  profileVisible: z.boolean().optional(),
  analyticsTracking: z.boolean().optional(),
});

export const createPostSchema = z.object({
  title: z.string().min(1, 'Title or thought is required').max(300, 'Title too long'),
  description: z.string().max(5000).optional(),
  postType: z.enum(['PHOTO', 'VIDEO', 'THOUGHT', 'ART', 'COMMUNITY']).default('PHOTO'),
  imageUrl: z.string().optional().nullable().default(''),
  videoUrl: z.string().optional().nullable(),
  imageWidth: z.number().int().positive().optional(),
  imageHeight: z.number().int().positive().optional(),
  cloudinaryId: z.string().optional(),
  category: z.string().default('General'),
  destUrl: z.string().url().optional().nullable().or(z.literal('')),
  communityId: z.string().optional().nullable(),
  audience: z.enum(['PUBLIC', 'FOLLOWERS', 'ONLY_ME']).default('PUBLIC'),
  fileUrl: z.string().optional().nullable(),
  fileName: z.string().max(255).optional().nullable(),
  fileType: z.string().max(100).optional().nullable(),
  fileSize: z.number().int().nonnegative().optional().nullable(),
  docType: z.enum(['PDF', 'DOC', 'DOCX', 'IMAGE', 'VIDEO', 'AUDIO']).optional().nullable(),
  caption: z.string().max(1000).optional().nullable(),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

export const updatePostSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional().nullable(),
  postType: z.enum(['PHOTO', 'VIDEO', 'THOUGHT', 'ART', 'COMMUNITY']).optional(),
  imageUrl: z.string().optional().nullable(),
  videoUrl: z.string().optional().nullable(),
  imageWidth: z.number().int().positive().optional(),
  imageHeight: z.number().int().positive().optional(),
  cloudinaryId: z.string().optional(),
  category: z.string().optional(),
  destUrl: z.string().url().optional().nullable().or(z.literal('')),
  audience: z.enum(['PUBLIC', 'FOLLOWERS', 'ONLY_ME']).optional(),
  fileUrl: z.string().optional().nullable(),
  fileName: z.string().max(255).optional().nullable(),
  fileType: z.string().max(100).optional().nullable(),
  fileSize: z.number().int().nonnegative().optional().nullable(),
  docType: z.enum(['PDF', 'DOC', 'DOCX', 'IMAGE', 'VIDEO', 'AUDIO']).optional().nullable(),
  caption: z.string().max(1000).optional().nullable(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const createCollectionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().default(true),
});

export const updateCollectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  isPublic: z.boolean().optional(),
});

export const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(1000),
});

export const createMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(2000),
});

export const createCommunitySchema = z.object({
  name: z.string().min(2, 'Community name must be at least 2 characters').max(60),
  description: z.string().max(1000).optional(),
  category: z.string().default('General'),
  imageUrl: z.string().optional().nullable(),
  isPublic: z.boolean().default(true),
});

export const createReportSchema = z.object({
  targetType: z.enum(['POST', 'USER', 'COMMUNITY', 'MESSAGE']),
  targetId: z.string().min(1),
  reason: z.string().min(3, 'Please provide a valid reason').max(500),
});

export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).default('20'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
