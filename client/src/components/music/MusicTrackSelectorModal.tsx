import { useState, useEffect, useRef } from 'react';
import { X, Search, Music, Play, Pause, Check, Disc3, ShieldCheck } from 'lucide-react';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import type { MusicTrack } from '@/types';

interface MusicTrackSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTrack: (track: MusicTrack) => void;
  selectedTrackId?: string | null;
}

export function MusicTrackSelectorModal({
  isOpen,
  onClose,
  onSelectTrack,
  selectedTrackId,
}: MusicTrackSelectorModalProps) {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingTrackId(null);
      return;
    }

    const fetchTracks = async () => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        if (search.trim()) params.append('q', search.trim());
        const { data } = await api.get(`/music/tracks?${params.toString()}`);
        setTracks(data.tracks || []);
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    };

    const debounce = setTimeout(fetchTracks, 250);
    return () => clearTimeout(debounce);
  }, [isOpen, search]);

  const togglePlay = (e: React.MouseEvent, track: MusicTrack) => {
    e.stopPropagation();
    if (playingTrackId === track.id) {
      audioRef.current?.pause();
      setPlayingTrackId(null);
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.onended = () => setPlayingTrackId(null);
      }
      audioRef.current.src = track.audioUrl;
      audioRef.current.play().catch((err) => {
        console.error('Audio play error:', err);
        toast.error('Unable to play audio preview');
      });
      setPlayingTrackId(track.id);
    }
  };

  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#141418] border border-[#303039] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#303039]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#FF4F9A]/15 text-[#FF4F9A] flex items-center justify-center">
              <Music className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold font-display text-white">Add Music Track</h2>
              <p className="text-[10px] text-[#B8B8C2]">Licensed and Creative Commons audio catalog</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#B8B8C2] hover:text-white hover:bg-[#1C1C22] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-[#303039]/60">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#757582] w-4 h-4" />
            <input
              type="text"
              placeholder="Search by track title, artist, or genre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-[#1C1C22] text-white placeholder-[#757582] border border-[#303039] focus:outline-none focus:border-[#FF4F9A]"
            />
          </div>
        </div>

        {/* Track List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#303039]/40 p-2 scrollbar-none">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <div className="w-7 h-7 border-3 border-[#FF4F9A] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-[#757582]">Browsing licensed tracks...</p>
            </div>
          ) : tracks.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#757582]">
              No tracks matched your search.
            </div>
          ) : (
            tracks.map((track) => {
              const isSelected = selectedTrackId === track.id;
              const isPlaying = playingTrackId === track.id;
              return (
                <div
                  key={track.id}
                  onClick={() => {
                    onSelectTrack(track);
                    onClose();
                  }}
                  className={clsx(
                    'flex items-center justify-between p-3 rounded-2xl transition-all cursor-pointer gap-3',
                    isSelected
                      ? 'bg-[#FF4F9A]/15 border border-[#FF4F9A]/40'
                      : 'hover:bg-[#1C1C22] border border-transparent'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Cover Art with Play Button */}
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-[#26262E] flex-shrink-0 group">
                      {track.coverUrl ? (
                        <img
                          src={track.coverUrl}
                          alt={track.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#FF4F9A]">
                          <Disc3 className="w-6 h-6 animate-spin" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => togglePlay(e, track)}
                        className="absolute inset-0 bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                      >
                        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">{track.title}</span>
                        {track.isLicensed && (
                          <span className="p-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0" title="Authorized Licensed Track">
                            <ShieldCheck className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#B8B8C2] truncate">{track.artist}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {track.duration && (
                          <span className="text-[10px] text-[#757582]">{formatDuration(track.duration)}</span>
                        )}
                        {track.album && (
                          <span className="text-[10px] text-[#757582] truncate">• {track.album}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectTrack(track);
                      onClose();
                    }}
                    className={clsx(
                      'px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors flex items-center gap-1',
                      isSelected
                        ? 'bg-[#FF4F9A] text-white shadow-pink-glow'
                        : 'bg-[#26262E] hover:bg-[#303039] text-white border border-[#303039]'
                    )}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Selected
                      </>
                    ) : (
                      'Select'
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
