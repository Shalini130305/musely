import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Camera, Sun, Moon, Monitor, LogOut, Trash2, BadgeCheck,
  Shield, Check, User as UserIcon, Lock, Globe, Bell,
  MessageSquare, Heart, Activity, Search, Eye, BarChart2,
  Users, CheckCircle2, XCircle, AlertCircle, Sparkles,
  Smartphone, Copy, Download, KeyRound, QrCode, ShieldAlert, Laptop, ShieldCheck
} from 'lucide-react';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import type { Theme } from '@/contexts/ThemeContext';
import type { UserSettings, FollowRequest } from '@/types';
import { SCREENSHOT_DISCLAIMER } from '@/utils/screenSecurity';

type TabKey = 'profile' | 'privacy' | 'preferences' | 'verification' | 'danger';

export default function SettingsPage() {
  const { user, updateUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('profile');

  // Profile state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [website, setWebsite] = useState(user?.website || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [coverUrl, setCoverUrl] = useState(user?.coverUrl || '');
  const [location, setLocation] = useState(user?.location || '');
  const [interests, setInterests] = useState(user?.interests || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Settings & Toggles state
  const [settings, setSettings] = useState<UserSettings>({
    isPrivate: user?.isPrivate ?? false,
    emailNotifications: true,
    inAppNotifications: true,
    pushNotifications: false,
    allowComments: true,
    allowLikes: true,
    activityStatus: true,
    searchDiscoverable: true,
    profileVisible: true,
    analyticsTracking: true,
  });
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  // Follow requests state
  const [pendingRequests, setPendingRequests] = useState<FollowRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);

  // Verification request state
  const [showVerifyForm, setShowVerifyForm] = useState(false);
  const [verifyReason, setVerifyReason] = useState('');
  const [verifyLinks, setVerifyLinks] = useState('');
  const [isSubmittingVerify, setIsSubmittingVerify] = useState(false);

  // Danger zone state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Two-Step Verification (TOTP) state
  const [is2FAEnabled, setIs2FAEnabled] = useState(user?.twoFactorEnabled ?? false);
  const [remainingRecoveryCount, setRemainingRecoveryCount] = useState<number>(0);
  const [show2FASetupModal, setShow2FASetupModal] = useState(false);
  const [twoFactorSecret, setTwoFactorSecret] = useState('');
  const [twoFactorOtpauth, setTwoFactorOtpauth] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [generatedRecoveryCodes, setGeneratedRecoveryCodes] = useState<string[]>([]);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showDisable2FAModal, setShowDisable2FAModal] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [isSubmitting2FA, setIsSubmitting2FA] = useState(false);

  // Active Sessions state
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // Load user settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoadingSettings(true);
        const { data } = await api.get('/users/settings/me');
        if (data.settings) {
          setSettings(data.settings);
        }
      } catch (err) {
        loggerError('Failed to fetch settings', err);
      } finally {
        setIsLoadingSettings(false);
      }
    };

    fetchSettings();
  }, []);

  // Fetch pending follow requests if user is private or on privacy tab
  const fetchFollowRequests = async () => {
    try {
      setIsLoadingRequests(true);
      const { data } = await api.get('/users/requests/pending');
      setPendingRequests(data.requests || []);
    } catch {
      // quiet
    } finally {
      setIsLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'privacy') {
      fetchFollowRequests();
    } else if (activeTab === 'danger') {
      fetch2FAStatus();
      fetchSessions();
    }
  }, [activeTab]);

  const fetch2FAStatus = async () => {
    try {
      const { data } = await api.get('/auth/2fa/status');
      setIs2FAEnabled(data.enabled);
      setRemainingRecoveryCount(data.remainingRecoveryCodes);
    } catch {
      // quiet
    }
  };

  const fetchSessions = async () => {
    try {
      setIsLoadingSessions(true);
      const { data } = await api.get('/auth/sessions');
      setSessions(data.sessions || []);
    } catch {
      // quiet
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleStart2FASetup = async () => {
    try {
      setIsSubmitting2FA(true);
      const { data } = await api.post('/auth/2fa/setup');
      setTwoFactorSecret(data.secret);
      setTwoFactorOtpauth(data.otpauthUrl);
      setGeneratedRecoveryCodes(data.recoveryCodes || []);
      setSetupCode('');
      setShow2FASetupModal(true);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting2FA(false);
    }
  };

  const handleConfirm2FASetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupCode || setupCode.trim().length !== 6) {
      toast.error('Please enter the 6-digit code from your authenticator app');
      return;
    }
    try {
      setIsSubmitting2FA(true);
      await api.post('/auth/2fa/confirm-setup', { code: setupCode.trim() });
      setIs2FAEnabled(true);
      setShow2FASetupModal(false);
      setShowRecoveryModal(true);
      toast.success('Two-step verification activated!');
      if (user) updateUser({ ...user, twoFactorEnabled: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting2FA(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword) {
      toast.error('Password is required to disable 2FA');
      return;
    }
    try {
      setIsSubmitting2FA(true);
      await api.post('/auth/2fa/disable', { password: disablePassword });
      setIs2FAEnabled(false);
      setShowDisable2FAModal(false);
      setDisablePassword('');
      toast.success('Two-step verification disabled');
      if (user) updateUser({ ...user, twoFactorEnabled: false });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting2FA(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await api.delete(`/auth/sessions/${sessionId}`);
      toast.success('Session logged out');
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleRevokeOtherSessions = async () => {
    try {
      await api.delete('/auth/sessions-other');
      toast.success('All other sessions logged out');
      fetchSessions();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.error('Display name cannot be empty');
      return;
    }
    try {
      setIsSavingProfile(true);
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
      setIsSavingProfile(false);
    }
  };

  const handleToggleSetting = async (key: keyof UserSettings) => {
    const updatedValue = !settings[key];
    const newSettings = { ...settings, [key]: updatedValue };
    setSettings(newSettings);

    try {
      setIsUpdatingSettings(true);
      const { data } = await api.put('/users/settings', {
        [key]: updatedValue,
      });
      if (key === 'isPrivate' && user) {
        updateUser({ ...user, isPrivate: updatedValue });
      }
      toast.success(
        key === 'isPrivate'
          ? updatedValue
            ? 'Account set to Private (Approved followers only)'
            : 'Account set to Public (Visible to everyone)'
          : 'Setting preference saved'
      );
    } catch (err) {
      // Revert on failure
      setSettings(settings);
      toast.error(getErrorMessage(err));
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    try {
      await api.post(`/users/requests/${requestId}/approve`);
      toast.success('Follow request approved!');
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await api.post(`/users/requests/${requestId}/reject`);
      toast.success('Follow request declined');
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyReason.trim().length < 20) {
      toast.error('Please provide a more detailed reason (at least 20 characters).');
      return;
    }
    try {
      setIsSubmittingVerify(true);
      await api.post('/verify/request', {
        reason: verifyReason.trim(),
        links: verifyLinks ? verifyLinks.split('\n').map(l => l.trim()).filter(Boolean) : [],
      });
      toast.success('Verification request submitted for review!');
      setShowVerifyForm(false);
      setVerifyReason('');
      setVerifyLinks('');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmittingVerify(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    try {
      await api.delete('/users/account/delete');
      await logout();
      toast.success('Account permanently deleted');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  function loggerError(msg: string, err: any) {
    console.error(msg, err);
  }

  interface TabItem {
    key: 'profile' | 'privacy' | 'preferences' | 'verification' | 'danger';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }

  const tabs: TabItem[] = [
    { key: 'profile', label: 'Profile & Bio', icon: UserIcon },
    {
      key: 'privacy',
      label: 'Account Privacy',
      icon: Lock,
      badge: pendingRequests.length > 0 ? pendingRequests.length : undefined,
    },
    { key: 'preferences', label: 'Controls & Toggles', icon: Activity },
    { key: 'verification', label: 'Creator Verification', icon: BadgeCheck },
    { key: 'danger', label: 'Security & Danger Zone', icon: Shield },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-display text-white">Settings & Preferences</h1>
        <p className="text-xs text-[#B8B8C2]">
          Manage your account privacy, creator controls, notifications, and profile details.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#303039] overflow-x-auto gap-2 mb-8 pb-1 scrollbar-none">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all',
                isActive
                  ? 'bg-[#FF4F9A] text-white shadow-md'
                  : 'text-[#B8B8C2] hover:text-white hover:bg-[#1C1C22]'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.badge && (
                <span className="w-4 h-4 rounded-full bg-white text-[#FF4F9A] text-[10px] font-bold flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Profile & Bio */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-6 animate-fade-in">
          {/* Avatar & Cover Section */}
          <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl p-6 shadow-md">
            <h3 className="text-base font-bold text-white mb-4">Profile Visuals</h3>

            {/* Cover Image */}
            <div className="relative h-32 rounded-2xl bg-[#26262E] overflow-hidden mb-6 border border-[#303039]">
              {coverUrl ? (
                <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-[#B8B8C2]">
                  Add a custom header banner
                </div>
              )}
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={isUploadingCover}
                className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
                {isUploadingCover ? 'Uploading...' : 'Change Cover'}
              </button>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'cover')}
              />
            </div>

            {/* Avatar Image */}
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 rounded-full bg-[#FF4F9A] flex items-center justify-center text-white text-2xl font-bold shadow-md border-2 border-[#1C1C22]">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="w-full h-full rounded-full object-cover" />
                ) : (
                  displayName[0]?.toUpperCase() || 'U'
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="absolute bottom-0 right-0 p-1.5 rounded-full bg-[#FF4F9A] text-white shadow hover:scale-110 transition-transform"
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

              <div>
                <h4 className="text-sm font-semibold text-white">{displayName || 'User'}</h4>
                <p className="text-xs text-[#B8B8C2]">JPG, PNG, WebP or GIF up to 15MB</p>
              </div>
            </div>
          </div>

          {/* Details Form */}
          <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl p-6 shadow-md space-y-4">
            <h3 className="text-base font-bold text-white mb-2">Basic Details</h3>

            <div>
              <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-[#141418] border border-[#303039] text-white text-sm focus:border-[#FF4F9A] outline-none"
                placeholder="Your Name"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">Bio</label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 rounded-2xl bg-[#141418] border border-[#303039] text-white text-sm focus:border-[#FF4F9A] outline-none"
                placeholder="Tell your creative story..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">Website</label>
                <input
                  type="url"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#141418] border border-[#303039] text-white text-sm focus:border-[#FF4F9A] outline-none"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#141418] border border-[#303039] text-white text-sm focus:border-[#FF4F9A] outline-none"
                  placeholder="e.g. Mumbai, India"
                />
              </div>
            </div>

            {/* Theme Selector */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-[#B8B8C2] mb-2">Interface Theme</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'dark', label: 'Dark', icon: Moon },
                  { key: 'light', label: 'Light', icon: Sun },
                  { key: 'system', label: 'System', icon: Monitor },
                ].map(t => {
                  const Icon = t.icon;
                  const isCur = theme === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTheme(t.key as Theme)}
                      className={clsx(
                        'flex items-center justify-center gap-2 py-2.5 rounded-2xl border text-xs font-semibold transition-all',
                        isCur
                          ? 'bg-[#FF4F9A]/15 border-[#FF4F9A] text-white'
                          : 'bg-[#141418] border-[#303039] text-[#B8B8C2] hover:text-white'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={isSavingProfile}
                className="px-6 py-2.5 rounded-2xl bg-[#FF4F9A] hover:bg-[#FF4F9A]/90 text-white font-semibold text-xs shadow-md transition-all disabled:opacity-50"
              >
                {isSavingProfile ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: Account Privacy & Follow Requests */}
      {activeTab === 'privacy' && (
        <div className="space-y-6 animate-fade-in">
          {/* Public vs Private Mode Selection */}
          <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl p-6 sm:p-8 shadow-md">
            <h3 className="text-base font-bold text-white mb-2">Account Privacy</h3>
            <p className="text-xs text-[#B8B8C2] mb-6">
              Control who can see your profile details, creative posts, and document shares.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option 1: Public */}
              <div
                onClick={() => settings.isPrivate && handleToggleSetting('isPrivate')}
                className={clsx(
                  'p-5 rounded-3xl border cursor-pointer transition-all',
                  !settings.isPrivate
                    ? 'bg-emerald-950/20 border-emerald-500 shadow-lg'
                    : 'bg-[#141418] border-[#303039] hover:border-emerald-500/50'
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Public Account</h4>
                      <span className="text-[10px] text-emerald-400 font-medium">Recommended for Creators</span>
                    </div>
                  </div>
                  {!settings.isPrivate && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                </div>
                <p className="text-xs text-[#B8B8C2]">
                  Anyone on MUSELY can view your profile and public posts. Anyone can follow you instantly without approval.
                </p>
              </div>

              {/* Option 2: Private */}
              <div
                onClick={() => !settings.isPrivate && handleToggleSetting('isPrivate')}
                className={clsx(
                  'p-5 rounded-3xl border cursor-pointer transition-all',
                  settings.isPrivate
                    ? 'bg-purple-950/20 border-purple-500 shadow-lg'
                    : 'bg-[#141418] border-[#303039] hover:border-purple-500/50'
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Private Account</h4>
                      <span className="text-[10px] text-purple-400 font-medium">Strict Authorization</span>
                    </div>
                  </div>
                  {settings.isPrivate && <CheckCircle2 className="w-5 h-5 text-purple-400" />}
                </div>
                <p className="text-xs text-[#B8B8C2]">
                  Only you and approved followers can view your creative posts. New followers must send a request that you review.
                </p>
              </div>
            </div>

            <div className="mt-6 p-4 rounded-2xl bg-[#141418] border border-[#303039] flex items-start gap-3">
              <Shield className="w-5 h-5 text-[#FF4F9A] shrink-0 mt-0.5" />
              <p className="text-xs text-[#B8B8C2]">
                <strong className="text-white block font-medium">Post-Level Privacy Override:</strong>
                Even on a public account, you can select "Only Me" or "Followers Only" audience when creating individual posts.
              </p>
            </div>
          </div>

          {/* Pending Follow Requests Manager */}
          <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl p-6 sm:p-8 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white">Pending Follow Requests</h3>
                <p className="text-xs text-[#B8B8C2]">Review and approve people who want to follow your private account</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#FF4F9A]/15 text-[#FF4F9A]">
                {pendingRequests.length} pending
              </span>
            </div>

            {isLoadingRequests ? (
              <div className="py-8 text-center text-xs text-[#B8B8C2]">Loading requests...</div>
            ) : pendingRequests.length > 0 ? (
              <div className="space-y-3">
                {pendingRequests.map(req => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-[#141418] border border-[#303039]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#FF4F9A] flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                        {req.requester.avatarUrl ? (
                          <img
                            src={req.requester.avatarUrl}
                            alt={req.requester.displayName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          req.requester.displayName[0]?.toUpperCase()
                        )}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">{req.requester.displayName}</h4>
                        <p className="text-[11px] text-[#B8B8C2]">@{req.requester.username}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApproveRequest(req.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => handleRejectRequest(req.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-[#26262E] hover:bg-[#303039] text-[#B8B8C2] text-xs font-semibold transition-colors"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[#B8B8C2] border border-dashed border-[#303039] rounded-2xl">
                No pending follow requests at this time.
              </div>
            )}
          </div>

          {/* Messaging Privacy Settings */}
          <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl p-6 sm:p-8 shadow-md space-y-6">
            <div>
              <h3 className="text-base font-bold text-white mb-1">Messaging & Chat Privacy</h3>
              <p className="text-xs text-[#B8B8C2]">
                Configure who can contact you directly, add you to group chats, and forward your messages.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#B8B8C2] mb-1.5">
                  Who can send you direct messages?
                </label>
                <select
                  value={settings.whoCanMessage || 'EVERYONE'}
                  onChange={e => handleToggleSetting('whoCanMessage' as any)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#141418] border border-[#303039] text-white text-xs focus:border-[#FF4F9A] outline-none"
                >
                  <option value="EVERYONE">Everyone on MUSELY</option>
                  <option value="FOLLOWERS">Approved Followers Only (Others go to Requests)</option>
                  <option value="NOBODY">Nobody (Disable incoming direct messages)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#B8B8C2] mb-1.5">
                  Who can add you to group conversations?
                </label>
                <select
                  value={settings.whoCanAddToGroups || 'EVERYONE'}
                  onChange={e => handleToggleSetting('whoCanAddToGroups' as any)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#141418] border border-[#303039] text-white text-xs focus:border-[#FF4F9A] outline-none"
                >
                  <option value="EVERYONE">Everyone on MUSELY</option>
                  <option value="FOLLOWERS">Approved Followers Only (Requires confirmation)</option>
                  <option value="NOBODY">Nobody (Prevent group invitations)</option>
                </select>
              </div>
            </div>

            {/* Read Receipts & Presence Toggles */}
            <div className="divide-y divide-[#303039] pt-2">
              <div className="py-3 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Online Status</h4>
                  <p className="text-[11px] text-[#B8B8C2]">Display when you are actively using MUSELY</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSetting('showOnlineStatus' as any)}
                  className={clsx(
                    'w-11 h-5 rounded-full transition-colors relative flex-shrink-0',
                    settings.showOnlineStatus !== false ? 'bg-[#FF4F9A]' : 'bg-[#303039]'
                  )}
                >
                  <span
                    className={clsx(
                      'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm',
                      settings.showOnlineStatus !== false ? 'right-0.5' : 'left-0.5'
                    )}
                  />
                </button>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Last Seen Timestamp</h4>
                  <p className="text-[11px] text-[#B8B8C2]">Share when you were last active</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSetting('showLastSeen' as any)}
                  className={clsx(
                    'w-11 h-5 rounded-full transition-colors relative flex-shrink-0',
                    settings.showLastSeen !== false ? 'bg-[#FF4F9A]' : 'bg-[#303039]'
                  )}
                >
                  <span
                    className={clsx(
                      'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm',
                      settings.showLastSeen !== false ? 'right-0.5' : 'left-0.5'
                    )}
                  />
                </button>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Read Receipts</h4>
                  <p className="text-[11px] text-[#B8B8C2]">Let others see when you have read their messages</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSetting('showReadReceipts' as any)}
                  className={clsx(
                    'w-11 h-5 rounded-full transition-colors relative flex-shrink-0',
                    settings.showReadReceipts !== false ? 'bg-[#FF4F9A]' : 'bg-[#303039]'
                  )}
                >
                  <span
                    className={clsx(
                      'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm',
                      settings.showReadReceipts !== false ? 'right-0.5' : 'left-0.5'
                    )}
                  />
                </button>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Allow Message Forwarding</h4>
                  <p className="text-[11px] text-[#B8B8C2]">Allow others to forward messages you post in conversations</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSetting('allowForwarding' as any)}
                  className={clsx(
                    'w-11 h-5 rounded-full transition-colors relative flex-shrink-0',
                    settings.allowForwarding !== false ? 'bg-[#FF4F9A]' : 'bg-[#303039]'
                  )}
                >
                  <span
                    className={clsx(
                      'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm',
                      settings.allowForwarding !== false ? 'right-0.5' : 'left-0.5'
                    )}
                  />
                </button>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Private Notifications on Lock Screen</h4>
                  <p className="text-[11px] text-[#B8B8C2]">Hide message previews and sensitive sender details in notifications</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSetting('hideNotificationPreview' as any)}
                  className={clsx(
                    'w-11 h-5 rounded-full transition-colors relative flex-shrink-0',
                    settings.hideNotificationPreview ? 'bg-[#FF4F9A]' : 'bg-[#303039]'
                  )}
                >
                  <span
                    className={clsx(
                      'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm',
                      settings.hideNotificationPreview ? 'right-0.5' : 'left-0.5'
                    )}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Screenshot and Screen Protection Explanation */}
          <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl p-6 sm:p-8 shadow-md">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-white mb-1">Screenshot & Screen Recording Protection</h4>
                <p className="text-xs text-[#B8B8C2] leading-relaxed mb-3">
                  {SCREENSHOT_DISCLAIMER.androidNote}
                </p>
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300/90 leading-relaxed">
                  <strong>Transparent Web Limitation:</strong> {SCREENSHOT_DISCLAIMER.webLimitation}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Controls & Enable/Disable Toggles */}
      {activeTab === 'preferences' && (
        <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl p-6 sm:p-8 shadow-md space-y-6 animate-fade-in">
          <div>
            <h3 className="text-base font-bold text-white mb-1">Enable / Disable Platform Controls</h3>
            <p className="text-xs text-[#B8B8C2]">
              Customize your experience, interaction rules, and privacy options. All toggles persist in the database.
            </p>
          </div>

          <div className="divide-y divide-[#303039]">
            {/* Toggle 1: Allow Comments */}
            <div className="py-4 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-400" />
                  Allow Comments on Posts
                </h4>
                <p className="text-xs text-[#B8B8C2]">
                  When disabled, viewers cannot leave new comments on your published posts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSetting('allowComments')}
                className={clsx(
                  'w-12 h-6 rounded-full transition-colors relative flex-shrink-0',
                  settings.allowComments ? 'bg-[#FF4F9A]' : 'bg-[#303039]'
                )}
              >
                <span
                  className={clsx(
                    'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm',
                    settings.allowComments ? 'right-0.5' : 'left-0.5'
                  )}
                />
              </button>
            </div>

            {/* Toggle 2: Allow Likes */}
            <div className="py-4 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Heart className="w-4 h-4 text-[#FF4F9A]" />
                  Allow Likes and Interactions
                </h4>
                <p className="text-xs text-[#B8B8C2]">
                  When disabled, viewers cannot tap like on your posts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSetting('allowLikes')}
                className={clsx(
                  'w-12 h-6 rounded-full transition-colors relative flex-shrink-0',
                  settings.allowLikes ? 'bg-[#FF4F9A]' : 'bg-[#303039]'
                )}
              >
                <span
                  className={clsx(
                    'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm',
                    settings.allowLikes ? 'right-0.5' : 'left-0.5'
                  )}
                />
              </button>
            </div>

            {/* Toggle 3: Activity / Online Status */}
            <div className="py-4 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  Activity & Online Status
                </h4>
                <p className="text-xs text-[#B8B8C2]">
                  Allow friends and followers to see when you are active on the platform.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSetting('activityStatus')}
                className={clsx(
                  'w-12 h-6 rounded-full transition-colors relative flex-shrink-0',
                  settings.activityStatus ? 'bg-[#FF4F9A]' : 'bg-[#303039]'
                )}
              >
                <span
                  className={clsx(
                    'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm',
                    settings.activityStatus ? 'right-0.5' : 'left-0.5'
                  )}
                />
              </button>
            </div>

            {/* Toggle 4: Search Discoverability */}
            <div className="py-4 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Search className="w-4 h-4 text-amber-400" />
                  Discoverability in Search
                </h4>
                <p className="text-xs text-[#B8B8C2]">
                  Allow your account to appear in search suggestions and explore directory.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSetting('searchDiscoverable')}
                className={clsx(
                  'w-12 h-6 rounded-full transition-colors relative flex-shrink-0',
                  settings.searchDiscoverable ? 'bg-[#FF4F9A]' : 'bg-[#303039]'
                )}
              >
                <span
                  className={clsx(
                    'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm',
                    settings.searchDiscoverable ? 'right-0.5' : 'left-0.5'
                  )}
                />
              </button>
            </div>

            {/* Toggle 5: Profile Visibility */}
            <div className="py-4 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-purple-400" />
                  Public Profile Visibility
                </h4>
                <p className="text-xs text-[#B8B8C2]">
                  If toggled off, your profile page is hidden from non-authenticated visitors.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSetting('profileVisible')}
                className={clsx(
                  'w-12 h-6 rounded-full transition-colors relative flex-shrink-0',
                  settings.profileVisible ? 'bg-[#FF4F9A]' : 'bg-[#303039]'
                )}
              >
                <span
                  className={clsx(
                    'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm',
                    settings.profileVisible ? 'right-0.5' : 'left-0.5'
                  )}
                />
              </button>
            </div>

            {/* Toggle 6: Email Notifications */}
            <div className="py-4 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-sky-400" />
                  Email Notifications
                </h4>
                <p className="text-xs text-[#B8B8C2]">
                  Receive emails about important account updates and security notices.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSetting('emailNotifications')}
                className={clsx(
                  'w-12 h-6 rounded-full transition-colors relative flex-shrink-0',
                  settings.emailNotifications ? 'bg-[#FF4F9A]' : 'bg-[#303039]'
                )}
              >
                <span
                  className={clsx(
                    'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm',
                    settings.emailNotifications ? 'right-0.5' : 'left-0.5'
                  )}
                />
              </button>
            </div>

            {/* Toggle 7: In-App Notifications */}
            <div className="py-4 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-pink-400" />
                  In-App Notifications
                </h4>
                <p className="text-xs text-[#B8B8C2]">
                  Receive notifications on MUSELY when someone likes, comments, or follows you.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSetting('inAppNotifications')}
                className={clsx(
                  'w-12 h-6 rounded-full transition-colors relative flex-shrink-0',
                  settings.inAppNotifications ? 'bg-[#FF4F9A]' : 'bg-[#303039]'
                )}
              >
                <span
                  className={clsx(
                    'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm',
                    settings.inAppNotifications ? 'right-0.5' : 'left-0.5'
                  )}
                />
              </button>
            </div>

            {/* Toggle 8: Analytics Tracking Preference */}
            <div className="py-4 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-[#FF4F9A]" />
                  Analytics Tracking Preferences
                </h4>
                <p className="text-xs text-[#B8B8C2]">
                  Allow anonymous first-party analytics collection to power your creator dashboard and performance metrics.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSetting('analyticsTracking')}
                className={clsx(
                  'w-12 h-6 rounded-full transition-colors relative flex-shrink-0',
                  settings.analyticsTracking ? 'bg-[#FF4F9A]' : 'bg-[#303039]'
                )}
              >
                <span
                  className={clsx(
                    'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm',
                    settings.analyticsTracking ? 'right-0.5' : 'left-0.5'
                  )}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Creator Verification */}
      {activeTab === 'verification' && (
        <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl p-6 sm:p-8 shadow-md animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <BadgeCheck className="w-7 h-7 text-blue-400" />
            <div>
              <h3 className="text-base font-bold text-white">MUSELY Creator Verification</h3>
              <p className="text-xs text-[#B8B8C2]">Official badge for notable creators, artists, and organizations</p>
            </div>
          </div>

          {user?.isVerified ? (
            <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center gap-3">
              <BadgeCheck className="w-6 h-6 text-blue-400" />
              <div>
                <h4 className="text-sm font-bold text-white">Your Account is Verified</h4>
                <p className="text-xs text-[#B8B8C2]">
                  You have the official verified creator badge across MUSELY.
                </p>
              </div>
            </div>
          ) : !showVerifyForm ? (
            <div className="space-y-4">
              <p className="text-xs text-[#B8B8C2] leading-relaxed">
                Verification confirms the authenticity of high-profile creators, original artists, cultural organizations, and community leaders. All applications are reviewed manually by our moderation team.
              </p>
              <button
                onClick={() => setShowVerifyForm(true)}
                className="px-5 py-2.5 rounded-2xl bg-[#FF4F9A] text-white text-xs font-semibold hover:bg-[#FF4F9A]/90 transition-all shadow-md"
              >
                Apply for Verification
              </button>
            </div>
          ) : (
            <form onSubmit={handleVerifySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">
                  Why should your account be verified? (min. 20 characters)
                </label>
                <textarea
                  rows={4}
                  required
                  minLength={20}
                  value={verifyReason}
                  onChange={e => setVerifyReason(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#141418] border border-[#303039] text-white text-sm focus:border-[#FF4F9A] outline-none"
                  placeholder="Tell us about your work, community, or public presence..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">
                  Supporting Links (portfolio, social channels, news articles)
                </label>
                <textarea
                  rows={3}
                  value={verifyLinks}
                  onChange={e => setVerifyLinks(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#141418] border border-[#303039] text-white text-sm focus:border-[#FF4F9A] outline-none"
                  placeholder="https://yourportfolio.com&#10;https://instagram.com/yourhandle"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingVerify}
                  className="px-5 py-2.5 rounded-2xl bg-[#FF4F9A] text-white text-xs font-semibold shadow-md disabled:opacity-50"
                >
                  {isSubmittingVerify ? 'Submitting...' : 'Submit Request'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowVerifyForm(false)}
                  className="px-4 py-2.5 rounded-2xl bg-[#26262E] text-[#B8B8C2] text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB 5: Security & Danger Zone */}
      {activeTab === 'danger' && (
        <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl p-6 sm:p-8 shadow-md space-y-6 animate-fade-in">
          <div>
            <h3 className="text-base font-bold text-white mb-1">Security & Session Management</h3>
            <p className="text-xs text-[#B8B8C2]">Sign out of active sessions or delete your MUSELY account.</p>
          </div>

          {/* Two-Step Verification Section */}
          <div className="p-6 rounded-3xl bg-[#141418] border border-[#303039] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-accent-500/10 flex items-center justify-center text-accent-500">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    Two-Step Verification (TOTP)
                    <span className={clsx(
                      'text-[10px] px-2 py-0.5 rounded-full font-semibold',
                      is2FAEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#303039] text-[#B8B8C2]'
                    )}>
                      {is2FAEnabled ? 'Active & Protected' : 'Not Enabled'}
                    </span>
                  </h4>
                  <p className="text-xs text-[#B8B8C2]">
                    Protect your MUSELY account with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy).
                  </p>
                </div>
              </div>

              {!is2FAEnabled ? (
                <button
                  onClick={handleStart2FASetup}
                  disabled={isSubmitting2FA}
                  className="px-4 py-2 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-white text-xs font-semibold transition-colors shadow-md"
                >
                  {isSubmitting2FA ? 'Setting up...' : 'Enable 2FA'}
                </button>
              ) : (
                <button
                  onClick={() => setShowDisable2FAModal(true)}
                  className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold transition-colors"
                >
                  Disable 2FA
                </button>
              )}
            </div>
          </div>

          {/* Active Sessions Management */}
          <div className="p-6 rounded-3xl bg-[#141418] border border-[#303039] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-blue-400" />
                  Active Sessions
                </h4>
                <p className="text-xs text-[#B8B8C2]">
                  Review and terminate browsers or devices currently signed into your account.
                </p>
              </div>
              {sessions.length > 1 && (
                <button
                  onClick={handleRevokeOtherSessions}
                  className="px-3 py-1.5 rounded-xl bg-[#26262E] hover:bg-[#303039] text-xs text-amber-300 font-semibold transition-colors"
                >
                  Sign Out Other Devices
                </button>
              )}
            </div>

            {isLoadingSessions ? (
              <div className="py-4 text-center text-xs text-[#B8B8C2]">Loading sessions...</div>
            ) : sessions.length > 0 ? (
              <div className="space-y-2">
                {sessions.map((sess, idx) => (
                  <div key={sess.id} className="p-3 rounded-2xl bg-[#1C1C22] border border-[#303039] flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white truncate max-w-xs">{sess.userAgent || 'Web Browser'}</span>
                        {idx === 0 && (
                          <span className="px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                            Current Device
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[#757582]">
                        Last active: {new Date(sess.lastActiveAt).toLocaleString()} • IP Hash: {sess.ipHash || 'protected'}
                      </p>
                    </div>
                    {idx !== 0 && (
                      <button
                        onClick={() => handleRevokeSession(sess.id)}
                        className="px-3 py-1 rounded-xl bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#B8B8C2]">Current session active.</p>
            )}
          </div>

          {/* Delete Account */}
          <div className="pt-4 border-t border-[#303039]">
            <h4 className="text-sm font-bold text-red-400 mb-1">Danger Zone</h4>
            <p className="text-xs text-[#B8B8C2] mb-4">
              Deleting your account permanently removes your profile, posts, messages, and uploaded files.
            </p>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Account
              </button>
            ) : (
              <div className="p-5 rounded-2xl bg-red-950/20 border border-red-800/50 space-y-3">
                <div className="flex items-center gap-2 text-red-400 text-sm font-bold">
                  <AlertCircle className="w-4 h-4" />
                  Are you absolutely sure?
                </div>
                <p className="text-xs text-[#B8B8C2]">
                  This action is irreversible. Type <strong className="text-white">DELETE</strong> to confirm:
                </p>
                <input
                  type="text"
                  placeholder="DELETE"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  className="w-full max-w-xs px-3.5 py-2 rounded-xl bg-[#141418] border border-red-800/80 text-white text-xs outline-none"
                />
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmText !== 'DELETE'}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold disabled:opacity-40 transition-colors"
                  >
                    Permanently Delete
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmText('');
                    }}
                    className="px-4 py-2 rounded-xl bg-[#26262E] text-[#B8B8C2] text-xs font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2FA Setup Modal */}
      {show2FASetupModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-2 text-white">
              <ShieldCheck className="w-6 h-6 text-[#FF4F9A]" />
              <h3 className="text-lg font-bold">Set Up Two-Step Verification</h3>
            </div>
            <p className="text-xs text-[#B8B8C2] mb-4">
              Add your MUSELY account to Google Authenticator, 1Password, Microsoft Authenticator, or Authy.
            </p>

            <div className="p-4 rounded-2xl bg-[#141418] border border-[#303039] space-y-3 mb-4">
              <label className="text-[11px] font-semibold text-[#B8B8C2] block">
                Account Secret Key (Enter manually in authenticator app)
              </label>
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#0B0B0D] border border-[#303039]">
                <code className="text-xs font-mono font-bold text-accent-400 select-all tracking-wider">
                  {twoFactorSecret}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(twoFactorSecret);
                    toast.success('Secret copied to clipboard');
                  }}
                  className="p-1.5 rounded-lg bg-[#26262E] hover:bg-[#303039] text-[#B8B8C2] hover:text-white"
                  title="Copy secret"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleConfirm2FASetup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">
                  Enter the 6-Digit Code from Authenticator to Confirm
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  placeholder="123456"
                  value={setupCode}
                  onChange={e => setSetupCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center text-xl font-mono font-bold tracking-widest py-2.5 rounded-xl bg-[#0B0B0D] border border-[#303039] text-white focus:border-[#FF4F9A] outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShow2FASetupModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#26262E] text-xs font-semibold text-[#B8B8C2] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={setupCode.length !== 6 || isSubmitting2FA}
                  className="px-5 py-2 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-xs font-semibold text-white disabled:opacity-50"
                >
                  {isSubmitting2FA ? 'Confirming...' : 'Verify and Enable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recovery Codes Display Modal (Shown ONCE upon setup) */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-2 text-white">
              <KeyRound className="w-6 h-6 text-amber-400" />
              <h3 className="text-lg font-bold">Save Your Recovery Codes</h3>
            </div>
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 mb-4">
              <strong>Important:</strong> These recovery codes are displayed <u>only once</u>. If you lose access to your authenticator app, these codes are the only way to recover your account.
            </div>

            <div className="grid grid-cols-2 gap-2 p-4 rounded-2xl bg-[#0B0B0D] border border-[#303039] font-mono text-xs font-bold text-white mb-4">
              {generatedRecoveryCodes.map((code, idx) => (
                <div key={idx} className="p-1.5 rounded-lg bg-[#141418] text-center border border-[#303039]/50">
                  {code}
                </div>
              ))}
            </div>

            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(generatedRecoveryCodes.join('\n'));
                  toast.success('Recovery codes copied to clipboard');
                }}
                className="flex-1 py-2 rounded-xl bg-[#26262E] hover:bg-[#303039] text-xs font-semibold text-white flex items-center justify-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" /> Copy All
              </button>
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([`MUSELY Recovery Codes\nAccount: ${user?.username}\nGenerated: ${new Date().toISOString()}\n\n${generatedRecoveryCodes.join('\n')}`], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `musely-recovery-codes-${user?.username}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success('Recovery codes downloaded');
                }}
                className="flex-1 py-2 rounded-xl bg-[#26262E] hover:bg-[#303039] text-xs font-semibold text-white flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Download (.txt)
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowRecoveryModal(false)}
              className="w-full py-2.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-xs font-bold text-white shadow-md"
            >
              I have safely backed up my recovery codes
            </button>
          </div>
        </div>
      )}

      {/* Disable 2FA Re-authentication Modal */}
      {showDisable2FAModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Disable Two-Step Verification</h3>
            <p className="text-xs text-[#B8B8C2] mb-4">
              For security, please enter your account password to confirm disabling two-step verification.
            </p>

            <form onSubmit={handleDisable2FA} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#B8B8C2] mb-1">Account Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={disablePassword}
                  onChange={e => setDisablePassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#303039] text-white text-xs focus:border-[#FF4F9A] outline-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDisable2FAModal(false);
                    setDisablePassword('');
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-[#26262E] text-xs text-[#B8B8C2]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!disablePassword || isSubmitting2FA}
                  className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {isSubmitting2FA ? 'Confirming...' : 'Disable 2FA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
