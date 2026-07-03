import { confirm } from '@/utils/confirm';
import { useState, useEffect, useMemo } from "react";
import API from "../../services/api";
import { Link as LinkIcon, Edit, Trash2, ChevronUp, ChevronDown, Search, X, Music } from "lucide-react";
import { BatchTrackEditModal } from "../modals/BatchTrackEditModal";
import { notify } from "../../utils/notify";

type SortKey = "title" | "artist_name" | "album_title" | "duration";
interface SortConfig {
  key: SortKey;
  direction: "asc" | "desc";
}

export const AdminTracksList = ({ mine }: { mine?: boolean }) => {
  const [tracks, setTracks] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [localizing, setLocalizing] = useState<string | number | null>(null);
  const [isLocalizingBatch, setIsLocalizingBatch] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "title", direction: "asc" });
  const [loading, setLoading] = useState(true);

  const loadTracks = () => {
    setLoading(true);
    return API.getTracks({ mine }).then(setTracks).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTracks();
    window.addEventListener("refresh-admin-tracks", loadTracks);
    return () => window.removeEventListener("refresh-admin-tracks", loadTracks);
  }, [mine]);

  const filteredAndSortedTracks = useMemo(() => {
    let result = tracks.filter(t => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        (t.title?.toLowerCase().includes(search)) ||
        (t.artist_name?.toLowerCase().includes(search)) ||
        (t.album_title?.toLowerCase().includes(search))
      );
    });

    if (sortConfig !== null) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key] || "";
        const bValue = b[sortConfig.key] || "";

        if (aValue < bValue) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }
    return result;
  }, [tracks, sortConfig, searchTerm]);

  const requestSort = (key: SortKey) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: SortKey) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  const handleDelete = async (id: string, name: string) => {
    if (
      !await confirm(
        `Are you sure you want to delete track ${name}? This cannot be undone.`,
      )
    )
      return;
    try {
      await API.deleteTrack(id, true);
      loadTracks();
    } catch (e) {
      console.error(e);
      notify.error(e, "Failed to delete track");
    }
  };

  const handleLocalize = async (id: string | number, name: string, isGDrive: boolean) => {
    const confirmMsg = isGDrive 
      ? `Do you want to download "${name}" from Google Drive and save it on the server? This will replace the Google Drive link with a local file.`
      : `Do you want to download and localize "${name}"? This will save the audio to the server's local library.`;
    
    if (!await confirm(confirmMsg)) return;
    
    setLocalizing(id);
    try {
      if (isGDrive) {
        await API.localizeGDriveTrack(id);
      } else {
        await API.localizeTrack(id);
      }
      loadTracks();
      notify.success(`Track "${name}" successfully localized to server!`);
    } catch (e: any) {
      console.error(e);
      notify.error(e, "Localization failed");
    } finally {
      setLocalizing(null);
    }
  };

  const handleBatchLocalize = async () => {
    const toLocalize = Array.from(selectedIds).filter(id => {
      const t = tracks.find(track => track.id === id);
      return t && t.service && t.service !== 'local' && (!t.path?.startsWith('localized/') && !t.path?.startsWith('cloud_imports/'));
    });

    if (toLocalize.length === 0) {
      notify.warning("None of the selected tracks need localization.");
      return;
    }

    if (!await confirm(`Are you sure you want to localize ${toLocalize.length} tracks? This will download them to the server library.`)) return;
    
    setIsLocalizingBatch(true);
    let success = 0;
    let failed = 0;
    try {
      const CHUNK_SIZE = 5;
      for (let i = 0; i < toLocalize.length; i += CHUNK_SIZE) {
        const chunk = toLocalize.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (id) => {
            try {
              await API.localizeTrack(id);
              success++;
            } catch (e) {
              failed++;
            }
          })
        );
      }
      notify.success(`Localization Processed!\n\nSuccess: ${success}\nFailed: ${failed}`);
      loadTracks();
      setSelectedIds(new Set());
    } finally {
      setIsLocalizingBatch(false);
    }
  };

  const hasLocalizableSelected = useMemo(() => {
    return Array.from(selectedIds).some(id => {
      const t = tracks.find(track => track.id === id);
      return t && t.service && t.service !== 'local' && (!t.path?.startsWith('localized/') && !t.path?.startsWith('cloud_imports/'));
    });
  }, [selectedIds, tracks]);

  const toggleSelect = (id: string | number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAndSortedTracks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedTracks.map(t => t.id)));
    }
  };

  const handleBatchDelete = async () => {
    const count = selectedIds.size;
    if (!await confirm(`Are you sure you want to delete ${count} tracks? This will also delete their files and cannot be undone.`)) return;
    
    try {
      await API.deleteTracksBatch(Array.from(selectedIds), true);
      setSelectedIds(new Set());
      loadTracks();
    } catch (e: any) {
      console.error(e);
      notify.error(e, "Failed to perform batch deletion");
    }
  };

  if (loading) return (
    <div className="overflow-x-auto">
      <table className="table table-zebra table-sm w-full">
        <tbody>
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i}>
              <td><div className="skeleton h-4 w-4 rounded" /></td>
              <td><div className="skeleton h-4 w-40 rounded" /></td>
              <td><div className="skeleton h-4 w-24 rounded" /></td>
              <td><div className="skeleton h-4 w-32 rounded" /></td>
              <td><div className="skeleton h-4 w-20 rounded" /></td>
              <td><div className="skeleton h-4 w-12 rounded" /></td>
              <td><div className="skeleton h-4 w-28 rounded" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (tracks.length === 0)
    return <div className="opacity-50 text-center py-4">No tracks found.</div>;

  return (
    <>
      {selectedIds.size > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-4 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="font-bold text-primary">{selectedIds.size} tracks selected</span>
            <button className="btn btn-xs btn-ghost" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </div>
          <div className="flex gap-2">
            {hasLocalizableSelected && (
              <button 
                className="btn btn-sm btn-outline btn-primary gap-2"
                onClick={handleBatchLocalize}
                disabled={isLocalizingBatch}
              >
                {isLocalizingBatch ? <span className="loading loading-spinner loading-xs"></span> : <Music size={16} />}
                Localize Selected
              </button>
            )}
            <button 
              className="btn btn-sm btn-primary gap-2"
              onClick={() => setShowBatchEdit(true)}
            >
              <Edit size={16} /> Batch Edit
            </button>
            <button 
              className="btn btn-sm btn-error btn-outline gap-2"
              onClick={handleBatchDelete}
            >
              <Trash2 size={16} /> Batch Delete
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 mb-4 items-center justify-between">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" size={18} />
          <input
            type="text"
            placeholder="Search tracks..."
            className="input input-bordered input-sm w-full pl-10 pr-10 bg-base-200/50"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button 
              className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-primary transition-colors"
              onClick={() => setSearchTerm("")}
            >
              <X size={18} />
            </button>
          )}
        </div>
        
        {searchTerm && (
          <div className="text-sm opacity-50">
            Found {filteredAndSortedTracks.length} matches
          </div>
        )}
      </div>

      <table className="table">
        <thead>
          <tr>
            <th className="w-10">
              <input 
                type="checkbox" 
                className="checkbox checkbox-xs" 
                checked={selectedIds.size === filteredAndSortedTracks.length && filteredAndSortedTracks.length > 0}
                onChange={toggleSelectAll}
              />
            </th>
            <th className="cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort("title")}>
              <div className="flex items-center gap-1">Title {getSortIcon("title")}</div>
            </th>
            <th className="cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort("artist_name")}>
              <div className="flex items-center gap-1">Artist {getSortIcon("artist_name")}</div>
            </th>
            <th className="cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort("album_title")}>
              <div className="flex items-center gap-1">Album {getSortIcon("album_title")}</div>
            </th>
            <th>User</th>
            <th className="cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort("duration")}>
              <div className="flex items-center gap-1">Duration {getSortIcon("duration")}</div>
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredAndSortedTracks.map((t) => (
            <tr key={t.id} className={selectedIds.has(t.id) ? "bg-primary/5" : ""}>
              <td>
                <input 
                  type="checkbox" 
                  className="checkbox checkbox-xs" 
                  checked={selectedIds.has(t.id)}
                  onChange={() => toggleSelect(t.id)}
                />
              </td>
              <td className="font-bold">
                <div className="flex items-center gap-2">
                  {t.title}
                  {t.service && t.service !== "local" && (() => {
                    const isBoard = t.description?.includes("Board") || t.external_id?.startsWith("ext:link:");
                    const badgeText = isBoard 
                      ? (t.service === "gdrive" ? "board-gdrive" : t.service === "dropbox" ? "board-dropbox" : `board-${t.service}`)
                      : t.service;
                    const badgeClass = isBoard 
                      ? "badge badge-outline badge-neutral badge-xs gap-1 opacity-70" 
                      : "badge badge-secondary badge-xs gap-1 opacity-70";
                    return (
                      <span className={badgeClass}>
                        <LinkIcon size={10} /> {badgeText}
                      </span>
                    );
                  })()}
                  {(() => {
                    // Show both qualities when both exist: the compressed/streamed
                    // format (+ bitrate, e.g. "MP3 320") and the lossless master
                    // (WAV/FLAC). Listing them side by side is the only place a
                    // manager can tell a track ships in dual quality.
                    const fmt = t.format?.toLowerCase();
                    const compressed = t.format && fmt !== "wav" && fmt !== "flac"
                      ? `${t.format.toUpperCase()}${t.bitrate ? ` ${t.bitrate}` : ""}`
                      : null;
                    const lossless = t.lossless_path
                      ? (t.lossless_path.toLowerCase().endsWith(".wav") ? "WAV" : "FLAC")
                      : null;
                    return [compressed, lossless].filter(Boolean).map((label, i) => (
                      <span key={i} className="badge badge-outline badge-xs opacity-50 font-mono scale-90">
                        {label}
                      </span>
                    ));
                  })()}
                </div>
              </td>
              <td>{t.artist_name}</td>
              <td>{t.album_title}</td>
              <td className="text-sm opacity-60">
                {t.owner_name || (t.artist_name ? `(${t.artist_name})` : "-")}
              </td>
              <td>
                {t.duration
                  ? `${Math.floor(t.duration / 60)}:${String(Math.floor(t.duration % 60)).padStart(2, "0")}`
                  : "-"}
              </td>
              <td className="flex gap-2">
                <a
                  href={API.getTrackDownloadUrl(t.id)}
                  target="_blank"
                  className="btn btn-xs btn-ghost text-success tooltip tooltip-top"
                  data-tip="Download original file"
                >
                  Download
                </a>
                {t.service && t.service !== 'local' && (!t.path?.startsWith('localized/') && !t.path?.startsWith('cloud_imports/')) && (
                  <button
                    className="btn btn-xs btn-ghost text-warning tooltip tooltip-top"
                    onClick={() => handleLocalize(t.id, t.title, t.path?.startsWith('gdrive://'))}
                    disabled={localizing === t.id}
                    data-tip={t.path?.startsWith('gdrive://') ? "Download from GDrive and save to server" : "Download and localize to server library"}
                  >
                    {localizing === t.id ? "..." : "Localize"}
                  </button>
                )}
                <button
                  className="btn btn-xs btn-ghost text-primary"
                  onClick={() =>
                    document.dispatchEvent(
                      new CustomEvent("open-admin-track-modal", { detail: t }),
                    )
                  }
                >
                  Edit
                </button>
                <button
                  className="btn btn-xs btn-ghost text-error"
                  onClick={() => handleDelete(t.id, t.title)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filteredAndSortedTracks.length === 0 && (
        <div className="text-center py-12 opacity-50">
          <Music size={48} className="mx-auto mb-4 opacity-20" />
          <p>No tracks matching "{searchTerm}"</p>
          <button className="btn btn-link btn-sm" onClick={() => setSearchTerm("")}>Clear search</button>
        </div>
      )}

      {showBatchEdit && (
        <BatchTrackEditModal 
          selectedIds={Array.from(selectedIds)}
          onTracksUpdated={() => {
            loadTracks();
            setSelectedIds(new Set());
            setShowBatchEdit(false);
          }}
          onClose={() => setShowBatchEdit(false)}
        />
      )}
    </>
  );
};


