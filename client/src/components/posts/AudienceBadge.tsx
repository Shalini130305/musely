import React from 'react';
import { Globe, Users, Lock } from 'lucide-react';
import clsx from 'clsx';
import type { AudienceType } from '@/types';

interface AudienceBadgeProps {
  audience?: AudienceType;
  isAuthorPrivate?: boolean;
  className?: string;
}

export const AudienceBadge: React.FC<AudienceBadgeProps> = ({
  audience = 'PUBLIC',
  isAuthorPrivate = false,
  className,
}) => {
  if (audience === 'ONLY_ME') {
    return (
      <span
        title="Only visible to you (Private)"
        className={clsx(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-charcoal-700/80 text-charcoal-300 border border-charcoal-600',
          className
        )}
      >
        <Lock className="w-2.5 h-2.5 text-amber-400" />
        Only Me
      </span>
    );
  }

  if (audience === 'FOLLOWERS' || isAuthorPrivate) {
    return (
      <span
        title={isAuthorPrivate ? 'Author account is private - visible only to approved followers' : 'Followers only post'}
        className={clsx(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-950/60 text-purple-300 border border-purple-800/60',
          className
        )}
      >
        <Users className="w-2.5 h-2.5 text-purple-400" />
        Followers Only
      </span>
    );
  }

  return (
    <span
      title="Public post - visible to everyone"
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/50 text-emerald-300 border border-emerald-800/50',
        className
      )}
    >
      <Globe className="w-2.5 h-2.5 text-emerald-400" />
      Public
    </span>
  );
};
