import { useState, useEffect } from "react";
import API from "../../services/api";
import {
  Shield,
  Eye,
  EyeOff,
  Music,
} from "lucide-react";
import type { Artist } from "../../types";
import { useAuthStore } from "../../stores/useAuthStore";

interface IdentityPanelProps {
  isRootAdmin?: boolean;
}

export const IdentityPanel = ({ isRootAdmin = false }: IdentityPanelProps) => {
  const [siteApIdentity, setSiteApIdentity] = useState<{
    publicKey: string;
    privateKey: string;
    handle?: string;
  } | null>(null);
  const [artistIdentities, setArtistIdentities] = useState<any[]>([]);
  const [showPrivateKeys, setShowPrivateKeys] = useState<{
    [key: string]: boolean;
  }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { user: currentUser } = useAuthStore();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const promises: Promise<any>[] = [
        API.getArtists().catch(e => {
          console.error("Failed to load artists", e);
          return [];
        })
      ];

      if (isRootAdmin) {
        promises.push(API.getSiteApIdentity().catch(e => {
          console.error("Failed to load site AP identity", e);
          return null;
        }));
      }

      const results = await Promise.all(promises);
      const allArtists = results[0] || [];

      if (isRootAdmin) {
        setSiteApIdentity(results[1]);
      }

      // Filter artists to only show the one associated with the current user
      let artistsToShow = allArtists;
      if (currentUser?.artistId) {
        artistsToShow = allArtists.filter((a: Artist) => a.id.toString() === currentUser.artistId?.toString());
      } else if (!isRootAdmin) {
        artistsToShow = [];
      } else {
        // Root admin without an associated artist should see all artist identities.
        artistsToShow = allArtists;
      }

      // Load RSA keys for each artist
      const apIdentities = await Promise.all(
        artistsToShow.map(async (artist: Artist) => {
          try {
            const keys = await API.getArtistIdentity(artist.id.toString());
            return {
              artist,
              ...keys,
            };
          } catch (e) {
            console.error(
              `Failed to load AP identity for artist ${artist.name}`,
              e,
            );
            return { artist, error: true };
          }
        }),
      );
      setArtistIdentities(apIdentities);
    } catch (e) {
      console.error("Failed to load identity data", e);
      setError("Failed to load some identity data");
    } finally {
      setLoading(false);
    }
  };

  const togglePrivateKey = (id: string) => {
    setShowPrivateKeys((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="space-y-8 animate-fade-in w-full">
      <div className="flex items-center gap-3 px-1">
        <Shield size={24} className="text-primary" />
        <h2 className="text-xl font-bold tracking-tight">Identity Management</h2>
      </div>

      {loading && (
        <div className="py-12 text-center opacity-40 italic">Loading identity data...</div>
      )}

      {error && <div className="text-error text-xs font-bold px-1">{error}</div>}

      {/* ActivityPub Artist Identities */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 px-1">
          <Music size={24} className="text-secondary" />
          <h2 className="text-xl font-bold tracking-tight">
            ActivityPub Actor Identities (RSA)
          </h2>
        </div>

        <div className="grid gap-6">
          {/* Site Actor Identity (Service) - Only for Root Admin */}
          {isRootAdmin && siteApIdentity && (
            <div className="card card-m3 bg-base-200/50">
              <div className="card-body p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="avatar placeholder">
                      <div className="w-12 rounded-full bg-primary/10 text-primary shadow-inner">
                        <span className="font-bold">S</span>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold">Site Actor</h3>
                      <p className="text-xs opacity-40 font-mono mt-0.5">
                        @{siteApIdentity.handle || "site"}@{window.location.hostname}
                      </p>
                    </div>
                  </div>
                  <div className="badge badge-primary badge-outline badge-sm font-bold tracking-normal py-2">
                    SERVICE
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs font-bold opacity-40">
                        RSA Public Key
                      </span>
                    </label>
                    <div className="p-3 bg-base-300/50 rounded-lg font-mono text-xs break-all select-all max-h-32 overflow-y-auto border border-base-content/5 scrollbar-thin shadow-inner">
                      {siteApIdentity.publicKey}
                    </div>
                  </div>

                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs font-bold opacity-40">
                        RSA Private Key
                      </span>
                    </label>
                    <div className="relative group">
                      <div
                        className={`p-3 bg-base-300/50 rounded-lg font-mono text-xs break-all border border-base-content/5 select-all transition-all scrollbar-thin shadow-inner ${!showPrivateKeys["site"] ? "blur-sm select-none grayscale opacity-30" : "max-h-32 overflow-y-auto"}`}
                      >
                        {siteApIdentity.privateKey || "No private key stored"}
                      </div>
                      <button
                        className="absolute top-2 right-2 btn btn-xs btn-circle btn-ghost hover:bg-base-300"
                        onClick={() => togglePrivateKey("site")}
                        title={
                          showPrivateKeys["site"]
                            ? "Hide Private Key"
                            : "Show Private Key"
                        }
                      >
                        {showPrivateKeys["site"] ? (
                          <EyeOff size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {artistIdentities.length === 0 && !siteApIdentity ? (
            <div className="card card-m3 bg-base-200/20 p-12 text-center opacity-30 italic">
              No artist identities found.
            </div>
          ) : (
            artistIdentities.map(({ artist, publicKey, privateKey, error }) => (
              <div
                key={artist.id}
                className="card card-m3 bg-base-200/50"
              >
                <div className="card-body p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="avatar placeholder">
                        <div className="w-12 rounded-full bg-secondary/10 text-secondary shadow-inner">
                          <span className="font-bold">{artist.name[0]}</span>
                        </div>
                      </div>
                      <div>
                        <h3 className="font-bold">{artist.name}</h3>
                        <p className="text-xs opacity-40 font-mono mt-0.5">
                          @{artist.slug}@{window.location.hostname}
                        </p>
                      </div>
                    </div>
                    <div className="badge badge-secondary badge-outline badge-sm font-bold tracking-normal py-2">
                      ARTIST
                    </div>
                  </div>

                  {error ? (
                    <div className="alert alert-error text-xs py-2 bg-error/10 border-error/20">
                      Failed to load keys for this actor.
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="form-control">
                        <label className="label py-1">
                          <span className="label-text text-xs font-bold opacity-40">
                            RSA Public Key
                          </span>
                        </label>
                        <div className="p-3 bg-base-300/50 rounded-lg font-mono text-xs break-all select-all max-h-32 overflow-y-auto border border-base-content/5 scrollbar-thin shadow-inner">
                          {publicKey}
                        </div>
                      </div>

                      <div className="form-control">
                        <label className="label py-1">
                          <span className="label-text text-xs font-bold opacity-40">
                            RSA Private Key
                          </span>
                        </label>
                        <div className="relative group">
                          <div
                            className={`p-3 bg-base-300/50 rounded-lg font-mono text-xs break-all border border-base-content/5 select-all transition-all scrollbar-thin shadow-inner ${!showPrivateKeys[artist.id] ? "blur-sm select-none grayscale opacity-30" : "max-h-32 overflow-y-auto"}`}
                          >
                            {privateKey || "No private key stored"}
                          </div>
                          <button
                            className="absolute top-2 right-2 btn btn-xs btn-circle btn-ghost hover:bg-base-300"
                            onClick={() => togglePrivateKey(artist.id)}
                            title={
                              showPrivateKeys[artist.id]
                                ? "Hide Private Key"
                                : "Show Private Key"
                            }
                          >
                            {showPrivateKeys[artist.id] ? (
                              <EyeOff size={14} />
                            ) : (
                              <Eye size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
