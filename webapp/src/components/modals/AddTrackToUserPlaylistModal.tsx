import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "../../stores/useAuthStore";
import API from "../../services/api";
import { Plus, Search, Music, Check, Globe } from "lucide-react";
import { notify } from "../../utils/notify";
import type { Track, NetworkTrack, UserPlaylistTrack } from "../../types";

/** Derive a short, human label for a federated site from its URL. */
const siteLabel = (url?: string) => {
  if (!url) return "Network";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Network";
  }
};

/** Stable id for a network track across the modal's session state. */
const networkTrackId = (nt: NetworkTrack) =>
  nt.slug || (nt.audioUrl ? nt.audioUrl : `${nt.siteUrl}::${nt.title}`);

/**
 * Resolves full artwork cover URL for a network track against its origin site URL.
 */
const resolveNetworkTrackCover = (nt: NetworkTrack): string | undefined => {
  const baseUrl = nt.siteUrl ? nt.siteUrl.replace(/\/$/, "") : "";
  let url = nt.coverUrl || nt.track?.coverUrl || nt.track?.coverImage;
  if (!url && nt.track?.albumId && baseUrl) {
    url = `${baseUrl}/api/albums/${encodeURIComponent(nt.track.albumId)}/cover`;
  }
  if (!url && (nt.track as any)?.id && baseUrl) {
    url = `${baseUrl}/api/tracks/${encodeURIComponent((nt.track as any).id)}/cover`;
  }
  if (!url) return undefined;
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return url;
  }
  if (baseUrl) {
    return `${baseUrl}/${url.replace(/^\//, "")}`;
  }
  return url;
};

const NetworkTrackRow = ({
  nt,
  isAdded,
  isAdding,
  onAdd,
}: {
  nt: NetworkTrack;
  isAdded: boolean;
  isAdding: boolean;
  onAdd: () => void;
}) => {
  const coverUrl = resolveNetworkTrackCover(nt);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-base-300 transition-colors group">
      <div className="w-10 h-10 rounded bg-base-300 flex-shrink-0 overflow-hidden flex items-center justify-center text-center">
        {coverUrl && !imgError ? (
          <img
            src={coverUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-30">
            <Music size={16} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{nt.title || "Untitled"}</div>
        <div className="text-xs opacity-50 truncate flex items-center gap-1">
          <span>{nt.artistName || "Unknown Artist"}</span>
          <span className="opacity-30">•</span>
          <span className="text-primary/70 flex items-center gap-1">
            <Globe size={10} /> {siteLabel(nt.siteUrl)}
          </span>
        </div>
      </div>
      <button
        type="button"
        className={`btn btn-sm gap-1 transition-all ${
          isAdded
            ? "btn-success"
            : "btn-ghost opacity-80 group-hover:opacity-100"
        }`}
        onClick={onAdd}
        disabled={isAdding || isAdded}
      >
        {isAdding ? (
          <span className="loading loading-spinner loading-xs"></span>
        ) : isAdded ? (
          <>
            <Check size={14} /> Added
          </>
        ) : (
          <>
            <Plus size={14} /> Add
          </>
        )}
      </button>
    </div>
  );
};

const LocalTrackRow = ({
  track,
  isAdded,
  isAdding,
  onAdd,
}: {
  track: Track;
  isAdded: boolean;
  isAdding: boolean;
  onAdd: () => void;
}) => {
  const [imgError, setImgError] = useState(false);
  const coverUrl = track.albumId
    ? API.getAlbumCoverUrl(track.albumId)
    : track.coverUrl || undefined;

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-base-300 transition-colors group">
      <div className="w-10 h-10 rounded bg-base-300 flex-shrink-0 overflow-hidden flex items-center justify-center text-center">
        {coverUrl && !imgError ? (
          <img
            src={coverUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-30">
            <Music size={16} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{track.title}</div>
        <div className="text-xs opacity-50 truncate">
          {track.artistName}{" "}
          {track.albumName ? `• ${track.albumName}` : ""}
        </div>
      </div>
      <button
        type="button"
        className={`btn btn-sm gap-1 transition-all ${
          isAdded
            ? "btn-success"
            : "btn-ghost opacity-80 group-hover:opacity-100"
        }`}
        onClick={onAdd}
        disabled={isAdding || isAdded}
      >
        {isAdding ? (
          <span className="loading loading-spinner loading-xs"></span>
        ) : isAdded ? (
          <>
            <Check size={14} /> Added
          </>
        ) : (
          <>
            <Plus size={14} /> Add
          </>
        )}
      </button>
    </div>
  );
};

export const AddTrackToUserPlaylistModal = ({
  playlistId,
  onAdded,
  existingTrackIds = [],
  existingTracks = [],
}: {
  playlistId: string;
  onAdded?: () => void;
  existingTrackIds?: string[];
  existingTracks?: (Track | UserPlaylistTrack)[];
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { isAuthenticated } = useAuthStore();

  // TuneCamp search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [allTracks, setAllTracks] = useState<Track[]>([]);

  // Network search
  const [networkTracks, setNetworkTracks] = useState<NetworkTrack[]>([]);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [tab, setTab] = useState<"local" | "network">("local");

  const [addingId, setAddingId] = useState<string | null>(null);
  const [sessionAddedIds, setSessionAddedIds] = useState<string[]>([]);

  useEffect(() => {
    const handleOpen = () => {
      if (isAuthenticated) {
        resetState();
        dialogRef.current?.showModal();
        loadAllTracks();
        loadNetworkTracks();
      }
    };

    document.addEventListener(
      "open-add-track-to-user-playlist-modal",
      handleOpen as EventListener,
    );
    return () =>
      document.removeEventListener(
        "open-add-track-to-user-playlist-modal",
        handleOpen as EventListener,
      );
  }, [isAuthenticated, playlistId]);

  const resetState = () => {
    setSearchQuery("");
    setSearchResults([]);
    setTab("local");
    setSessionAddedIds([]);
  };

  const loadAllTracks = async () => {
    try {
      const tracks = await API.getTracks();
      setAllTracks(tracks);
      setSearchResults(tracks.slice(0, 30));
    } catch (e) {
      console.error("Failed to load tracks:", e);
    }
  };

  const loadNetworkTracks = async () => {
    setNetworkLoading(true);
    try {
      const tracks = await API.getNetworkTracks();
      setNetworkTracks(tracks);
    } catch (e) {
      console.error("Failed to load network tracks:", e);
    } finally {
      setNetworkLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (tab === "local") {
      if (!query.trim()) {
        setSearchResults(allTracks.slice(0, 30));
        return;
      }
      const q = query.toLowerCase();
      const filtered = allTracks.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.artistName && t.artistName.toLowerCase().includes(q)) ||
          (t.albumName && t.albumName.toLowerCase().includes(q)),
      );
      setSearchResults(filtered.slice(0, 50));
    }
  };

  const isLocalTrackAdded = (track: Track) => {
    const idStr = String(track.id);
    if (sessionAddedIds.includes(idStr) || existingTrackIds.includes(idStr)) {
      return true;
    }
    return existingTracks.some((t: any) => String(t.id) === idStr);
  };

  const isNetworkTrackAdded = (nt: NetworkTrack) => {
    const uniqueId = networkTrackId(nt);
    if (sessionAddedIds.includes(uniqueId) || existingTrackIds.includes(uniqueId)) {
      return true;
    }
    return existingTracks.some((t: any) => {
      if (String(t.id) === uniqueId) return true;
      if (t.url && nt.audioUrl && t.url === nt.audioUrl) return true;
      if (t.external_id && nt.audioUrl && t.external_id === nt.audioUrl) return true;
      if (t.externalId && nt.audioUrl && t.externalId === nt.audioUrl) return true;
      if (nt.slug && (t.slug === nt.slug || t.external_id === nt.slug)) return true;
      return false;
    });
  };

  const filteredNetworkTracks = networkTracks
    .filter((nt) => {
      if (!nt || nt.type === "post" || !nt.audioUrl) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (nt.title || "").toLowerCase().includes(q) ||
        (nt.artistName || "").toLowerCase().includes(q) ||
        siteLabel(nt.siteUrl).toLowerCase().includes(q)
      );
    })
    .slice(0, 50);

  const handleAddNetworkTrack = async (nt: NetworkTrack) => {
    const uniqueId = networkTrackId(nt);
    const resolvedCover = resolveNetworkTrackCover(nt);
    setAddingId(uniqueId);
    try {
      await API.addTrackToPlaylist(playlistId, nt.audioUrl as string, {
        title: nt.title || "Untitled",
        artist: nt.artistName || "Unknown Artist",
        coverUrl: resolvedCover,
        duration: nt.duration || 0,
      });
      setSessionAddedIds((prev) => [...prev, uniqueId]);
      notify.success(`Added "${nt.title || 'Track'}" to playlist`);
      onAdded?.();
    } catch (e: any) {
      console.error("Failed to add network track:", e);
      notify.error(e, "Failed to add network track");
    } finally {
      setAddingId(null);
    }
  };

  const handleAddTrack = async (track: Track) => {
    const id = String(track.id);
    setAddingId(id);
    try {
      await API.addTrackToPlaylist(playlistId, id);
      setSessionAddedIds((prev) => [...prev, id]);
      notify.success(`Added "${track.title}" to playlist`);
      onAdded?.();
    } catch (e: any) {
      console.error("Failed to add track:", e);
      notify.error(e, "Failed to add track");
    } finally {
      setAddingId(null);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <dialog
      id="add-track-to-user-playlist-modal"
      className="modal"
      ref={dialogRef}
    >
      <div className="modal-box bg-base-100 border border-base-content/5 max-w-2xl p-0 overflow-hidden">
        <div className="p-6 pb-0">
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
              ✕
            </button>
          </form>

          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Plus size={24} className="text-primary" /> Add Track to Playlist
          </h3>

          <div className="tabs tabs-boxed bg-base-200 mb-4">
            <button
              type="button"
              className={`tab flex-1 ${tab === "local" ? "tab-active" : ""}`}
              onClick={() => {
                setTab("local");
                setSearchQuery("");
                setSearchResults(allTracks.slice(0, 30));
              }}
            >
              Local Library
            </button>
            <button
              type="button"
              className={`tab flex-1 ${tab === "network" ? "tab-active" : ""}`}
              onClick={() => {
                setTab("network");
                setSearchQuery("");
              }}
            >
              Network Tracks
            </button>
          </div>

          <div className="form-control mb-4">
            <div className="input-group flex gap-2">
              <span className="flex items-center px-3 bg-base-200 rounded-l-lg border border-r-0 border-base-content/10">
                <Search size={16} className="opacity-50" />
              </span>
              <input
                type="text"
                className="input input-bordered flex-1"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={
                  tab === "local"
                    ? "Search local tracks by title, artist, album..."
                    : "Search network tracks by title, artist, site..."
                }
              />
            </div>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto space-y-1 p-4 pt-0">
          {tab === "local" ? (
            searchResults.length === 0 ? (
              <div className="text-center py-8 opacity-50">
                {allTracks.length === 0
                  ? "Loading tracks..."
                  : "No local tracks found"}
              </div>
            ) : (
              searchResults.map((track) => (
                <LocalTrackRow
                  key={track.id}
                  track={track}
                  isAdded={isLocalTrackAdded(track)}
                  isAdding={addingId === String(track.id)}
                  onAdd={() => handleAddTrack(track)}
                />
              ))
            )
          ) : networkLoading ? (
            <div className="text-center py-8 opacity-50">
              <span className="loading loading-spinner loading-md"></span>
              <p className="mt-2 text-sm">Scanning federation...</p>
            </div>
          ) : filteredNetworkTracks.length === 0 ? (
            <div className="text-center py-8 opacity-50">
              No network tracks found.
            </div>
          ) : (
            filteredNetworkTracks.map((nt, i) => {
              const uniqueId = networkTrackId(nt);
              return (
                <NetworkTrackRow
                  key={uniqueId || i}
                  nt={nt}
                  isAdded={isNetworkTrackAdded(nt)}
                  isAdding={addingId === uniqueId}
                  onAdd={() => handleAddNetworkTrack(nt)}
                />
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-base-content/5 bg-base-200/50 flex justify-end">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => dialogRef.current?.close()}
          >
            Close
          </button>
        </div>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
};
