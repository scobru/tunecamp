import { useState, useEffect, useMemo } from "react";
import API from "../services/api";
import { Download, Play, Clock, Music, CheckCircle2 } from "lucide-react";
import { usePlayerStore } from "../stores/usePlayerStore";
import { useAuthStore } from "../stores/useAuthStore";
import { usePurchases } from "../hooks/usePurchases";
import { useOwnedNFTs } from "../hooks/useOwnedNFTs";
import { useWalletStore } from "../stores/useWalletStore";
import type { Track } from "../types";
import { Link } from "react-router-dom";
import { formatDuration } from "../utils/format";

export const Purchases = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const { playTrack } = usePlayerStore();
  const { isAuthenticated } = useAuthStore();
  const {
    purchases,
    loading: purchasesLoading,
    isPurchased,
    verifyAndGetCode,
  } = usePurchases();

  useEffect(() => {
    if (!isAuthenticated) return;

    API.getTracks()
      .then((data) => {
        setTracks(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        setLoading(false);
      });
  }, [isAuthenticated]);

  const { address, externalAddress, useExternalWallet, isExternalConnected } = useWalletStore();
  const activeAddress = useExternalWallet && isExternalConnected ? externalAddress : address;
  const { ownedNFTs } = useOwnedNFTs(activeAddress);

  const purchasedTracks = useMemo(() => {
    return tracks.filter((t) => {
      const isRecordPurchased = isPurchased(t.id);
      const isNFTPurchased = ownedNFTs.some(n => n.trackId === Number(t.id));
      return isRecordPurchased || isNFTPurchased;
    });
  }, [tracks, isPurchased, purchases, ownedNFTs]);

  if (!isAuthenticated) {
    return (
      <div className="p-12 text-center opacity-70 animate-fade-in">
        <Download size={48} className="mx-auto mb-4 text-primary opacity-50" />
        <h2 className="text-xl font-bold mb-2">Login Required</h2>
        <p className="mb-4">Please login to view your purchased tracks.</p>
        <button
          className="btn btn-primary gap-2"
          onClick={() =>
            document.dispatchEvent(new CustomEvent("open-auth-modal"))
          }
        >
          Login
        </button>
      </div>
    );
  }

  if (loading || purchasesLoading) {
    return (
      <div className="p-12 text-center opacity-50">Loading purchases...</div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Download size={32} className="text-primary" /> My Purchases
        </h1>
      </div>

      {purchasedTracks.length === 0 ? (
        <div className="p-12 text-center opacity-70 bg-base-200/30 rounded-xl border border-base-content/5">
          <Music size={48} className="mx-auto mb-4 opacity-30" />
          <h2 className="text-xl font-medium mb-2">No purchases yet</h2>
          <p className="mb-4 text-sm opacity-70">
            Tracks you purchase will appear here for easy access and
            downloading.
          </p>
          <Link to="/tracks" className="btn btn-outline btn-sm">
            Explore Tracks
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto bg-base-200/30 rounded-xl border border-base-content/5">
          <table className="table w-full table-sm md:table-md">
            <thead>
              <tr className="border-b border-base-content/10 text-xs uppercase opacity-50">
                <th className="w-12 text-center">#</th>
                <th>Title</th>
                <th>Album</th>
                <th className="text-right">
                  <Clock size={16} />
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {purchasedTracks.map((track, i) => {
                if (!track) return null;
                return (
                  <tr
                    key={track.id}
                    className="hover:bg-base-content/5 group border-b border-base-content/5 last:border-0 transition-colors focus-within:bg-base-content/5"
                  >
                    <td className="text-center font-mono w-12 relative">
                      <span className="opacity-50 group-hover:opacity-0 group-focus-within:opacity-0 transition-opacity absolute inset-0 flex items-center justify-center pointer-events-none">
                        {i + 1}
                      </span>
                      <button
                        onClick={() => playTrack(track, purchasedTracks)}
                        aria-label={`Play ${track.title}`}
                        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 transition-opacity absolute inset-0 flex items-center justify-center text-primary w-full h-full"
                      >
                        <Play size={12} fill="currentColor" />
                      </button>
                    </td>
                    <td className="font-bold">
                      <div className="flex items-center gap-2">
                        {track.title}
                        {track.losslessPath ? (
                          <span className="badge badge-outline badge-xs opacity-50 font-mono scale-90">
                            {track.losslessPath.toLowerCase().endsWith(".wav")
                              ? "WAV"
                              : "FLAC"}
                          </span>
                        ) : (
                          <span className="badge badge-outline badge-xs opacity-50 font-mono scale-90 uppercase">
                            {track.format || "MP3"}
                          </span>
                        )}
                      </div>
                      <div className="text-xs opacity-50">
                        {track.artistName}
                      </div>
                    </td>
                    <td className="opacity-60 text-sm truncate max-w-[150px]">
                      {track.albumName}
                    </td>
                    <td className="text-right opacity-50 font-mono text-xs">
                      {formatDuration(track.duration)}
                    </td>
                    <td className="text-right">
                        <button
                          className="btn btn-ghost btn-sm gap-2 opacity-70 hover:opacity-100 group-hover:opacity-100"
                          onClick={async () => {
                            const code = await verifyAndGetCode(track.id);
                            if (code) {
                              window.open(
                                `/api/payments/download/${track.id}?code=${code}`,
                                "_blank",
                              );
                            } else {
                              if (ownedNFTs.some(n => n.trackId === Number(track.id))) {
                                window.open(`/api/tracks/${track.id}/stream`, "_blank");
                              } else {
                                alert(
                                  "Download code not found or could not be verified. Please try again or contact support.",
                                );
                              }
                            }
                          }}
                        >
                        <CheckCircle2
                          size={16}
                          className="text-success hidden md:block"
                        />
                        <span>Download</span>
                        </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

