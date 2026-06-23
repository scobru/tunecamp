import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "../../stores/useAuthStore";
import API from "../../services/api";
import { Plus, Search, Music, Check, Globe } from "lucide-react";
import { notify } from "../../utils/notify";
import type { Track, NetworkTrack } from "../../types";

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
  nt.slug || `${nt.siteUrl}::${nt.title}`;

export const AddTrackToUserPlaylistModal = ({
  playlistId,
  onAdded,
  existingTrackIds = [],
}: {
  playlistId: string;
  onAdded?: () => void;
  existingTrackIds?: string[];
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
  const [successId, setSuccessId] = useState<string | null>(null);
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
    setSuccessId(null);
    setTab("local");
    setSessionAddedIds([]);
  };

  const loadAllTracks = async () => {
    try {
      const tracks = await API.getTracks();
      setAllTracks(tracks);
      setSearchResults(tracks.slice(0, 20));
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
        setSearchResults(allTracks.slice(0, 20));
        return;
      }
      const q = query.toLowerCase();
      const filtered = allTracks.filter(
        (t) =>
          (t.title.toLowerCase().includes(q) ||
          (t.artistName && t.artistName.toLowerCase().includes(q)) ||
          (t.albumName && t.albumName.toLowerCase().includes(q))) &&
          !existingTrackIds.includes(String(t.id)) &&
          !sessionAddedIds.includes(String(t.id))
      );
      setSearchResults(filtered.slice(0, 30));
    }
  };

  // The /api/stats/network/tracks endpoint returns flat items
  // ({ title, artistName, audioUrl, coverUrl, siteUrl, type, ... }), not a
  // nested { track } shape. Keep only streamable releases (skip posts).
  const filteredNetworkTracks = networkTracks
    .filter((nt) => {
      if (!nt || nt.type === "post" || !nt.audioUrl) return false;
      const uniqueId = networkTrackId(nt);
      if (existingTrackIds.includes(uniqueId) || sessionAddedIds.includes(uniqueId)) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (nt.title || "").toLowerCase().includes(q) ||
        (nt.artistName || "").toLowerCase().includes(q) ||
        siteLabel(nt.siteUrl).toLowerCase().includes(q)
      );
    })
    .slice(0, 30);

  const handleAddNetworkTrack = async (nt: NetworkTrack) => {
    const uniqueId = networkTrackId(nt);
    setAddingId(uniqueId);
    setSuccessId(null);
    try {
      // The backend creates a local reference track for external http URLs
      // (see POST /api/playlists/:id/tracks), so we pass the stream URL as the
      // trackId together with the metadata needed to display it.
      await API.addTrackToPlaylist(playlistId, nt.audioUrl as string, {
        title: nt.title,
        artist: nt.artistName,
        coverUrl: nt.coverUrl,
        duration: nt.duration,
      });
      setSuccessId(uniqueId);
      setSessionAddedIds((prev) => [...prev, uniqueId]);
      onAdded?.();
      setTimeout(() => setSuccessId(null), 2000);
    } catch (e: any) {
      console.error("Failed to add network track:", e);
      notify.error(e, "Failed to add network track");
    } finally {
      setAddingId(null);
    }
  };

  const handleAddTrack = async (
    track: Track,
    options?: {
      source: "tunecamp" | "network";
      siteUrl?: string;
      siteName?: string;
    },
  ) => {
    const id =
      options?.source === "network"
        ? `${options.siteUrl}::${track.id}`
        : String(track.id);
    setAddingId(id);
    setSuccessId(null);

    try {
      let streamUrl = track.streamUrl;
      let coverUrl = track.coverUrl || track.coverImage;

      if (options?.source === "network" && options.siteUrl) {
        // Network tracks are currently handled via GunDB or not supported in SQL backend yet
        const baseUrl = options.siteUrl.replace(/\/$/, "");
        if (!streamUrl) streamUrl = `${baseUrl}/api/tracks/${track.id}/stream`;
        if (!coverUrl && track.albumId)
          coverUrl = `${baseUrl}/api/albums/${track.albumId}/cover`;
      } else if (options?.source === "tunecamp" || !options?.source) {
        streamUrl = API.getStreamUrl(String(track.id));
        coverUrl = track.albumId
          ? API.getAlbumCoverUrl(String(track.albumId))
          : undefined;
      }

      if (options?.source === "network") {
        throw new Error("Adding network tracks to playlists is not yet supported.");
      } else {
        await API.addTrackToPlaylist(playlistId, String(track.id));
      }

      setSuccessId(id);
      setSessionAddedIds(prev => [...prev, id]);
      onAdded?.();
      setTimeout(() => setSuccessId(null), 2000);
    } catch (e: any) {
      console.error("Failed to add track:", e);
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
            <Plus size={24} className="text-primary" /> Add Track
          </h3>

          <div className="tabs tabs-boxed bg-base-200 mb-4">
            <button
              className={`tab flex-1 ${tab === "local" ? "tab-active" : ""}`}
              onClick={() => {
                setTab("local");
                setSearchQuery("");
              }}
            >
              Local Library
            </button>
            <button
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
                    ? "Search local tracks..."
                    : "Search network tracks..."
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
              searchResults
                .filter(t => !existingTrackIds.includes(String(t.id)) && !sessionAddedIds.includes(String(t.id)))
                .map((track) => (
                <div
                  key={track.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-base-300 transition-colors group"
                >
                  <div className="w-10 h-10 rounded bg-base-300 flex-shrink-0 overflow-hidden">
                    {track.albumId ? (
                      <img
                        src={API.getAlbumCoverUrl(track.albumId)}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center opacity-30">
                        <Music size={16} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">
                      {track.title}
                    </div>
                    <div className="text-xs opacity-50 truncate">
                      {track.artistName}{" "}
                      {track.albumName ? `• ${track.albumName}` : ""}
                    </div>
                  </div>
                  <button
                    className={`btn btn-sm gap-1 transition-all ${
                      successId === track.id
                        ? "btn-success"
                        : "btn-ghost opacity-0 group-hover:opacity-100"
                    }`}
                    onClick={() =>
                      handleAddTrack(track, { source: "tunecamp" })
                    }
                    disabled={addingId === track.id}
                  >
                    {addingId === track.id ? (
                      <span className="loading loading-spinner loading-xs"></span>
                    ) : successId === track.id ? (
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
              const coverUrl = nt.coverUrl || undefined;

              return (
                <div
                  key={uniqueId || i}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-base-300 transition-colors group"
                >
                  <div className="w-10 h-10 rounded bg-base-300 flex-shrink-0 overflow-hidden text-center flex items-center justify-center">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-xs opacity-30">🎵</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">
                      {nt.title}
                    </div>
                    <div className="text-xs opacity-50 truncate flex items-center gap-1">
                      <span>{nt.artistName}</span>
                      <span className="opacity-30">•</span>
                      <span className="text-primary/70 flex items-center gap-1">
                        <Globe size={10} /> {siteLabel(nt.siteUrl)}
                      </span>
                    </div>
                  </div>
                  <button
                    className={`btn btn-sm gap-1 transition-all ${
                      successId === uniqueId
                        ? "btn-success"
                        : "btn-ghost opacity-0 group-hover:opacity-100"
                    }`}
                    onClick={() => handleAddNetworkTrack(nt)}
                    disabled={addingId === uniqueId}
                  >
                    {addingId === uniqueId ? (
                      <span className="loading loading-spinner loading-xs"></span>
                    ) : successId === uniqueId ? (
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

