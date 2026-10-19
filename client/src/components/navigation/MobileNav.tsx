import { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Home, Compass, Plus, Users, MessageSquare, Bell, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/services/api';
import clsx from 'clsx';

export function MobileNav() {
  const { user, isAuthenticated } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState<number>(0);
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadMessages(0);
      setUnreadNotifications(0);
      return;
    }

    let isMounted = true;
    const fetchCounters = async () => {
      try {
        const [msgRes, notifRes] = await Promise.allSettled([
          api.get('/messages/unread/count'),
          api.get('/notifications/unread/count')
        ]);
        if (!isMounted) return;
        if (msgRes.status === 'fulfilled' && msgRes.value.data) {
          setUnreadMessages(msgRes.value.data.unreadCount || 0);
        }
        if (notifRes.status === 'fulfilled' && notifRes.value.data) {
          setUnreadNotifications(notifRes.value.data.unreadCount || 0);
        }
      } catch {
        // silent fail on network hiccups
      }
    };

    fetchCounters();
    const interval = setInterval(fetchCounters, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0B0B0D]/95 backdrop-blur-lg border-t border-[#303039] z-40 px-2 py-2">
      <div className="flex items-center justify-around">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            clsx(
              'flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transition-colors text-[10px] font-medium',
              isActive ? 'text-[#FF4F9A]' : 'text-[#B8B8C2] hover:text-white'
            )
          }
        >
          <Home className="w-5 h-5" />
          <span>Home</span>
        </NavLink>

        <NavLink
          to="/explore"
          className={({ isActive }) =>
            clsx(
              'flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transition-colors text-[10px] font-medium',
              isActive ? 'text-[#FF4F9A]' : 'text-[#B8B8C2] hover:text-white'
            )
          }
        >
          <Compass className="w-5 h-5" />
          <span>Discover</span>
        </NavLink>

        <NavLink
          to="/communities"
          className={({ isActive }) =>
            clsx(
              'flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transition-colors text-[10px] font-medium',
              isActive ? 'text-[#FF4F9A]' : 'text-[#B8B8C2] hover:text-white'
            )
          }
        >
          <Users className="w-5 h-5" />
          <span>Groups</span>
        </NavLink>

        {isAuthenticated ? (
          <Link to="/create" className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-[#FF4F9A] hover:bg-[#FF72AD] text-white flex items-center justify-center shadow-lg shadow-[#FF4F9A]/30 transition-transform active:scale-95">
              <Plus className="w-5 h-5" />
            </div>
          </Link>
        ) : (
          <Link to="/register" className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-[#FF4F9A] text-white flex items-center justify-center shadow-lg shadow-[#FF4F9A]/30">
              <Plus className="w-5 h-5" />
            </div>
          </Link>
        )}

        {isAuthenticated ? (
          <NavLink
            to="/messages"
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transition-colors text-[10px] font-medium relative',
                isActive ? 'text-[#FF4F9A]' : 'text-[#B8B8C2] hover:text-white'
              )
            }
          >
            <div className="relative">
              <MessageSquare className="w-5 h-5" />
              {unreadMessages > 0 && (
                <span className="absolute -top-1 -right-2 px-1 rounded-full bg-[#FF4F9A] text-white text-[9px] font-bold min-w-[14px] text-center">
                  {unreadMessages}
                </span>
              )}
            </div>
            <span>Chat</span>
          </NavLink>
        ) : (
          <NavLink
            to="/login"
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transition-colors text-[10px] font-medium',
                isActive ? 'text-[#FF4F9A]' : 'text-[#B8B8C2] hover:text-white'
              )
            }
          >
            <UserIcon className="w-5 h-5" />
            <span>Sign in</span>
          </NavLink>
        )}

        {isAuthenticated && user && (
          <NavLink
            to={`/profile/${user.username}`}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transition-colors text-[10px] font-medium relative',
                isActive ? 'text-[#FF4F9A]' : 'text-[#B8B8C2] hover:text-white'
              )
            }
          >
            <div className="relative">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.displayName} className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <UserIcon className="w-5 h-5" />
              )}
              {unreadNotifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#FF4F9A] ring-1 ring-[#0B0B0D]" />
              )}
            </div>
            <span>Profile</span>
          </NavLink>
        )}
      </div>
    </nav>
  );
}
