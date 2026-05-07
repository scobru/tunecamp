import { useState, useEffect, useCallback, memo } from "react";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { Globe, Server, Music, ExternalLink, Play } from "lucide-react";
import { usePlayerStore } from "../stores/usePlayerStore";
import { StringUtils } from "../utils/stringUtils";
import { formatDuration } from "../utils/format";
import type { NetworkSite, NetworkTrack, NetworkStatus } from "../types";

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
    case "http": return { label: "HTTP", class: "badge-info" };
    case "gundb": return { label: "ZEN", class: "badge-secondary" };
    default: return { label: "NET", class: "badge-ghost" };
  }
};

const SiteCard = memo(({ site }: { site: any }) => {
  const isLocal = site.federation === "local";
  const coverUrl = resolveUrl(site.coverImage, site.url);
  
  return (
    <a
      href={site.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`card bg-base-200 border ${isLocal ? 'border-primary/50' : 'border-base-content/5'} hover:border-primary/30 transition-all hover:scale-[1.01] group`}
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

        <div className="flex items-center justify-between text-xs font-mono opacity-50 border-t border-base-content/5 pt-4 mt-2">
          <span className={`badge badge-xs ${getFederationBadge(site.federation).class}`}>
            {getFederationBadge(site.federation).label}
          </span>
          <span>
            {site.lastSeen ? StringUtils.formatTimeAgo(new Date(site.lastSeen).getTime()) : "Never"}
          </span>
        </div>
      </div>
    </a>
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
              <span className="text-[10px] opacity-50">
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
                className={`btn btn-xs btn-ghost btn-circle ${isHidden ? "text-primary" : "text-error opacity-0 group-hover:opacity-100"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(uniqueId);
                }}
              >
                {isHidden ? "👁️" : "🗑️"}
              </button>
            )}
          </div>
        </div>

        <div className="text-sm opacity-80 line-clamp-4 prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: item.content || "" }}>
        </div>

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-base-content/5">
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] opacity-40 hover:text-primary transition-colors flex items-center gap-1"
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
  const badge = getFederationBadge(item.federation);

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
          {isAdmin && (
            <button
              className={`btn btn-xs btn-ghost btn-circle ${isHidden ? "text-primary" : "text-error opacity-0 group-hover:opacity-100"}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(uniqueId);
              }}
              title={isHidden ? "Unhide Track" : "Hide Track"}
            >
              {isHidden ? "👁️" : "🗑️"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export const Network = () => {
  const [sites, setSites] = useState<NetworkSite[]>([]);
  const [tracks, setTracks] = useState<NetworkTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const { playTrack, currentTrack } = usePlayerStore();
  const { isAdminAuthenticated } = useAuthStore();
  const [hiddenTracks, setHiddenTracks] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [status, setStatus] = useState<NetworkStatus | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [sitesData, tracksData, statusData] = await Promise.all([
          API.getNetworkSites(),
          API.getNetworkTracks(),
          API.getNetworkStatus().catch(() => null),
        ]);
        setStatus(statusData);

        // Deduplicate Sites
        const uniqueSites = new Map();
        sitesData.forEach((s: any) => {
          if (!s.url || !s.url.startsWith("http")) return;
          const normalizedUrl = s.url.replace(/\/$/, "");
          if (!uniqueSites.has(normalizedUrl)) {
            uniqueSites.set(normalizedUrl, { ...s, url: normalizedUrl });
          }
        });
        const sites = Array.from(uniqueSites.values()) as NetworkSite[];

        // Process Tracks — unified across all federation types
        const validTracks = tracksData.filter((t: any) => {
          // AP/local/HTTP tracks — must have either audioUrl or slug
          if (t.federation === "activitypub" || t.federation === "local" || t.federation === "http") {
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
    // AP, local, or HTTP tracks — use the flat data structure
    if (networkTrack.federation === "activitypub" || networkTrack.federation === "local" || networkTrack.federation === "http") {
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

  const allReleases = filteredItems.filter(t => !t.type || t.type === 'release');
  const allPosts = filteredItems.filter(t => t.type === 'post');

  // Separate local from remote for sections
  const localReleases = allReleases.filter(t => t.federation === "local");
  const remoteReleases = allReleases.filter(t => t.federation !== "local");

  return (
    <div className="space-y-12 animate-fade-in pb-12">
      <header className="flex flex-col gap-4 border-b border-base-content/5 pb-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20">
              <Globe size={48} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight">
                Federated Network
              </h1>
              <p className="opacity-60 text-lg">
                Discover music across the decentralized TuneCamp network.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdminAuthenticated && (
              <button
                className="btn btn-primary btn-sm gap-2"
                onClick={async () => {
                  if (
                    confirm(
                      "Do you want to synchronize all content with ActivityPub? This will update metadata and ensure visibility settings are correct on remote instances.",
                    )
                  ) {
                    try {
                      const res = (await API.syncActivityPub()) as {
                        artists: number;
                        notes: number;
                      };
                      alert(
                        `Sync complete! Processed ${res.artists} artists and ${res.notes} items.`,
                      );
                    } catch (err: unknown) {
                      alert("Sync failed: " + (err instanceof Error ? err.message : String(err)));
                    }
                  }
                }}
              >
                <Server size={16} /> Sync with ActivityPub
              </button>
            )}
            {isAdminAuthenticated && (
              <div className="form-control ml-4">
                <label className="label cursor-pointer gap-2">
                  <span className="label-text text-xs uppercase font-bold opacity-50">
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
          </div>
        </div>

        {/* Network Status */}
        <div className="flex items-center gap-4 text-xs">
          <div
            className={`px-3 py-1 rounded-full border font-bold flex items-center gap-2 ${status?.zen?.connected ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${status?.zen?.connected ? "bg-green-400 animate-pulse" : "bg-red-400"}`}
            ></div>
            ZEN: {status?.zen?.connected
              ? `${status.zen.peers} PEERS`
              : "DISCONNECTED"}
          </div>
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
      </header>

      {/* Remote Network Content */}
      <section className="space-y-8">
        <div className="flex items-center gap-3 border-b border-base-content/5 pb-4">
          <Globe size={24} className="text-accent" />
          <div>
            <h2 className="text-2xl font-bold">Network Releases</h2>
            <p className="text-sm opacity-50">Tracks discovered from other TuneCamp instances via HTTP and ActivityPub.</p>
          </div>
        </div>

        {remoteReleases.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {remoteReleases.map((item, i) => {
              const uniqueId = item.slug || (item.siteUrl + "::" + item.track?.id);
              return (
                <TrackCard 
                  key={uniqueId || i} 
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
          <div className="text-center py-8 opacity-40 border border-dashed border-base-content/5 rounded-xl text-sm">
            No remote tracks discovered yet. Other instances will appear once they register via the Zen network or ActivityPub.
          </div>
        )}
      </section>

      {/* Local Content */}
      <section className="space-y-8 bg-base-content/5 p-8 rounded-3xl border border-base-content/5">
        <div className="flex items-center gap-3 border-b border-base-content/10 pb-4">
          <Music size={24} className="text-primary" />
          <div>
            <h2 className="text-2xl font-bold">My Instance</h2>
            <p className="text-sm opacity-50">Public releases from this server.</p>
          </div>
        </div>

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
          <div className="text-center py-8 opacity-40 border border-dashed border-base-content/10 rounded-xl text-sm">
            No public releases on this instance.
          </div>
        )}
      </section>

      {/* Community Posts */}
      {allPosts.length > 0 && (
        <section className="space-y-8">
          <div className="flex items-center gap-3 border-b border-base-content/5 pb-4">
            <Globe size={24} className="text-info" />
            <div>
              <h2 className="text-2xl font-bold">Community Posts</h2>
              <p className="text-sm opacity-50">Blog and social posts from the network.</p>
            </div>
          </div>
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

      {/* Instance Directory */}
      <section className="space-y-8">
        <div className="flex items-center gap-3 border-b border-base-content/5 pb-4">
          <Server size={24} className="text-info" />
          <div>
            <h2 className="text-2xl font-bold">Instance Directory</h2>
            <p className="text-sm opacity-50">All discovered TuneCamp instances across the network.</p>
          </div>
        </div>

        {sites.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sites.map((site, i) => (
              <SiteCard key={site.url || i} site={site} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 opacity-40 border border-dashed border-base-content/5 rounded-xl text-sm">
            No instances discovered yet.
          </div>
        )}
      </section>
    </div>
  );
};

