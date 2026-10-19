import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Camera, Sun, Moon, Monitor, LogOut, Trash2, BadgeCheck,
  Shield, ChevronRight, Check,
} from 'lucide-react';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';
import type { Theme } from '@/contexts/ThemeContext';

export default function SettingsPage() {
  const { user, updateUser, logout, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [website, setWebsite] = useState(user?.website || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [coverUrl, setCoverUrl] = useState(user?.coverUrl || '');
  const [location, setLocation] = useState(user?.location || '');
  const [interests, setInterests] = useState(user?.interests || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Verification request state
  const [showVerifyForm, setShowVerifyForm] = useState(false);
  const [verifyReason, setVerifyReason] = useState('');
  const [verifyLinks, setVerifyLinks] = useState('');
  const [isSubmittingVerify, setIsSubmittingVerify] = useState(false);

  const handleImageUpload = async (file: File, type: 'avatar' | 'cover') => {
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    try {
      if (type === 'avatar') setIsUploadingAvatar(true);
      else setIsUploadingCover(true);
      const { data } = await api.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (type === 'avatar') {
        setAvatarUrl(data.imageUrl);
        toast.success('Avatar uploaded! Click Save to apply.');
      } else {
        setCoverUrl(data.imageUrl);
        toast.success('Cover image uploaded! Click Save to apply.');
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      if (type === 'avatar') setIsUploadingAvatar(false);
      else setIsUploadingCover(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.error('Display name cannot be empty');
      return;
    }
    try {
      setIsSaving(true);
      const { data } = await api.put('/users/profile/update', {
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        website: website.trim() || null,
        avatarUrl: avatarUrl || null,
        coverUrl: coverUrl || null,
        location: location.trim() || null,
        interests: interests.trim() || null,
        theme,
      });
      updateUser(data.user);
      toast.success('Profile updated successfully!');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    toast.success(`Theme switched to ${newTheme}`);
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyReason.trim().length < 20) {
      toast.error('Please provide a more detailed reason (at least 20 characters).');
      return;
    }
    try {
      setIsSubmittingVerify(true);
      const links = verifyLinks.split('\n').map(l => l.trim()).filter(Boolean);
      await api.post('/verify/request', { reason: verifyReason.trim(), links });
      toast.success('Verification request submitted! We typically review within 3–7 business days.');
      setShowVerifyForm(false);
      await refreshUser();
    } catch (err: any) {
      toast.error(err.response?.data?.error || getErrorMessage(err));
    } finally {
      setIsSubmittingVerify(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }
    try {
      await api.delete('/users/account/delete');
      await logout();
      toast.success('Account deleted. We\'re sorry to see you go.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const themeOptions: { value: Theme; label: string; icon: React.ReactNode; desc: string }[] = [
    { value: 'dark', label: 'Dark', icon: <Moon className="w-4 h-4" />, desc: 'Dark backgrounds, white text' },
    { value: 'light', label: 'Light', icon: <Sun className="w-4 h-4" />, desc: 'Light backgrounds, dark text' },
    { value: 'system', label: 'System', icon: <Monitor className="w-4 h-4" />, desc: 'Follows your device settings' },
  ];

  return (
    <div className="min-h-screen py-10 max-w-3xl mx-auto px-4 space-y-6">
      <div className="mb-2 pb-4 border-b border-[var(--border)]">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-charcoal-900 dark:text-charcoal-50">
          Account & Profile Settings
        </h1>
        <p className="text-sm text-charcoal-500 mt-1">
          Customize your public presence and preferences.
        </p>
      </div>

      {/* Profile Section */}
      <div className="bg-white dark:bg-charcoal-800 rounded-3xl border border-[var(--border)] overflow-hidden shadow-sm">
        {/* Cover image */}
        <div
          className="relative h-28 bg-gradient-to-br from-[#FF4F9A]/30 to-[#FF8FBD]/20 cursor-pointer group"
          onClick={() => coverInputRef.current?.click()}
        >
          {coverUrl && (
            <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className="w-6 h-6 text-white" />
            <span className="text-white text-sm ml-2 font-medium">Change cover</span>
          </div>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'cover')}
          />
          {isUploadingCover && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white text-sm">Uploading...</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSave} className="p-6 sm:p-8 space-y-6">
          {/* Avatar edit */}
          <div className="flex items-center gap-6 -mt-10">
            <div className="relative shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-20 h-20 rounded-full object-cover border-4 border-white dark:border-charcoal-800"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-accent-600 text-white font-bold text-xl flex items-center justify-center border-4 border-white dark:border-charcoal-800">
                  {displayName[0]?.toUpperCase() || 'M'}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2 rounded-full bg-charcoal-900 text-white hover:bg-black shadow-md transition-all"
                title="Change Avatar"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'avatar')}
              />
            </div>
            <div className="pt-10">
              <h3 className="font-semibold text-sm text-charcoal-900 dark:text-charcoal-50">
                Profile Photo
              </h3>
              <p className="text-xs text-charcoal-500 mt-0.5">
                {isUploadingAvatar ? 'Uploading...' : 'Square JPG or PNG, under 10MB.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Display Name *</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="input"
                maxLength={50}
              />
            </div>
            <div>
              <label className="label">Username</label>
              <input
                type="text"
                disabled
                value={`@${user?.username || ''}`}
                className="input opacity-60 cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="label">Bio</label>
            <textarea
              rows={3}
              placeholder="Tell the community about yourself..."
              value={bio}
              onChange={e => setBio(e.target.value)}
              className="textarea text-sm"
              maxLength={500}
            />
            <p className="text-xs text-charcoal-400 text-right mt-0.5">{bio.length}/500</p>
          </div>

          <div>
            <label className="label">Website / Portfolio</label>
            <input
              type="url"
              placeholder="https://yourportfolio.com"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              className="input"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">City / Region</label>
              <input
                type="text"
                placeholder="e.g. Bengaluru, Mumbai, Chennai"
                value={location}
                onChange={e => setLocation(e.target.value)}
                className="input"
                maxLength={80}
              />
            </div>
            <div>
              <label className="label">Interests (comma-separated)</label>
              <input
                type="text"
                placeholder="Photography, Art, Music, Tech..."
                value={interests}
                onChange={e => setInterests(e.target.value)}
                className="input"
                maxLength={200}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-[var(--border)]">
            <button type="submit" disabled={isSaving} className="btn-primary px-8">
              {isSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>

      {/* Appearance Section */}
      <div className="bg-white dark:bg-charcoal-800 rounded-3xl border border-[var(--border)] p-6 sm:p-8 shadow-sm">
        <h3 className="text-lg font-bold text-charcoal-900 dark:text-charcoal-50 mb-4">Appearance</h3>
        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleThemeChange(opt.value)}
              className={`relative p-4 rounded-2xl border-2 text-left transition-all ${
                theme === opt.value
                  ? 'border-accent-600 bg-accent-50 dark:bg-accent-950/40'
                  : 'border-[var(--border)] hover:border-charcoal-300 dark:hover:border-charcoal-500'
              }`}
            >
              {theme === opt.value && (
                <Check className="absolute top-2 right-2 w-4 h-4 text-accent-600" />
              )}
              <div className={`mb-2 ${theme === opt.value ? 'text-accent-600' : 'text-charcoal-400'}`}>
                {opt.icon}
              </div>
              <div className="font-semibold text-sm text-charcoal-900 dark:text-charcoal-50">{opt.label}</div>
              <div className="text-xs text-charcoal-400 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Verification Section */}
      {!user?.isVerified && (
        <div className="bg-white dark:bg-charcoal-800 rounded-3xl border border-[var(--border)] p-6 sm:p-8 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <BadgeCheck className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-bold text-charcoal-900 dark:text-charcoal-50">Request Verification</h3>
                <p className="text-xs text-charcoal-500 mt-0.5">
                  Get the MUSELY verified badge for your profile. Admin review required.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowVerifyForm(!showVerifyForm)}
              className="btn-secondary text-xs flex items-center gap-1"
            >
              Apply <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {showVerifyForm && (
            <form onSubmit={handleVerifySubmit} className="mt-6 space-y-4 pt-6 border-t border-[var(--border)]">
              <div>
                <label className="label">Why should you be verified? *</label>
                <textarea
                  rows={4}
                  required
                  minLength={20}
                  placeholder="Describe your work, audience, and why verification matters for your account (min. 20 chars)..."
                  value={verifyReason}
                  onChange={e => setVerifyReason(e.target.value)}
                  className="textarea text-sm"
                />
              </div>
              <div>
                <label className="label">Supporting Links (one per line, optional)</label>
                <textarea
                  rows={3}
                  placeholder="https://yourwebsite.com&#10;https://instagram.com/you&#10;https://linkedin.com/in/you"
                  value={verifyLinks}
                  onChange={e => setVerifyLinks(e.target.value)}
                  className="textarea text-sm"
                />
              </div>
              <p className="text-xs text-charcoal-400">
                ⓘ Verification is a manual process. Google login, email verification, or AI avatars do not automatically qualify an account. Review takes 3–7 business days.
              </p>
              <div className="flex gap-3">
                <button type="submit" disabled={isSubmittingVerify} className="btn-primary">
                  {isSubmittingVerify ? 'Submitting...' : 'Submit Request'}
                </button>
                <button type="button" onClick={() => setShowVerifyForm(false)} className="btn-ghost">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {user?.isVerified && (
        <div className="bg-white dark:bg-charcoal-800 rounded-3xl border border-[var(--border)] p-6 shadow-sm flex items-center gap-3">
          <BadgeCheck className="w-6 h-6 text-blue-500 shrink-0" />
          <div>
            <p className="font-semibold text-charcoal-900 dark:text-charcoal-50 text-sm">Verified Account</p>
            <p className="text-xs text-charcoal-500">Your MUSELY account has been verified.</p>
          </div>
        </div>
      )}

      {/* Security & Account */}
      <div className="bg-white dark:bg-charcoal-800 rounded-3xl border border-[var(--border)] p-6 sm:p-8 shadow-sm space-y-4">
        <h3 className="text-lg font-bold text-charcoal-900 dark:text-charcoal-50">Account</h3>

        <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-charcoal-400" />
            <div>
              <p className="text-sm font-semibold text-charcoal-800 dark:text-charcoal-200">Change Password</p>
              <p className="text-xs text-charcoal-500">Use Forgot Password on the sign-in page</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
          <div>
            <p className="text-sm font-semibold text-charcoal-800 dark:text-charcoal-200">Sign Out</p>
            <p className="text-xs text-charcoal-500">Sign out of your current session</p>
          </div>
          <button
            onClick={async () => { await logout(); toast.success('Signed out'); }}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>

        {/* Danger zone */}
        <div className="pt-2">
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="btn-ghost text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Account
            </button>
          ) : (
            <div className="p-4 rounded-2xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 space-y-3">
              <p className="text-sm font-semibold text-red-600">Permanently delete your account?</p>
              <p className="text-xs text-red-500">
                This action cannot be undone. All your posts, messages, and data will be permanently removed.
              </p>
              <p className="text-xs text-charcoal-500">Type <strong>DELETE</strong> to confirm:</p>
              <input
                type="text"
                placeholder="DELETE"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                className="input border-red-300 dark:border-red-700 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE'}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Delete My Account
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                  className="btn-ghost text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
