import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Heart, Bookmark, BookmarkCheck, Share2, ExternalLink,
  Edit3, Trash2, ArrowLeft, MessageSquare, Send, Plus, Check
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { MasonryGrid } from '@/components/posts/MasonryGrid';
import type { Post, Comment, Collection } from '@/types';
import api, { getErrorMessage } from '@/services/api';
import { handleImageError } from '@/utils/imageFallback';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Like & Save local state
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);

  // Collections modal state
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [userCollections, setUserCollections] = useState<Collection[]>([]);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);

  const fetchPostData = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const [postRes, commentsRes] = await Promise.all([
        api.get(`/posts/${id}`),
        api.get(`/posts/${id}/comments`),
      ]);

      const postData = postRes.data.post;
      setPost(postData);
      setRelatedPosts(postRes.data.related || []);
      setComments(commentsRes.data.comments || []);

      setIsLiked(postData.isLiked || false);
      setLikeCount(postData._count?.likes || 0);
      setIsSaved(postData.isSaved || false);

      // Check author follow status if authenticated
      if (isAuthenticated && postData.author.id !== user?.id) {
        try {
          const profileRes = await api.get(`/users/${postData.author.username}`);
          setIsFollowing(profileRes.data.user.isFollowing || false);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
      navigate('/');
    } finally {
      setIsLoading(false);
    }
  }, [id, isAuthenticated, user?.id, navigate]);

  useEffect(() => {
    fetchPostData();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [fetchPostData]);

  const handleLike = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!post) return;
    try {
      const { data } = await api.post(`/posts/${post.id}/like`);
      setIsLiked(data.liked);
      setLikeCount(data.count);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleQuickSave = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!post) return;
    try {
      const { data } = await api.post(`/posts/${post.id}/save`);
      setIsSaved(data.saved);
      toast.success(data.saved ? 'Saved to your profile' : 'Removed from saved');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleFollow = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!post) return;
    try {
      const { data } = await api.post(`/users/${post.author.username}/follow`);
      setIsFollowing(data.following);
      toast.success(data.following ? `Following ${post.author.displayName}` : `Unfollowed ${post.author.displayName}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied to clipboard!');
  };

  const handleDelete = async () => {
    if (!post) return;
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    try {
      await api.delete(`/posts/${post.id}`);
      toast.success('Post deleted');
      navigate('/');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!newComment.trim() || !post) return;

    try {
      setIsSubmittingComment(true);
      const { data } = await api.post(`/posts/${post.id}/comments`, {
        content: newComment.trim(),
      });
      setComments(prev => [data.comment, ...prev]);
      setNewComment('');
      toast.success('Comment added');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const openCollectionModal = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    try {
      const { data } = await api.get('/collections');
      setUserCollections(data.collections || []);
      setShowCollectionModal(true);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleAddToCollection = async (collectionId: string) => {
    if (!post) return;
    try {
      await api.post(`/collections/${collectionId}/posts/${post.id}`);
      toast.success('Added to collection!');
      setShowCollectionModal(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName.trim() || !post) return;
    try {
      setIsCreatingCollection(true);
      const { data } = await api.post('/collections', {
        name: newCollectionName.trim(),
        isPublic: true,
      });
      await api.post(`/collections/${data.collection.id}/posts/${post.id}`);
      toast.success(`Created "${newCollectionName}" and added post!`);
      setNewCollectionName('');
      setShowCollectionModal(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsCreatingCollection(false);
    }
  };

  if (isLoading || !post) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isOwner = user?.id === post.author.id;

  return (
    <div className="min-h-screen py-6 max-w-6xl mx-auto px-4">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-charcoal-500 hover:text-charcoal-900 dark:hover:text-charcoal-100 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* Main Post Card Layout */}
      <div className="bg-white dark:bg-charcoal-800 rounded-3xl border border-[var(--border)] shadow-xl overflow-hidden mb-16">
        <div className="grid grid-cols-1 md:grid-cols-12">
          {/* Left: Image Container */}
          <div className="md:col-span-7 bg-cream-100 dark:bg-charcoal-900 flex items-center justify-center p-4 sm:p-8">
            <div className="relative w-full max-h-[80vh] flex items-center justify-center rounded-2xl overflow-hidden shadow-sm">
              <img
                src={post.imageUrl}
                alt={post.title}
                onError={handleImageError}
                className="w-full h-auto max-h-[75vh] object-contain rounded-2xl"
              />
            </div>
          </div>

          {/* Right: Details & Discussion */}
          <div className="md:col-span-5 p-6 sm:p-8 flex flex-col justify-between border-t md:border-t-0 md:border-l border-[var(--border)]">
            <div>
              {/* Header Actions */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleLike}
                    className={clsx(
                      'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all',
                      isLiked
                        ? 'bg-accent-600 text-white'
                        : 'bg-cream-100 dark:bg-charcoal-700 text-charcoal-700 dark:text-charcoal-200 hover:bg-cream-200'
                    )}
                  >
                    <Heart className={clsx('w-4 h-4', isLiked && 'fill-current')} />
                    <span>{likeCount}</span>
                  </button>
                  <button
                    onClick={handleShare}
                    className="p-2 rounded-xl bg-cream-100 dark:bg-charcoal-700 text-charcoal-600 dark:text-charcoal-300 hover:bg-cream-200 transition-colors"
                    title="Share link"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleQuickSave}
                    className={clsx(
                      'inline-flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-semibold transition-all',
                      isSaved
                        ? 'bg-charcoal-900 text-white dark:bg-white dark:text-charcoal-900'
                        : 'bg-accent-600 text-white hover:bg-accent-700'
                    )}
                  >
                    {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                    <span>{isSaved ? 'Saved' : 'Save'}</span>
                  </button>
                  <button
                    onClick={openCollectionModal}
                    className="p-2 rounded-xl border border-[var(--border)] text-charcoal-600 dark:text-charcoal-300 hover:bg-cream-100 dark:hover:bg-charcoal-700 text-xs font-medium"
                    title="Save to Collection"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Title & Category */}
              <div className="mb-4">
                <span className="badge-accent mb-2">
                  {post.category}
                </span>
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-charcoal-900 dark:text-charcoal-50 mt-1">
                  {post.title}
                </h1>
              </div>

              {/* Description */}
              {post.description && (
                <p className="text-sm text-charcoal-600 dark:text-charcoal-300 leading-relaxed mb-6 whitespace-pre-line">
                  {post.description}
                </p>
              )}

              {/* Destination Link */}
              {post.destUrl && (
                <a
                  href={post.destUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cream-100 dark:bg-charcoal-700 text-xs font-medium text-accent-600 dark:text-accent-400 hover:underline mb-6"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Visit source site
                </a>
              )}

              {/* Tags */}
              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-6">
                  {post.tags.map(t => (
                    <Link
                      key={t.id}
                      to={`/search?q=${encodeURIComponent(t.name)}`}
                      className="tag"
                    >
                      #{t.name}
                    </Link>
                  ))}
                </div>
              )}

              {/* Author Row */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-cream-50 dark:bg-charcoal-700/50 border border-[var(--border)] mb-6">
                <Link
                  to={`/profile/${post.author.username}`}
                  className="flex items-center gap-3 group"
                >
                  {post.author.avatarUrl ? (
                    <img
                      src={post.author.avatarUrl}
                      alt={post.author.displayName}
                      className="w-11 h-11 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-accent-600 text-white font-bold flex items-center justify-center text-sm">
                      {post.author.displayName[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-semibold text-charcoal-900 dark:text-charcoal-100 group-hover:text-accent-600 transition-colors">
                      {post.author.displayName}
                    </h4>
                    <p className="text-xs text-charcoal-500">@{post.author.username}</p>
                  </div>
                </Link>

                {!isOwner ? (
                  <button
                    onClick={handleFollow}
                    className={clsx(
                      'px-4 py-1.5 rounded-xl text-xs font-semibold transition-all',
                      isFollowing
                        ? 'bg-cream-200 dark:bg-charcoal-600 text-charcoal-800 dark:text-charcoal-200'
                        : 'bg-accent-600 text-white hover:bg-accent-700'
                    )}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/post/${post.id}/edit`}
                      className="p-2 rounded-xl text-charcoal-600 hover:bg-cream-200 dark:hover:bg-charcoal-600"
                      title="Edit Post"
                    >
                      <Edit3 className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={handleDelete}
                      className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                      title="Delete Post"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Comments Section */}
            <div className="border-t border-[var(--border)] pt-6 mt-6">
              <h3 className="text-sm font-bold text-charcoal-900 dark:text-charcoal-100 mb-4 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Comments ({comments.length})
              </h3>

              {/* Comment Input */}
              <form onSubmit={handleCommentSubmit} className="flex gap-2 mb-6">
                <input
                  type="text"
                  placeholder={isAuthenticated ? "Add thoughts or feedback..." : "Sign in to leave a comment"}
                  disabled={!isAuthenticated || isSubmittingComment}
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  className="input py-2 text-xs rounded-xl flex-1"
                />
                <button
                  type="submit"
                  disabled={!isAuthenticated || !newComment.trim() || isSubmittingComment}
                  className="btn-primary px-3 py-2 rounded-xl"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>

              {/* Comment List */}
              <div className="space-y-4 max-h-60 overflow-y-auto pr-1">
                {comments.length === 0 ? (
                  <p className="text-xs text-charcoal-400 italic">No comments yet. Start the conversation!</p>
                ) : (
                  comments.map(c => (
                    <div key={c.id} className="flex gap-2.5 text-xs">
                      {c.user.avatarUrl ? (
                        <img src={c.user.avatarUrl} alt={c.user.displayName} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-cream-300 dark:bg-charcoal-600 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                          {c.user.displayName[0]}
                        </div>
                      )}
                      <div className="flex-1 bg-cream-50 dark:bg-charcoal-700/40 p-2.5 rounded-2xl">
                        <div className="flex items-center justify-between mb-1">
                          <Link to={`/profile/${c.user.username}`} className="font-semibold text-charcoal-900 dark:text-charcoal-200 hover:underline">
                            {c.user.displayName}
                          </Link>
                          <span className="text-[10px] text-charcoal-400">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-charcoal-700 dark:text-charcoal-300">{c.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save to Collection Modal */}
      {showCollectionModal && (
        <div className="modal-overlay" onClick={() => setShowCollectionModal(false)}>
          <div className="modal-content p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4 text-charcoal-900 dark:text-charcoal-100">
              Save to Collection
            </h3>

            {/* Existing collections */}
            <div className="space-y-2 mb-6 max-h-56 overflow-y-auto">
              {userCollections.length === 0 ? (
                <p className="text-xs text-charcoal-400">You don't have any collections yet.</p>
              ) : (
                userCollections.map(col => (
                  <button
                    key={col.id}
                    onClick={() => handleAddToCollection(col.id)}
                    className="w-full flex items-center justify-between p-3 rounded-2xl border border-[var(--border)] hover:bg-cream-100 dark:hover:bg-charcoal-800 transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-charcoal-800 dark:text-charcoal-100">{col.name}</p>
                      <p className="text-xs text-charcoal-400">{col._count?.posts || 0} items</p>
                    </div>
                    <span className="btn-secondary text-xs px-3 py-1">Save</span>
                  </button>
                ))
              )}
            </div>

            {/* Create new collection inside modal */}
            <form onSubmit={handleCreateCollection} className="border-t border-[var(--border)] pt-4">
              <label className="label text-xs">Create New Board</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Modern Architecture..."
                  value={newCollectionName}
                  onChange={e => setNewCollectionName(e.target.value)}
                  className="input py-2 text-xs"
                />
                <button
                  type="submit"
                  disabled={isCreatingCollection || !newCollectionName.trim()}
                  className="btn-primary px-4 py-2 text-xs rounded-xl whitespace-nowrap"
                >
                  Create & Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Related Posts Section */}
      {relatedPosts.length > 0 && (
        <div>
          <h2 className="text-xl font-display font-bold mb-6 text-charcoal-900 dark:text-charcoal-50">
            More in {post.category}
          </h2>
          <MasonryGrid posts={relatedPosts} />
        </div>
      )}
    </div>
  );
}
