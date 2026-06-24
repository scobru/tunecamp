import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Github, Maximize2, AlertTriangle } from 'lucide-react';
import type { LabAppRecord } from '../types';
import { useAuthStore } from '../stores/useAuthStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import API from '../services/api';

const LabApp = () => {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<LabAppRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, role } = useAuthStore();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Handle postMessage protocol from lab apps (getUser, exportAudio)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type !== 'tunecamp:request') return;
      const { action, payload } = event.data;
      const source = event.source as Window | null;
      if (!source) return;

      const respond = (responsePayload: unknown) =>
        source.postMessage({ type: 'tunecamp:response', action, payload: responsePayload }, event.origin || '*');

      if (action === 'getUser') {
        respond(user
          ? {
              id: user.id ?? user.artistId ?? null,
              username: user.username,
              role: role ?? null,
              artistId: user.artistId ?? null,
            }
          : null);
      } else if (action === 'getLibrary') {
        try {
          const limit = payload?.limit ?? 50;
          const tracks = await API.getTracks();
          const slice = tracks.slice(0, limit);
          
          const makeAbsolute = (url: string) => {
            if (!url) return '';
            if (url.startsWith('/') || !url.includes('://')) {
              return new URL(url, window.location.origin).toString();
            }
            return url;
          };

          respond({
            tracks: slice.map((t) => ({
              id: t.id,
              title: t.title,
              artist: t.artistName || t.artist_name || '',
              album: t.albumName || t.album_title || '',
              duration: t.duration,
              streamUrl: makeAbsolute(API.getStreamUrl(t.id)),
              coverUrl: makeAbsolute(API.getTrackCoverUrl(t.id)),
            })),
          });
        } catch {
          respond({ tracks: [] });
        }
      } else if (action === 'getNowPlaying') {
        const { currentTrack, isPlaying, currentTime, duration } = usePlayerStore.getState();
        if (!currentTrack) {
          respond(null);
        } else {
          const makeAbsolute = (url: string) => {
            if (!url) return '';
            if (url.startsWith('/') || !url.includes('://')) {
              return new URL(url, window.location.origin).toString();
            }
            return url;
          };

          respond({
            track: {
              id: currentTrack.id,
              title: currentTrack.title,
              artist: currentTrack.artistName || currentTrack.artist_name || '',
              album: currentTrack.albumName || currentTrack.album_title || '',
              duration: currentTrack.duration,
              streamUrl: makeAbsolute(API.getStreamUrl(currentTrack.id)),
              coverUrl: makeAbsolute(API.getTrackCoverUrl(currentTrack.id)),
            },
            isPlaying,
            currentTime,
            duration,
          });
        }
      } else if (action === 'exportAudio') {
        try {
          const blob: Blob = payload?.blob;
          if (!(blob instanceof Blob)) throw new Error('No audio blob received');
          const filename = payload?.filename || 'mix.wav';
          const mimeType = payload?.mimeType || 'audio/wav';
          const file = new File([blob], filename, { type: mimeType });
          await API.uploadTracks([file], {
            artist: user?.username,
            ...(user?.artistId ? { artistId: user.artistId } : {}),
          });
          respond({ success: true });
        } catch (err: any) {
          respond({ success: false, error: err?.message || 'Upload failed' });
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [user, role]);

  useEffect(() => {
    API.getLabApps()
      .then((apps) => {
        const found = apps.find((a) => String(a.id) === appId);
        setApp(found ?? null);
      })
      .catch(() => setApp(null))
      .finally(() => setLoading(false));
  }, [appId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="loading loading-spinner loading-md opacity-40" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <AlertTriangle size={48} className="opacity-30" />
        <h2 className="text-2xl font-black">App not found</h2>
        <p className="opacity-50">No lab app with id <code>{appId}</code></p>
        <button className="btn btn-primary" onClick={() => navigate('/lab')}>
          Back to Lab
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col animate-fade-in" style={{ height: 'calc(100vh - 10rem)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-base-content/10 bg-base-200 flex-shrink-0">
        <button
          className="btn btn-ghost btn-sm gap-2"
          onClick={() => navigate('/lab')}
        >
          <ArrowLeft size={16} />
          Lab
        </button>

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-black truncate">{app.name}</h2>
          {app.author && (
            <p className="text-xs opacity-40 hidden sm:block truncate">by {app.author}</p>
          )}
        </div>

        {app.permissions.length > 0 && (
          <div className="hidden md:flex items-center gap-1">
            {app.permissions.map((p) => (
              <span key={p} className="badge badge-xs badge-outline opacity-40">
                {p}
              </span>
            ))}
          </div>
        )}

        {app.sourceUrl && (
          <a
            href={app.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm btn-square opacity-50 hover:opacity-100"
            title="View source on GitHub"
          >
            <Github size={16} />
          </a>
        )}

        <a
          href={(() => {
            if (!app) return '#';
            // For audiofabric, pass the session token so it can stream from
            // the Subsonic API when opened fullscreen in a new tab.
            const token = localStorage.getItem('tunecamp_token');
            if (app.name.toLowerCase() === 'audiofabric' && token) {
              const params = new URLSearchParams({
                tc: window.location.origin,
                u: user?.username || '_',
                p: token,
              });
              return `${app.src}?${params.toString()}`;
            }
            return app.src;
          })()}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm btn-square opacity-50 hover:opacity-100"
          title="Open in new tab"
        >
          <Maximize2 size={16} />
        </a>
      </div>

      {/* iFrame */}
      <iframe
        ref={iframeRef}
        src={app.src}
        title={app.name}
        className="flex-1 w-full border-none bg-base-100"
        sandbox={app.sandbox.join(' ')}
        allow={app.allow.join('; ')}
        loading="lazy"
      />
    </div>
  );
};

export default LabApp;
