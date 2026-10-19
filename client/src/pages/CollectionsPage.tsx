import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FolderHeart, Lock, Globe } from 'lucide-react';
import type { Collection } from '@/types';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCollections = async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/collections');
      setCollections(data.collections || []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Board name is required');
      return;
    }
    try {
      setIsSubmitting(true);
      const { data } = await api.post('/collections', {
        name: name.trim(),
        description: description.trim() || undefined,
        isPublic,
      });
      setCollections(prev => [data.collection, ...prev]);
      toast.success('Collection created!');
      setName('');
      setDescription('');
      setShowModal(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen py-8 max-w-screen-2xl mx-auto px-4">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-charcoal-900 dark:text-charcoal-50">
            Your Collections
          </h1>
          <p className="text-sm text-charcoal-500 mt-1">
            Thematic boards to organize moodboards, visual assets, and style guides.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary rounded-xl"
        >
          <Plus className="w-4 h-4" />
          New Board
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-accent-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : collections.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-16 h-16 rounded-2xl bg-cream-200 dark:bg-charcoal-800 flex items-center justify-center mx-auto mb-4 text-charcoal-400">
            <FolderHeart className="w-8 h-8 text-accent-600" />
          </div>
          <h3 className="text-lg font-semibold text-charcoal-800 dark:text-charcoal-100 mb-2">
            No collections yet
          </h3>
          <p className="text-sm text-charcoal-500 max-w-sm mx-auto mb-6">
            Group your favorite visuals into themed boards like "Minimal Architecture" or "Summer Color Palette".
          </p>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            Create First Board
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {collections.map(col => (
            <Link
              key={col.id}
              to={`/collections/${col.id}`}
              className="card group p-3 border border-[var(--border)] hover:shadow-lg transition-all flex flex-col justify-between"
            >
              <div>
                <div className="aspect-[4/3] rounded-xl bg-cream-200 dark:bg-charcoal-700 overflow-hidden mb-3">
                  {col.posts?.[0]?.post?.imageUrl ? (
                    <img
                      src={col.posts[0].post.imageUrl}
                      alt={col.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-charcoal-400 text-xs">
                      No visuals yet
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-base text-charcoal-900 dark:text-charcoal-50 truncate group-hover:text-accent-600 transition-colors">
                    {col.name}
                  </h3>
                  {col.isPublic ? (
                    <span title="Public"><Globe className="w-3.5 h-3.5 text-charcoal-400" /></span>
                  ) : (
                    <span title="Private"><Lock className="w-3.5 h-3.5 text-charcoal-400" /></span>
                  )}
                </div>

                {col.description && (
                  <p className="text-xs text-charcoal-500 line-clamp-2 mb-2">
                    {col.description}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-[var(--border)] text-xs text-charcoal-400 flex justify-between items-center">
                <span>{col._count?.posts || 0} visual{col._count?.posts === 1 ? '' : 's'}</span>
                <span>{new Date(col.createdAt).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* New Collection Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4 text-charcoal-900 dark:text-charcoal-50">
              Create New Board
            </h3>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label">Board Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Modern Ceramics, Outfit Ideas"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="input"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="label">Description (Optional)</label>
                <textarea
                  rows={3}
                  placeholder="What is this board about?"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="textarea text-sm"
                  maxLength={500}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={isPublic}
                  onChange={e => setIsPublic(e.target.checked)}
                  className="rounded text-accent-600 focus:ring-accent-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="isPublic" className="text-xs text-charcoal-700 dark:text-charcoal-300 select-none cursor-pointer">
                  Public Board (visible to other creators)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="btn-primary text-xs"
                >
                  {isSubmitting ? 'Creating...' : 'Create Board'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
