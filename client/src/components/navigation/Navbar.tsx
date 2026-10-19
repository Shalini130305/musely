import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Search, Plus, Bell, MessageSquare, Users, Compass, Home,
  LogOut, Settings, User as UserIcon, BookMarked, ChevronDown
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close user menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Poll for real unread indicators only when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    let isMounted = true;
    const fetchCounters = async () => {
      try {
        const [notifRes, msgRes] = await Promise.all([
          api.get('/notifications'),
          api.get('/messages/unread-count'),
        ]);
        if (isMounted) {
          setUnreadNotifications(notifRes.data?.unreadCount || 0);
          setUnreadMessages(msgRes.data?.unreadCount || 0);
        }
      } catch {
        // quiet failure
      }
    };

    fetchCounters();
    const interval = setInterval(fetchCounters, 15000); // 15 seconds
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setShowUserMenu(false);
      navigate('/');
      toast.success('Signed out successfully');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0B0B0D]/95 backdrop-blur-lg border-b border-[#303039]">
      <div className="max-w-screen-2xl mx-auto px-4 h-16 flex items-center gap-4">

        {/* Logo */}
        <Link to="/" className="flex-shrink-0 flex items-center gap-2 group">
          <span className="font-display font-bold text-2xl tracking-tight text-white flex items-center">
            M<span className="text-[#FF4F9A] transition-transform duration-300 group-hover:scale-110">U</span>SELY
          </span>
          <span className="hidden lg:inline-block text-[10px] uppercase font-bold tracking-widest text-[#FF8FBD] bg-[#FF4F9A]/15 px-2 py-0.5 rounded-full border border-[#FF4F9A]/30">
            India
          </span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-1 ml-2">
          <NavLink to="/" end className={({ isActive }) => clsx('nav-link', isActive && 'active')}>
            <Home className="w-4 h-4" />
            Home
          </NavLink>
          <NavLink to="/explore" className={({ isActive }) => clsx('nav-link', isActive && 'active')}>
            <Compass className="w-4 h-4" />
            Discover
          </NavLink>
          <NavLink to="/communities" className={({ isActive }) => clsx('nav-link', isActive && 'active')}>
            <Users className="w-4 h-4" />
            Communities
          </NavLink>
          {isAuthenticated && (
            <NavLink to="/messages" className={({ isActive }) => clsx('nav-link relative', isActive && 'active')}>
              <MessageSquare className="w-4 h-4" />
              Messages
              {unreadMessages > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-[#FF4F9A] text-white text-[10px] font-bold animate-pulse">
                  {unreadMessages}
                </span>
              )}
            </NavLink>
          )}
        </nav>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex-1 max-w-md mx-auto hidden sm:flex">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#757582] w-4 h-4" />
            <input
              type="text"
              placeholder="Search thoughts, creators, communities..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input pl-10 py-2.5 text-xs bg-[#1C1C22] border-[#303039] focus:border-[#FF4F9A]"
            />
          </div>
        </form>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-2">
          {isAuthenticated && user ? (
            <>
              {/* Create button */}
              <Link to="/create" className="btn-primary hidden sm:inline-flex items-center gap-1.5 shadow-pink-glow">
                <Plus className="w-4 h-4" />
                Create
              </Link>

              {/* Notifications */}
              <Link
                to="/notifications"
                className="btn-icon relative"
                aria-label="Notifications"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#FF4F9A] ring-2 ring-[#0B0B0D]" />
                )}
              </Link>

              {/* User menu */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowUserMenu(p => !p)}
                  className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-[#1C1C22] transition-colors"
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName} className="w-8 h-8 rounded-full object-cover border border-[#FF4F9A]/40" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#FF4F9A] flex items-center justify-center text-white text-xs font-bold shadow-sm">
                      {user.displayName[0]?.toUpperCase()}
                    </div>
                  )}
                  <ChevronDown className={clsx('w-3.5 h-3.5 text-[#B8B8C2] transition-transform', showUserMenu && 'rotate-180')} />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 top-full mt-2 w-56 card shadow-2xl py-1 animate-scale-in border-[#303039] bg-[#1C1C22]">
                    <div className="px-3.5 py-2.5 border-b border-[#303039]">
                      <p className="font-semibold text-sm text-white truncate">{user.displayName}</p>
                      <p className="text-xs text-[#B8B8C2] truncate">@{user.username}</p>
                    </div>

                    <Link
                      to={`/profile/${user.username}`}
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-[#B8B8C2] hover:text-white hover:bg-[#26262E] transition-colors"
                    >
                      <UserIcon className="w-4 h-4 text-[#FF4F9A]" /> Profile & Activity
                    </Link>

                    <Link
                      to="/communities"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-[#B8B8C2] hover:text-white hover:bg-[#26262E] transition-colors"
                    >
                      <Users className="w-4 h-4 text-[#FF4F9A]" /> My Communities
                    </Link>

                    <Link
                      to="/collections"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-[#B8B8C2] hover:text-white hover:bg-[#26262E] transition-colors"
                    >
                      <BookMarked className="w-4 h-4 text-[#FF4F9A]" /> Saved Collections
                    </Link>

                    <Link
                      to="/settings"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-[#B8B8C2] hover:text-white hover:bg-[#26262E] transition-colors"
                    >
                      <Settings className="w-4 h-4 text-[#FF4F9A]" /> Settings & Preferences
                    </Link>

                    <div className="border-t border-[#303039] mt-1 pt-1">
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2.5 w-full px-3.5 py-2 text-xs text-[#FF4F9A] hover:bg-[#FF4F9A]/10 transition-colors"
                      >
                        <LogOut className="w-4 h-4" /> Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className="btn-secondary text-xs">Sign in</Link>
              <Link to="/register" className="btn-primary text-xs">Join free</Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile search */}
      <div className="sm:hidden px-4 pb-3">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#757582] w-4 h-4" />
          <input
            type="text"
            placeholder="Search Musely..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input pl-10 py-2 text-xs bg-[#1C1C22] border-[#303039]"
          />
        </form>
      </div>
    </header>
  );
}
