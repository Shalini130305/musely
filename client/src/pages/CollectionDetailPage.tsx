import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Globe, Lock, Share2, Edit3, X, Eye } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PostCard } from '@/components/posts/PostCard';
import { ShareModal } from '@/components/share/ShareModal';
import type { Collection, Post } from '@/types';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Edit Collection state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPublic, setEditPublic] = useState(true);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const fetchCollection = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const { data } = await api.get(`/collections/${id}`);
      setCollection(data.collection);
      setPosts(data.posts || []);
      setEditName(data.collection.name);
      setEditDesc(data.collection.description || '');
      setEditPublic(data.collection.isPublic);
    } catch (err) {
      toast.error(getErrorMessage(err));
      navigate('/collections');
    } finally {
      setIsLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchCollection();
  }, [fetchCollection]);

  const handleDeleteCollection = async () => {
    if (!collection) return;
    if (!window.confirm(`Delete board "${collection.name}"? This action cannot be undone.`)) return;
    try {
      await api.delete(`/collections/${collection.id}`);
      toast.success('Collection deleted');
      navigate('/collections');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collection || !editName.trim()) return;
    try {
      setIsSavingEdit(true);
      const { data } = await api.put(`/collections/${collection.id}`, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
        isPublic: editPublic,
      });
      setCollection(prev => prev ? { ...prev, ...data.collection } : prev);
      toast.success('Board updated successfully');
      setShowEditModal(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleRemovePost = async (postId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!collection) return;
    try {
      await api.delete(`/collections/${collection.id}/posts/${postId}`);
      setPosts(prev => prev.filter(p => p.id !== postId));
      toast.success('Visual removed from board');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleShare = () => {
    setIsShareModalOpen(true);
  };

  const isOwner = user?.id === collection?.userId;

  if (isLoading || !collection) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 max-w-screen-2xl mx-auto px-4">
      <button
        onClick={() => navigate('/collections')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-charcoal-500 hover:text-charcoal-900 dark:hover:text-charcoal-100 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> All Boards
      </button>

      {/* Board Header */}
      <div className="mb-8 p-6 sm:p-8 rounded-3xl bg-cream-100 dark:bg-charcoal-800 border border-[var(--border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="badge-neutral text-xs">
              {collection.isPublic ? (
                <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> Public</span>
              ) : (
                <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Private</span>
              )}
            </span>
            <span className="text-xs text-charcoal-400">
              {posts.length} Visual{posts.length === 1 ? '' : 's'}
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-display font-bold text-charcoal-900 dark:text-charcoal-50">
            {collection.name}
          </h1>

          {collection.description && (
            <p className="text-sm text-charcoal-600 dark:text-charcoal-300 mt-2 max-w-xl">
              {collection.description}
            </p>
          )}

          {collection.user && (
            <div className="flex items-center gap-2 mt-4 text-xs text-charcoal-500">
              <span>Curated by</span>
              <Link to={`/profile/${collection.user.username}`} className="font-semibold text-charcoal-900 dark:text-charcoal-100 hover:underline">
                @{collection.user.username}
              </Link>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {isOwner && (
            <button
              onClick={() => setShowEditModal(true)}
              className="p-2.5 rounded-xl bg-white dark:bg-charcoal-700 text-charcoal-700 dark:text-charcoal-200 border border-[var(--border)] hover:bg-cream-200 transition-colors"
              title="Edit Board Settings"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleShare}
            className="p-2.5 rounded-xl bg-white dark:bg-charcoal-700 text-charcoal-700 dark:text-charcoal-200 border border-[var(--border)] hover:bg-cream-200 transition-colors"
            title="Share Board Link"
          >
            <Share2 className="w-4 h-4" />
          </button>
          {isOwner && (
            <button
              onClick={handleDeleteCollection}
              className="p-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 transition-colors"
              title="Delete Board"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Visuals Grid */}
      {posts.length === 0 ? (
        <div className="text-center py-20 text-charcoal-400">
          <p className="text-base font-semibold mb-1">This board is currently empty</p>
          <p className="text-xs">Browse the home feed or explore to save visuals into this collection.</p>
        </div>
      ) : (
        <div className="masonry-grid max-w-screen-2xl mx-auto">
          {posts.map(post => (
            <div key={post.id} className="relative group">
              <PostCard post={post} />
              {isOwner && (
                <button
                  type="button"
                  onClick={(e) => handleRemovePost(post.id, e)}
                  className="absolute top-2 left-2 z-10 p-1.5 rounded-full bg-black/70 text-white hover:bg-red-600 transition-all opacity-0 group-hover:opacity-100"
                  title="Remove from this board"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit Collection Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4 text-charcoal-900 dark:text-charcoal-50">
              Edit Board
            </h3>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="label">Board Name *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="input"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="label">Description (Optional)</label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  className="textarea text-sm"
                  maxLength={500}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="editIsPublic"
                  checked={editPublic}
                  onChange={e => setEditPublic(e.target.checked)}
                  className="rounded text-accent-600 focus:ring-accent-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="editIsPublic" className="text-xs text-charcoal-700 dark:text-charcoal-300 select-none cursor-pointer">
                  Public Board (visible on your public profile)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit || !editName.trim()}
                  className="btn-primary text-xs"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {collection && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          item={{
            id: collection.id,
            type: 'collection',
            title: `${collection.name} Board on MUSELY`,
            text: collection.description || `Discover the "${collection.name}" collection on MUSELY`,
            url: `${window.location.origin}/collections/${collection.id}`,
            canDownload: false,
          }}
        />
      )}
    </div>
  );
}
