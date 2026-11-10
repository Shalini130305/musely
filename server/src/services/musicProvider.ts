import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';

export interface MusicSearchResult {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  coverUrl?: string | null;
  audioUrl: string;
  duration?: number | null; // in seconds
  provider: 'itunes' | 'spotify' | 'library';
  providerId?: string | null;
  previewAvailable: boolean;
  externalUrl?: string | null;
}

// In-memory cache for Spotify App Access Token
let spotifyAccessToken: string | null = null;
let spotifyTokenExpiry = 0;

/**
 * Obtain Spotify Client Credentials token if credentials exist
 */
async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const now = Date.now();
  if (spotifyAccessToken && now < spotifyTokenExpiry - 60000) {
    return spotifyAccessToken;
  }

  try {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      logger.warn(`Spotify token request failed with status ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    spotifyAccessToken = data.access_token;
    spotifyTokenExpiry = now + data.expires_in * 1000;
    return spotifyAccessToken;
  } catch (err) {
    logger.error('Failed to obtain Spotify access token:', err);
    return null;
  }
}

/**
 * Search Spotify Web API if credentials are provided
 */
async function searchSpotify(query: string, limit = 10): Promise<MusicSearchResult[]> {
  try {
    const token = await getSpotifyToken();
    if (!token) return [];

    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      logger.warn(`Spotify search failed with status ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      tracks?: {
        items: Array<{
          id: string;
          name: string;
          artists: Array<{ name: string }>;
          album: { name: string; images: Array<{ url: string }> };
          duration_ms: number;
          preview_url: string | null;
          external_urls: { spotify: string };
        }>;
      };
    };

    const items = data.tracks?.items || [];
    return items.map((t) => ({
      id: `spotify_${t.id}`,
      title: t.name,
      artist: t.artists.map((a) => a.name).join(', '),
      album: t.album?.name || null,
      coverUrl: t.album?.images?.[0]?.url || null,
      audioUrl: t.preview_url || '',
      duration: Math.round(t.duration_ms / 1000),
      provider: 'spotify' as const,
      providerId: t.id,
      previewAvailable: Boolean(t.preview_url),
      externalUrl: t.external_urls?.spotify || null,
    }));
  } catch (err) {
    logger.warn('Error during Spotify track search:', err);
    return [];
  }
}

/**
 * Search official Apple Music / iTunes Public Search API (Worldwide catalogue)
 */
async function searchITunes(query: string, limit = 20): Promise<MusicSearchResult[]> {
  try {
    // Official Apple Music / iTunes public catalogue search API
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!res.ok) {
      logger.warn(`iTunes search failed with status ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      resultCount: number;
      results: Array<{
        trackId: number;
        trackName: string;
        artistName: string;
        collectionName?: string;
        artworkUrl100?: string;
        previewUrl?: string;
        trackTimeMillis?: number;
        trackViewUrl?: string;
      }>;
    };

    const results = data.results || [];
    return results
      .filter((t) => t.trackName && t.artistName)
      .map((t) => {
        // Upgrade artwork from 100x100 to 600x600 for sharp rendering
        const artwork = t.artworkUrl100
          ? t.artworkUrl100.replace(/100x100bb(\.[a-z]+)$/i, '600x600bb$1')
          : null;

        return {
          id: `itunes_${t.trackId}`,
          title: t.trackName,
          artist: t.artistName,
          album: t.collectionName || null,
          coverUrl: artwork,
          audioUrl: t.previewUrl || '',
          duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 30,
          provider: 'itunes' as const,
          providerId: String(t.trackId),
          previewAvailable: Boolean(t.previewUrl),
          externalUrl: t.trackViewUrl || null,
        };
      });
  } catch (err) {
    logger.warn('Error during iTunes track search:', err);
    return [];
  }
}

/**
 * Search local seeded/curated library tracks in database
 */
async function searchLocalLibrary(query: string, limit = 10): Promise<MusicSearchResult[]> {
  try {
    const tracks = await prisma.musicTrack.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { artist: { contains: query, mode: 'insensitive' } },
          { album: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      coverUrl: t.coverUrl,
      audioUrl: t.audioUrl,
      duration: t.duration,
      provider: 'library' as const,
      providerId: t.providerId || t.id,
      previewAvailable: Boolean(t.audioUrl),
      externalUrl: t.externalUrl,
    }));
  } catch (err) {
    logger.warn('Error searching local library:', err);
    return [];
  }
}

/**
 * Unified Worldwide Music Search
 * Searches across local library, Apple Music / iTunes public catalogue, and Spotify (if configured)
 */
export async function searchWorldwideMusic(
  query: string,
  options?: { limit?: number; provider?: 'all' | 'itunes' | 'spotify' | 'library' }
): Promise<MusicSearchResult[]> {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return [];

  const limit = options?.limit || 25;
  const providerFilter = options?.provider || 'all';

  const promises: Promise<MusicSearchResult[]>[] = [];

  if (providerFilter === 'all' || providerFilter === 'library') {
    promises.push(searchLocalLibrary(cleanQuery, 10));
  }

  if (providerFilter === 'all' || providerFilter === 'itunes') {
    promises.push(searchITunes(cleanQuery, limit));
  }

  if (providerFilter === 'all' || providerFilter === 'spotify') {
    promises.push(searchSpotify(cleanQuery, 10));
  }

  const results = await Promise.all(promises);
  const flattened = results.flat();

  // Deduplicate by title + artist (case-insensitive)
  const seen = new Set<string>();
  const deduplicated: MusicSearchResult[] = [];

  for (const track of flattened) {
    const key = `${track.title.toLowerCase()}:::${track.artist.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(track);
    }
  }

  return deduplicated.slice(0, limit);
}

/**
 * Persists an external or local track into the MusicTrack database table
 * and returns the saved MusicTrack model.
 */
export async function persistMusicTrack(trackData: {
  title: string;
  artist: string;
  album?: string | null;
  coverUrl?: string | null;
  audioUrl?: string | null;
  duration?: number | null;
  providerId?: string | null;
  providerName?: string | null;
  previewUrl?: string | null;
  externalUrl?: string | null;
  licenseSource?: string | null;
}) {
  const title = trackData.title.trim();
  const artist = trackData.artist.trim();
  const audioUrl = (trackData.audioUrl || trackData.previewUrl || '').trim();

  // Try to find existing track by providerId or title+artist
  if (trackData.providerId) {
    const existing = await prisma.musicTrack.findFirst({
      where: { providerId: trackData.providerId },
    });
    if (existing) {
      return existing;
    }
  }

  const existingByName = await prisma.musicTrack.findFirst({
    where: {
      title: { equals: title, mode: 'insensitive' },
      artist: { equals: artist, mode: 'insensitive' },
    },
  });

  if (existingByName) {
    // Update missing audioUrl/coverUrl if provided
    return await prisma.musicTrack.update({
      where: { id: existingByName.id },
      data: {
        coverUrl: existingByName.coverUrl || trackData.coverUrl,
        audioUrl: existingByName.audioUrl || audioUrl,
        duration: existingByName.duration || trackData.duration,
        album: existingByName.album || trackData.album,
        externalUrl: existingByName.externalUrl || trackData.externalUrl,
      },
    });
  }

  // Create new MusicTrack entry
  return await prisma.musicTrack.create({
    data: {
      title,
      artist,
      album: trackData.album || null,
      coverUrl: trackData.coverUrl || null,
      audioUrl: audioUrl || 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3',
      duration: trackData.duration || 30,
      isLicensed: true,
      licenseSource: trackData.licenseSource || (trackData.providerName === 'itunes' ? 'Apple Music Public Preview' : 'Authorized Music Provider'),
      providerId: trackData.providerId || null,
      providerName: trackData.providerName || 'library',
      previewUrl: audioUrl || null,
      externalUrl: trackData.externalUrl || null,
    },
  });
}
