import { useState, useEffect, useRef } from 'react';
import {
  X, Search, Music, Play, Pause, Loader2, Disc3,
  ExternalLink, Check, Sparkles, Volume2
} from 'lucide-react';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';
import type { MusicTrack } from '@/types';

interface SearchTrackItem {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  coverUrl?: string | null;
  audioUrl: string;
  duration?: number | null;
  provider: 'itunes' | 'spotify' | 'library';
  providerId?: string | null;
  previewAvailable: boolean;
  externalUrl?: string | null;
}

interface ProfileMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrackId?: string | null;
  onTrackSelected: (track: MusicTrack) => void;
}

export function ProfileMusicModal({
  isOpen,
  onClose,
  currentTrackId,
  onTrackSelected,
}: ProfileMusicModalProps) {
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<SearchTrackItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initial load: show featured / library tracks
  useEffect(() => {
    if (!isOpen) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingTrackId(null);
      return;
    }

    const loadInitial = async () => {
      try {
        setIsLoading(true);
        const { data } = await api.get('/music/search?limit=15');
        setTracks(data.tracks || []);
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    };

    loadInitial();
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (!trimmed) return;

    const timer = setTimeout(async () => {
      try {
        setIsLoading(true);
        const { data } = await api.get(`/music/search?q=${encodeURIComponent(trimmed)}&limit=25`);
        setTracks(data.tracks || []);
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Audio preview playback toggle
  const togglePlay = (track: SearchTrackItem) => {
    if (!track.audioUrl) {
      toast.error('Audio preview not available for this track');
      return;
    }

    if (playingTrackId === track.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingTrackId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(track.audioUrl);
    audioRef.current = audio;
    setPlayingTrackId(track.id);

    audio.play().catch(() => {
      setPlayingTrackId(null);
      toast.error('Unable to play audio stream');
    });

    audio.onended = () => {
      setPlayingTrackId(null);
    };
  };

  const handleSelectTrack = async (track: SearchTrackItem) => {
    try {
      setIsSaving(true);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingTrackId(null);

      // Save to user profile via backend PUT /users/me/profile-music
      const { data } = await api.put('/users/me/profile-music', {
        title: track.title,
        artist: track.artist,
        album: track.album,
        coverUrl: track.coverUrl,
        audioUrl: track.audioUrl,
        duration: track.duration,
        providerId: track.providerId,
        providerName: track.provider,
        externalUrl: track.externalUrl,
      });

      toast.success(`Set "${track.title}" as your profile soundtrack!`);
      if (data.profileMusicTrack) {
        onTrackSelected(data.profileMusicTrack);
      }
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="p-5 border-b border-[#303039] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#FF4F9A] to-purple-600 flex items-center justify-center text-white shadow-md">
              <Disc3 className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Select Profile Soundtrack
                <Sparkles className="w-4 h-4 text-amber-400" />
              </h3>
              <p className="text-xs text-[#B8B8C2]">
                Search millions of songs worldwide to feature on your profile
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#B8B8C2] hover:text-white hover:bg-[#26262E] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input */}
        <div className="p-4 border-b border-[#303039]/60 bg-[#151519]">
          <div className="relative">
            <Search className="w-4 h-4 text-[#757582] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by song, artist, album (e.g. Arijit Singh, Coldplay, Diljit)..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#0B0B0D] border border-[#303039] focus:border-[#FF4F9A] rounded-2xl text-xs sm:text-sm text-white placeholder-[#757582] focus:outline-none transition-colors"
              autoFocus
            />
            {isLoading && (
              <Loader2 className="w-4 h-4 text-[#FF4F9A] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
            )}
          </div>
        </div>

        {/* Tracks List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading && tracks.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#B8B8C2] flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 text-[#FF4F9A] animate-spin" />
              <span>Searching worldwide catalogues...</span>
            </div>
          ) : tracks.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#757582]">
              No songs found for "{query}". Try a different title or artist name.
            </div>
          ) : (
            tracks.map((track) => {
              const isPlaying = playingTrackId === track.id;
              const isSelected = currentTrackId === track.id || currentTrackId === track.providerId;

              return (
                <div
                  key={track.id}
                  className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                    isSelected
                      ? 'bg-[#FF4F9A]/10 border-[#FF4F9A]/40'
                      : 'bg-[#151519] border-[#303039]/60 hover:border-[#303039] hover:bg-[#1C1C22]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                    {/* Artwork + Play button */}
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 group/cover">
                      {track.coverUrl ? (
                        <img
                          src={track.coverUrl}
                          alt={track.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-tr from-purple-800 to-pink-600 flex items-center justify-center text-white">
                          <Music className="w-5 h-5" />
                        </div>
                      )}
                      {track.previewAvailable && (
                        <button
                          type="button"
                          onClick={() => togglePlay(track)}
                          className={`absolute inset-0 flex items-center justify-center bg-black/60 transition-opacity ${
                            isPlaying ? 'opacity-100' : 'opacity-0 group-hover/cover:opacity-100'
                          }`}
                          title={isPlaying ? 'Pause preview' : 'Play preview'}
                        >
                          {isPlaying ? (
                            <Pause className="w-5 h-5 text-[#FF4F9A]" />
                          ) : (
                            <Play className="w-5 h-5 text-white fill-white" />
                          )}
                        </button>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs sm:text-sm font-semibold text-white truncate block">
                          {track.title}
                        </span>
                        {isPlaying && (
                          <Volume2 className="w-3.5 h-3.5 text-[#FF4F9A] animate-pulse shrink-0" />
                        )}
                      </div>
                      <span className="text-[11px] text-[#B8B8C2] truncate block">
                        {track.artist} {track.album ? `• ${track.album}` : ''}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.2 rounded-md bg-[#26262E] text-[#9A9AA6] border border-[#303039]/60">
                          {track.provider === 'itunes' ? 'Apple Music' : track.provider === 'spotify' ? 'Spotify' : 'Library'}
                        </span>
                        {track.duration && (
                          <span className="text-[10px] text-[#757582]">
                            {Math.floor(track.duration / 60)}:
                            {(track.duration % 60).toString().padStart(2, '0')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {track.externalUrl && (
                      <a
                        href={track.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl text-[#757582] hover:text-[#B8B8C2] hover:bg-[#26262E] transition-colors"
                        title="Open track"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSelectTrack(track)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-[#FF4F9A] text-white shadow-pink-glow'
                          : 'bg-[#26262E] hover:bg-[#FF4F9A] text-white hover:shadow-pink-glow'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Current</span>
                        </>
                      ) : (
                        <span>Choose</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-[#151519] border-t border-[#303039] text-center text-[11px] text-[#757582] flex items-center justify-center gap-2">
          <span>🎧 Legal 30-second licensed preview streams from Apple Music & authorized catalogues</span>
        </div>
      </div>
    </div>
  );
}

