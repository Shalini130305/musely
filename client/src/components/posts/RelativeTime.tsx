import { useState, useEffect } from 'react';
import { getRelativeTime, getExactDateTime } from '@/utils/timeUtils';

interface RelativeTimeProps {
  isoDate: string | null | undefined;
  className?: string;
  /** Update interval in ms (default: 30s) */
  updateInterval?: number;
}

/**
 * Displays an Instagram-style relative timestamp that updates automatically.
 * Shows the exact date/time on hover.
 */
export function RelativeTime({ isoDate, className = '', updateInterval = 30_000 }: RelativeTimeProps) {
  const [relative, setRelative] = useState(() => getRelativeTime(isoDate));

  useEffect(() => {
    setRelative(getRelativeTime(isoDate));

    const timer = setInterval(() => {
      setRelative(getRelativeTime(isoDate));
    }, updateInterval);

    return () => clearInterval(timer);
  }, [isoDate, updateInterval]);

  const exact = getExactDateTime(isoDate);

  if (!relative) return null;

  return (
    <time
      dateTime={isoDate || undefined}
      title={exact}
      className={`cursor-default ${className}`}
    >
      {relative}
    </time>
  );
}

