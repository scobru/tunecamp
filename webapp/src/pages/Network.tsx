import { confirm } from '@/utils/confirm';
import React, { useState, useEffect, useCallback, memo } from "react";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { Globe, Server, Music, ExternalLink, Play, ChevronDown, Users, FileText, Library, Loader2 } from "lucide-react";

type NetworkTab = "peers" | "releases" | "my-instance" | "posts" | "instances" | "tunecamp-network" | "other-networks";
import { usePlayerStore } from "../stores/usePlayerStore";
import { PageHeader } from "../components/ui/PageHeader";
import { PeerSessionCard } from "../components/network/PeerSessionCard";
import { StringUtils } from "../utils/stringUtils";
import { formatDuration } from "../utils/format";
import { notify } from "../utils/notify";
import type { NetworkSite, NetworkTrack, NetworkStatus } from "../types";
import { renderMarkdown } from "../utils/markdown";
import { sanitizeHtml } from "../utils/sanitize";

const getHostname = (url: string) => {
  try {
    if (!url) return "Unknown";
    if (url.startsWith("https://") || url.startsWith("http://")) {
      const u = new URL(url);
      return u.hostname;
    }
    if (url.includes("/users/")) {
      const u = new URL(url);
      return u.hostname;
    }
    return url || "Unknown";
  } catch {
    return url || "Unknown";
  }
};

/**
 * Resolves a URL that might be relative to a remote site's base URL.
 */
const resolveUrl = (url?: string, baseUrl?: string) => {
  if (!url) return undefined;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/") && baseUrl) {
    const cleanBase = baseUrl.replace(/\/$/, "");
    return `${cleanBase}${url}`;
  }
  return url;
};

const getFederationBadge = (federation?: string) => {
  switch (federation) {
    case "local": return { label: "LOCAL", class: "badge-primary" };
    case "activitypub": return { label: "AP", class: "badge-accent" };
    case "rss": return { label: "RSS", class: "badge-warning" };
    case "http": return { label: "HTTP", class: "badge-info" };
    case "federated": return { label: "FED", class: "badge-success" };
    case "gundb":
    case "zen": return { label: "ZEN", class: "badge-secondary" };
    default: return { label: "NET", class: "badge-ghost" };
  }
};

const SiteCard = memo(({ site }: { site: any }) => {
  const isLocal = site.federation === "local";
  const coverUrl = resolveUrl(site.coverImage, site.url);
  
  const handleCardClick = () => {
    window.open(site.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      onClick={handleCardClick}
      className={`card bg-base-200 border cursor-pointer ${isLocal ? 'border-primary/50' : 'border-base-content/5'} hover:border-primary/30 transition-all hover:scale-[1.01] group`}
    >
      <figure className="h-32 bg-base-300 relative overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            alt={site.name}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl opacity-20 bg-gradient-to-br from-blue-500/10 to-purple-500/10">
            <span>{isLocal ? "🏠" : "🏢"}</span>
          </div>
        )}
        <div className="absolute bottom-2 right-2 badge badge-neutral badge-sm bg-black/50 border-none backdrop-blur-md">
          {isLocal ? "LOCAL" : getHostname(site.url)}
        </div>
        {isLocal && (
          <div className="absolute top-2 left-2 badge badge-primary badge-xs">
            YOU
          </div>
        )}
      </figure>
      <div className="card-body p-4">
        <h3 className="font-bold text-lg group-hover:text-primary transition-colors flex items-center gap-2">
          {site.name}
          <ExternalLink size={12} className="opacity-50" />
        </h3>
        <p className="text-sm opacity-60 line-clamp-2">
          {site.description || "No description provided."}
        </p>

        {site.communityLink && (
          <div className="mt-3 flex" onClick={(e) => e.stopPropagation()}>
            <a
              href={site.communityLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-xs btn-secondary border border-base-content/10 hover:border-primary/30 flex items-center gap-1 font-bold rounded-lg w-full justify-center"
            >
              💬 Join Community Chat
            </a>
          </div>
        )}

        <div className="flex items-center justify-between text-xs font-mono opacity-50 border-t border-base-content/5 pt-4 mt-2">
          <span className={`badge badge-xs ${getFederationBadge(site.federation).class}`}>
            {getFederationBadge(site.federation).label}
          </span>
          <span>
            {site.lastSeen ? StringUtils.formatTimeAgo(new Date(site.lastSeen).getTime()) : "Never"}
          </span>
        </div>
      </div>
    </div>
  );
});

const PostCard = memo(({ 
  item, 
  onToggleVisibility, 
  isHidden, 
  isAdmin 
}: { 
  item: NetworkTrack; 
  onToggleVisibility: (id: string) => void;
  isHidden: boolean;
  isAdmin: boolean;
}) => {
  const uniqueId = item.slug || "";
  const siteUrl = item.siteUrl;
  const baseUrl = siteUrl ? siteUrl.replace(/\/$/, "") : "";
  const coverUrl = resolveUrl(item.coverUrl, baseUrl);

    return (
      <div
        className={`card border hover:bg-base-200 transition-all group shadow-sm hover:shadow-md ${isHidden ? "bg-error/10 border-error/20 opacity-70" : "bg-base-200/50 border-base-content/5"}`}
      >
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary overflow-hidden">
                {coverUrl ? (
                  <img src={coverUrl} className="w-full h-full object-cover" alt={item.artistName} />
                ) : (
                  <span>{item.artistName?.charAt(0)}</span>
                )}
              </div>

            <div className="flex flex-col">
              <span className="text-sm font-bold">{item.artistName}</span>
              <span className="text-xs opacity-50">
                {item.published_at ? StringUtils.formatTimeAgo(new Date(item.published_at).getTime()) : ""}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
             <span className={`badge badge-xs ${getFederationBadge(item.federation).class}`}>
                {getFederationBadge(item.federation).label}
             </span>
             {isAdmin && (
              <button
                className={`btn btn-xs btn-ghost btn-circle tooltip tooltip-left ${isHidden ? "text-primary" : "text-error opacity-0 group-hover:opacity-100"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(uniqueId);
                }}
                data-tip={isHidden ? "Unhide Post" : "Hide Post"}
              >
                {isHidden ? "👁️" : "🗑️"}
              </button>
            )}
          </div>
        </div>

        <div className="text-sm opacity-80 line-clamp-4 prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.federation === "local" ? renderMarkdown(item.content || "") : item.content || "") }}>
        </div>

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-base-content/5">
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs opacity-40 hover:text-primary transition-colors flex items-center gap-1"
          >
            <Globe size={10} />
            {getHostname(siteUrl)}
          </a>
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-xs btn-primary btn-outline gap-1"
          >
            View Post
            <ExternalLink size={10} />
          </a>
        </div>
      </div>
    </div>
  );
});

const TrackCard = memo(({ 
    item, 
    onPlay, 
    onToggleVisibility, 
    isHidden, 
    isAdmin 
}: { 
    item: NetworkTrack; 
    onPlay: (item: NetworkTrack) => void;
    onToggleVisibility: (id: string) => void;
    isHidden: boolean;
    isAdmin: boolean;
}) => {
  const uniqueId = item.slug || (item.siteUrl + "::" + (item.track?.id || ""));
  const baseUrl = item.siteUrl ? item.siteUrl.replace(/\/$/, "") : "";
  
  // Resolve cover URL — works for AP, HTTP, and local tracks
  let coverUrl = resolveUrl(item.coverUrl, baseUrl);
  if (!coverUrl && item.track) {
    coverUrl = resolveUrl(item.track.coverImage, baseUrl) ||
      resolveUrl(item.track.coverUrl, baseUrl) ||
      (item.track.albumId && baseUrl
        ? `${baseUrl}/api/albums/${encodeURIComponent(item.track.albumId)}/cover`
        : undefined);
  }
  if (coverUrl && !coverUrl.startsWith("http") && !coverUrl.startsWith("/") && !coverUrl.startsWith("data:") && !coverUrl.startsWith("blob:")) {
    coverUrl = undefined;
  }

  const title = item.title || item.track?.title || "Untitled";
  const artist = item.artistName || item.track?.artistName || "Unknown Artist";
  const duration = item.duration || item.track?.duration || 0;
  const siteUrl = item.siteUrl;
  const isPeer = item.type === "peer";
  const badge = isPeer ? { label: "PEER", class: "badge-secondary" } : getFederationBadge(item.federation);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  const handleImport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (importing || imported || !item.downloadUrl) return;
    setImporting(true);
    try {
      await API.importFederatedTrack({
        downloadUrl: item.downloadUrl,
        title,
        artist,
        album: item.releaseTitle,
      });
      setImported(true);
      notify.success("Track imported into your library");
    } catch (err) {
      console.error("Failed to import federated peer track:", err);
      notify.error("Failed to import track");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      className={`card border hover:bg-base-200 transition-all cursor-pointer group shadow-sm hover:shadow-md ${isHidden ? "bg-error/10 border-error/20 opacity-70" : "bg-base-200/50 border-base-content/5"}`}
      onClick={() => onPlay(item)}
    >
      <div className="p-3 flex items-center gap-4">
        <div className="relative w-12 h-12 rounded-lg bg-base-300 flex-shrink-0 overflow-hidden">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl opacity-30">
              🎵
            </div>
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Play size={20} className="text-white fill-current" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate pr-2 flex items-center gap-2">
            {title}
            {isHidden && (
              <span className="badge badge-error badge-xs">
                Hidden
              </span>
            )}
            <span className={`badge badge-xs ${badge.class}`}>
              {badge.label}
            </span>
          </div>
          <div className="text-xs opacity-60 truncate flex items-center gap-1">
            <span>{artist}</span>
            <span className="opacity-40">•</span>
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hover:text-primary hover:underline"
            >
              {getHostname(siteUrl)}
            </a>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="text-xs font-mono opacity-40">
            {formatDuration(duration)}
          </div>
          {isAdmin && isPeer && item.downloadUrl && (
            <button
              className="btn btn-xs btn-ghost btn-circle tooltip tooltip-left"
              disabled={importing || imported}
              onClick={handleImport}
              data-tip={imported ? "Imported into library" : "Import into library"}
            >
              {importing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Library size={14} className={imported ? "text-success" : "opacity-70"} />
              )}
            </button>
          )}
          {isAdmin && (
            <button
              className={`btn btn-xs btn-ghost btn-circle tooltip tooltip-left ${isHidden ? "text-primary" : "text-error opacity-0 group-hover:opacity-100"}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(uniqueId);
              }}
              data-tip={isHidden ? "Unhide Track" : "Hide Track"}
            >
              {isHidden ? "👁️" : "🗑️"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * A collapsible group of tracks by a single artist within an instance.
 * Always collapsed by default so the network page loads fast.
 */
const ArtistGroup = memo(({
  artist,
  tracks,
  onPlay,
  onToggleVisibility,
  hiddenTracks,
  isAdmin,
}: {
  artist: string;
  tracks: NetworkTrack[];
  onPlay: (item: NetworkTrack) => void;
  onToggleVisibility: (id: string) => void;
  hiddenTracks: string[];
  isAdmin: boolean;
}) => {
  const firstWithCover = tracks.find((t) => t.coverUrl);
  const baseUrl = tracks[0]?.siteUrl ? tracks[0].siteUrl.replace(/\/$/, "") : "";
  const coverUrl = resolveUrl(firstWithCover?.coverUrl, baseUrl);

  return (
    <details className="group/artist bg-base-200/40 rounded-xl border border-base-content/5 overflow-hidden">
      <summary className="flex items-center gap-3 p-3 cursor-pointer hover:bg-base-200/70 transition-colors list-none [&::-webkit-details-marker]:hidden">
        <div className="w-9 h-9 rounded-md bg-base-300 overflow-hidden flex-shrink-0 flex items-center justify-center text-sm font-bold opacity-70">
          {coverUrl ? <img src={coverUrl} className="w-full h-full object-cover" alt={artist} /> : <span>{artist.charAt(0)}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{artist}</div>
          <div className="text-xs opacity-50">{tracks.length} track{tracks.length === 1 ? "" : "s"}</div>
        </div>
        <ChevronDown size={16} className="opacity-40 transition-transform group-open/artist:rotate-180" />
      </summary>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 p-3 pt-0">
        {tracks.map((item, i) => {
          const uniqueId = item.slug || (item.siteUrl + "::" + item.track?.id);
          return (
            <TrackCard
              key={uniqueId || i}
              item={item}
              onPlay={onPlay}
              onToggleVisibility={onToggleVisibility}
              isHidden={hiddenTracks.includes(uniqueId)}
              isAdmin={isAdmin}
            />
          );
        })}
      </div>
    </details>
  );
});

/**
 * A collapsible section for one federated instance, with its tracks grouped by
 * artist inside. Keeps the Network page navigable as the number of followed
 * instances and artists grows.
 */
const InstanceGroup = memo(({
  host,
  name,
  federation,
  tracks,
  onPlay,
  onToggleVisibility,
  hiddenTracks,
  isAdmin,
}: {
  host: string;
  name?: string;
  federation?: string;
  tracks: NetworkTrack[];
  onPlay: (item: NetworkTrack) => void;
  onToggleVisibility: (id: string) => void;
  hiddenTracks: string[];
  isAdmin: boolean;
}) => {
  const byArtist = new Map<string, NetworkTrack[]>();
  for (const t of tracks) {
    const a = t.artistName || t.track?.artistName || "Unknown Artist";
    if (!byArtist.has(a)) byArtist.set(a, []);
    byArtist.get(a)!.push(t);
  }
  const artists = Array.from(byArtist.entries()).sort((a, b) => b[1].length - a[1].length);
  const badge = getFederationBadge(federation);

  return (
    <details className="group bg-base-200/30 rounded-2xl border border-base-content/10 overflow-hidden">
      <summary className="flex items-center gap-3 p-4 cursor-pointer hover:bg-base-200/60 transition-colors list-none [&::-webkit-details-marker]:hidden">
        <Server size={18} className="text-accent flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate flex items-center gap-2">
            {name || host}
            <span className={`badge badge-xs ${badge.class}`}>{badge.label}</span>
          </div>
          <div className="text-xs opacity-50 truncate">
            {host} · {tracks.length} track{tracks.length === 1 ? "" : "s"} · {artists.length} artist{artists.length === 1 ? "" : "s"}
          </div>
        </div>
        <ChevronDown size={18} className="opacity-40 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 p-4 pt-0">
        {artists.map(([artist, artistTracks]) => (
          <ArtistGroup
            key={artist}
            artist={artist}
            tracks={artistTracks}
            onPlay={onPlay}
            onToggleVisibility={onToggleVisibility}
            hiddenTracks={hiddenTracks}
            isAdmin={isAdmin}
          />
        ))}
      </div>
    </details>
  );
});

const Network = () => {
  const [sites, setSites] = useState<NetworkSite[]>([]);
  const [tracks, setTracks] = useState<NetworkTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const { playTrack, currentTrack } = usePlayerStore();
  const { isAdminAuthenticated, isAuthenticated } = useAuthStore();
  const [hiddenTracks, setHiddenTracks] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [peerStatus, setPeerStatus] = useState<{ enabled: boolean; allowDownloads: boolean } | null>(null);
  const [peerSessions, setPeerSessions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<NetworkTab>("tunecamp-network");

  useEffect(() => {
    const loadData = async () => {
      try {
        const [sitesData, tracksData, statusData, s, pStatus] = await Promise.all([
          API.getNetworkSites(),
          API.getNetworkTracks(),
          API.getNetworkStatus().catch(() => null),
          API.getSiteSettings().catch(() => ({} as any)),
          API.getPeerStatus().catch(() => null),
        ]);
        if (s && (s.hideNetwork === true || s.hideNetwork === "true")) {
          setEnabled(false);
        }
        setStatus(statusData);

        // Deduplicate Sites by hostname — the same instance can be registered
        // under multiple URL forms (http vs https, trailing path variants),
        // which a URL-string key would miss.
        const uniqueSites = new Map();
        sitesData.forEach((s: any) => {
          if (!s.url || !s.url.startsWith("http")) return;
          const normalizedUrl = s.url.replace(/\/$/, "");
          const key = getHostname(normalizedUrl);
          if (!uniqueSites.has(key)) {
            uniqueSites.set(key, { ...s, url: normalizedUrl });
          }
        });
        const sites = Array.from(uniqueSites.values()) as NetworkSite[];

        // Process Tracks — unified across all federation types
        const validTracks = tracksData.filter((t: any) => {
          // AP/local/HTTP/RSS tracks — must have either audioUrl or slug.
          // RSS posts have no audio but carry a slug (the feed item guid), so
          // they pass on the slug check just like AP posts do.
          if (t.federation === "activitypub" || t.federation === "local" || t.federation === "http" || t.federation === "rss") {
            return !!t.audioUrl || !!t.slug;
          }
          // Legacy the Zen network tracks (if any remain)
          if (t.track) {
            const url = t.siteUrl;
            return url && url.trim() !== "/" && url.trim() !== "";
          }
          return false;
        }) as NetworkTrack[];

        const uniqueContent = new Map<string, NetworkTrack>();
        validTracks.forEach((t) => {
          const title = t.title || t.track?.title || "";
          const artist = t.artistName || t.track?.artistName || "unknown";
          const key = `${title.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;
          if (!uniqueContent.has(key)) {
            uniqueContent.set(key, t);
          }
        });

        const finalTracks = Array.from(uniqueContent.values());
        setSites(sites);
        setTracks(finalTracks);
        setPeerStatus(pStatus);
        if (pStatus?.enabled && isAuthenticated) {
          try {
            const pSessions = await API.getPeerSessions();
            setPeerSessions(pSessions);
          } catch (err) {
            console.error("Failed to load peer sessions:", err);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadData();

    const stored = localStorage.getItem("tunecamp_blocked_tracks");
    if (stored) {
      try {
        setHiddenTracks(JSON.parse(stored));
      } catch {}
    }
  }, []);

  const toggleTrackVisibility = useCallback((id: string) => {
    setHiddenTracks(prev => {
        const newHidden = prev.includes(id)
            ? prev.filter((u) => u !== id)
            : [...prev, id];
        localStorage.setItem("tunecamp_blocked_tracks", JSON.stringify(newHidden));
        return newHidden;
    });
  }, []);

  const handlePlayNetworkTrack = useCallback((networkTrack: NetworkTrack) => {
    // AP, local, HTTP and RSS tracks — use the flat data structure
    if (networkTrack.federation === "activitypub" || networkTrack.federation === "local" || networkTrack.federation === "http" || networkTrack.federation === "rss") {
      const track = {
        id: networkTrack.slug || "",
        title: networkTrack.title || "",
        artistName: networkTrack.artistName || "",
        albumTitle: networkTrack.releaseTitle || "",
        streamUrl: networkTrack.audioUrl || "",
        coverUrl: networkTrack.coverUrl || "",
        coverImage: networkTrack.coverUrl || "",
        duration: networkTrack.duration || 0,
        siteUrl: networkTrack.siteUrl || "",
        service: networkTrack.federation,
      };
      if (currentTrack?.id === track.id) return;
      playTrack(track as any, [track as any]);
      return;
    }

    // Legacy the Zen network tracks (if any remain from old data)
    if (!networkTrack.track || !networkTrack.siteUrl) return;
    if (currentTrack?.id === networkTrack.track.id) return;

    const baseUrl = networkTrack.siteUrl.replace(/\/$/, "");
    const trackData = networkTrack.track;

    const coverUrl =
      trackData.coverUrl ||
      trackData.coverImage ||
      (trackData.albumId
        ? `${baseUrl}/api/albums/${trackData.albumId}/cover`
        : undefined);

    const track = {
      ...trackData,
      streamUrl: API.getStreamUrl(trackData.streamUrl || trackData.id),
      coverUrl: coverUrl,
      coverImage: coverUrl,
    };

    playTrack(track as any, [track as any]);
  }, [currentTrack?.id, playTrack]);

  if (loading)
    return (
      <div className="p-12 text-center opacity-50 flex flex-col items-center gap-4">
        <Globe className="animate-pulse" size={48} />
        Scanning the universe...
      </div>
    );

  const filteredItems = tracks.filter((item: NetworkTrack) => {
    if (!item) return false;
    const uniqueId = item.slug || (item.siteUrl + "::" + item.track?.id);
    if (showHidden) return true;
    return !hiddenTracks.includes(uniqueId);
  });

  const allReleases = filteredItems.filter(t => !t.type || t.type === 'release' || t.type === 'peer');
  const allPosts = filteredItems.filter(t => t.type === 'post');

  // Separate local from remote for sections
  const localReleases = allReleases.filter(t => t.federation === "local");
  const remoteReleases = allReleases.filter(t => t.federation !== "local");

  // Group remote releases by instance (hostname), preserving a friendly name
  // from the site directory when we have one. Each group renders its tracks
  // grouped by artist, so following many instances stays navigable.
  const siteNameByHost = new Map<string, string>();
  for (const s of sites) {
    try {
      const h = getHostname((s as any).url);
      if (h && (s as any).name) siteNameByHost.set(h, (s as any).name);
    } catch { /* ignore */ }
  }
  const tunecampHostnames = new Set(sites.map(s => getHostname((s as any).url)));
  const tunecampReleases = remoteReleases.filter(t => tunecampHostnames.has(getHostname(t.siteUrl)));
  const otherReleases = remoteReleases.filter(t => !tunecampHostnames.has(getHostname(t.siteUrl)));

  const tunecampByHost = new Map<string, NetworkTrack[]>();
  for (const t of tunecampReleases) {
    const host = getHostname(t.siteUrl);
    if (!tunecampByHost.has(host)) tunecampByHost.set(host, []);
    tunecampByHost.get(host)!.push(t);
  }
  const tunecampGroups = Array.from(tunecampByHost.entries())
    .map(([host, items]) => ({ host, items, name: siteNameByHost.get(host) }))
    .sort((a, b) => b.items.length - a.items.length);

  const otherByHost = new Map<string, NetworkTrack[]>();
  for (const t of otherReleases) {
    const host = getHostname(t.siteUrl);
    if (!otherByHost.has(host)) otherByHost.set(host, []);
    otherByHost.get(host)!.push(t);
  }
  const otherGroups = Array.from(otherByHost.entries())
    .map(([host, items]) => ({ host, items, name: siteNameByHost.get(host) }))
    .sort((a, b) => b.items.length - a.items.length);

  if (!enabled) {
    return (
      <div className="space-y-12 animate-fade-in pb-12">
        <PageHeader
          title="Federated Network"
          subtitle="Discover music across the decentralized TuneCamp network."
          icon={Globe}
          iconColor="text-blue-400"
          gradientFrom="from-blue-500/20"
          gradientTo="to-purple-500/20"
        />
        <div className="alert alert-warning max-w-xl shadow-level-1 rounded-xl">
          <Globe size={18} />
          <span>The network is disabled on this instance.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-fade-in pb-12">
      <PageHeader
        title="Federated Network"
        subtitle="Discover music across the decentralized TuneCamp network."
        icon={Globe}
        iconColor="text-blue-400"
        gradientFrom="from-blue-500/20"
        gradientTo="to-purple-500/20"
        extra={
          <div className="flex flex-wrap items-center gap-3 text-xs mt-2">
            <div
              className={`px-3 py-1 rounded-full border font-bold flex items-center gap-2 ${status?.activitypub?.enabled ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"}`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${status?.activitypub?.enabled ? "bg-blue-400" : "bg-yellow-400"}`}
              ></div>
              ActivityPub: {status?.activitypub?.enabled ? "ACTIVE" : "SETUP REQUIRED"}
            </div>
            <div className="px-3 py-1 rounded-full border border-base-content/10 text-base-content/50 font-bold">
              {(status?.sites || 0)} instances • {allReleases.length} tracks
            </div>
          </div>
        }
      >
        {isAdminAuthenticated && (
          <button
            className="btn btn-primary btn-sm gap-2 tooltip tooltip-bottom"
            data-tip="Federated sync: pull and push metadata updates"
            onClick={async () => {
              if (
                await confirm(
                  "Do you want to synchronize all content with ActivityPub? This will update metadata and ensure visibility settings are correct on remote instances.",
                )
              ) {
                try {
                  const res = (await API.syncActivityPub()) as {
                    artists: number;
                    notes: number;
                  };
                  notify.success(
                    `Sync complete! Processed ${res.artists} artists and ${res.notes} items.`,
                  );
                } catch (err: unknown) {
                  notify.error(err, "Sync failed");
                }
              }
            }}
          >
            <Server size={16} /> Sync with ActivityPub
          </button>
        )}
        {isAdminAuthenticated && (
          <div className="form-control ml-2">
            <label className="label cursor-pointer gap-2">
              <span className="label-text text-xs font-bold opacity-50">
                Show Hidden
              </span>
              <input
                type="checkbox"
                className="toggle toggle-xs toggle-neutral"
                checked={showHidden}
                onChange={(e) => setShowHidden(e.target.checked)}
              />
            </label>
          </div>
        )}
      </PageHeader>

      {/* Tab Bar */}
      {(() => {
        const showPeers = peerStatus?.enabled && isAuthenticated;
        const showPosts = allPosts.length > 0;
        const tabs: { id: NetworkTab; label: string; icon: React.ElementType; count: number }[] = [
          ...(showPeers ? [{ id: "peers" as NetworkTab, label: "Live Peers", icon: Users, count: peerSessions.length }] : []),
          { id: "tunecamp-network", label: "TuneCamp Network", icon: Globe, count: tunecampGroups.length },
          { id: "other-networks", label: "Other Networks", icon: ExternalLink, count: otherGroups.length },
          { id: "my-instance", label: "My Instance", icon: Music, count: localReleases.length },
          ...(showPosts ? [{ id: "posts" as NetworkTab, label: "Posts", icon: FileText, count: allPosts.length }] : []),
          { id: "instances", label: "Instances", icon: Server, count: sites.length },
        ];
        const currentTab = tabs.find(t => t.id === activeTab) ? activeTab : tabs[0]?.id ?? "tunecamp-network";

        return (
          <>
            {/* Tab buttons */}
            <div className="flex gap-0 border-b border-base-content/10 overflow-x-auto scrollbar-none -mb-4">
              {tabs.map(({ id, label, icon: Icon, count }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap shrink-0 ${
                    currentTab === id
                      ? "border-primary text-primary"
                      : "border-transparent opacity-40 hover:opacity-70"
                  }`}
                >
                  <Icon size={15} />
                  {label}
                  {count > 0 && (
                    <span className={`badge badge-sm font-bold ${currentTab === id ? "badge-primary" : "badge-neutral"}`}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="pt-4">

              {/* Live Peers */}
              {currentTab === "peers" && showPeers && (
                <section className="space-y-6">
                  {peerSessions.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {peerSessions.map((session) => (
                        <PeerSessionCard
                          key={session.id}
                          session={session}
                          allowDownloadsGlobal={peerStatus!.allowDownloads}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 opacity-40 border border-dashed border-base-content/5 rounded-xl text-sm">
                      No live peer channels currently online. Start a CLI daemon to share yours!
                    </div>
                  )}
                </section>
              )}

              {/* TuneCamp Network */}
              {currentTab === "tunecamp-network" && (
                <section className="space-y-4">
                  {tunecampGroups.length > 0 ? (
                    tunecampGroups.map((g) => (
                      <InstanceGroup
                        key={g.host}
                        host={g.host}
                        name={g.name}
                        federation={g.items[0]?.federation}
                        tracks={g.items}
                        onPlay={handlePlayNetworkTrack}
                        onToggleVisibility={toggleTrackVisibility}
                        hiddenTracks={hiddenTracks}
                        isAdmin={isAdminAuthenticated}
                      />
                    ))
                  ) : (
                    <div className="text-center py-12 opacity-40 border border-dashed border-base-content/5 rounded-xl text-sm">
                      No remote TuneCamp tracks discovered yet. Other instances will appear once they federate via ActivityPub or are discovered over HTTP.
                    </div>
                  )}
                </section>
              )}

              {/* Other Networks */}
              {currentTab === "other-networks" && (
                <section className="space-y-4">
                  {otherGroups.length > 0 ? (
                    otherGroups.map((g) => (
                      <InstanceGroup
                        key={g.host}
                        host={g.host}
                        name={g.name}
                        federation={g.items[0]?.federation}
                        tracks={g.items}
                        onPlay={handlePlayNetworkTrack}
                        onToggleVisibility={toggleTrackVisibility}
                        hiddenTracks={hiddenTracks}
                        isAdmin={isAdminAuthenticated}
                      />
                    ))
                  ) : (
                    <div className="text-center py-12 opacity-40 border border-dashed border-base-content/5 rounded-xl text-sm">
                      No tracks from other networks (RSS, external ActivityPub) discovered yet.
                    </div>
                  )}
                </section>
              )}

              {/* My Instance */}
              {currentTab === "my-instance" && (
                <section className="space-y-6">
                  {localReleases.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {localReleases.map((item, i) => {
                        const uniqueId = item.slug || String(i);
                        return (
                          <TrackCard
                            key={uniqueId}
                            item={item}
                            onPlay={handlePlayNetworkTrack}
                            onToggleVisibility={toggleTrackVisibility}
                            isHidden={hiddenTracks.includes(uniqueId)}
                            isAdmin={isAdminAuthenticated}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 opacity-40 border border-dashed border-base-content/10 rounded-xl text-sm">
                      No public releases on this instance.
                    </div>
                  )}
                </section>
              )}

              {/* Posts */}
              {currentTab === "posts" && showPosts && (
                <section className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {allPosts.map((item, i) => (
                      <PostCard
                        key={item.slug || i}
                        item={item}
                        onToggleVisibility={toggleTrackVisibility}
                        isHidden={hiddenTracks.includes(item.slug || "")}
                        isAdmin={isAdminAuthenticated}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Instances */}
              {currentTab === "instances" && (
                <section className="space-y-6">
                  {sites.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {sites.map((site, i) => (
                        <SiteCard key={site.url || i} site={site} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 opacity-40 border border-dashed border-base-content/5 rounded-xl text-sm">
                      No instances discovered yet.
                    </div>
                  )}
                </section>
              )}

            </div>
          </>
        );
      })()}
    </div>
  );
};

export default Network;

