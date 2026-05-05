import { useState, useEffect } from "react";
import API from "../../services/api";
import {
  Shield,
  Key,
  AlertTriangle,
  Save,
  Copy,
  Download,
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
  const [identity, setIdentity] = useState<{
    pub: string;
    priv: string;
    epub: string;
    epriv: string;
    alias: string;
  } | null>(null);
  const [siteApIdentity, setSiteApIdentity] = useState<{
    publicKey: string;
    privateKey: string;
  } | null>(null);
  const [artistIdentities, setArtistIdentities] = useState<any[]>([]);
  const [showPrivateKeys, setShowPrivateKeys] = useState<{
    [key: string]: boolean;
  }>({});
  const [importData, setImportData] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
        promises.push(API.getIdentity().catch(e => {
          console.error("Failed to load system identity", e);
          return null;
        }));
        promises.push(API.getSiteApIdentity().catch(e => {
          console.error("Failed to load site AP identity", e);
          return null;
        }));
      }

      const results = await Promise.all(promises);
      const allArtists = results[0] || [];
      
      if (isRootAdmin) {
        setIdentity(results[1]);
        setSiteApIdentity(results[2]);
      } else if (currentUser?.zenProfile) {
        // Fallback: show the current logged-in user's ZEN identity if not root
        setIdentity({
          pub: currentUser.zenProfile.pub,
          priv: (currentUser.zenProfile as any).priv || "********", 
          epub: currentUser.zenProfile.epub,
          epriv: (currentUser.zenProfile as any).epriv || "********",
          alias: currentUser.zenProfile.alias
        });
      }

      // Filter artists to only show the one associated with the current user
      let artistsToShow = allArtists;
      if (currentUser?.artistId) {
        artistsToShow = allArtists.filter((a: Artist) => a.id.toString() === currentUser.artistId?.toString());
      } else if (!isRootAdmin) {
        artistsToShow = [];
      } else {
        // Root admin without an associated artist should see no artist identities here,
        // they still see the Site Identity if it exists.
        artistsToShow = [];
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

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importData) return;

    if (
      !confirm(
        "WARNING: Importing a new identity will replace the current node identity. Make sure you have a backup of the current one if you need it. Continue?",
      )
    ) {
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      let pair;
      try {
        pair = JSON.parse(importData);
      } catch (e) {
        throw new Error("Invalid JSON format");
      }

      await API.importIdentity(pair);
      setSuccess(
        "Identity imported successfully. The node will restart with the new identity.",
      );
      setImportData("");
      loadData(); // Reload to show new identity
    } catch (e: any) {
      setError(e.message || "Failed to import identity");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl">
      <div className="flex items-center gap-3 px-1">
        <Shield size={24} className="text-primary" />
        <h2 className="text-xl font-bold tracking-tight">Identity Management</h2>
      </div>

      {loading && !identity && (
        <div className="py-12 text-center opacity-40 italic">Loading identity data...</div>
      )}

      {(isRootAdmin || identity) && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Current Identity Card (GunDB) */}
          <div className="card card-m3 bg-base-200/50">
            <div className="card-body p-6">
              <h3 className="card-title text-[10px] uppercase tracking-[0.2em] opacity-50 mb-4">
                {isRootAdmin ? "Current P2P Node Identity (ZEN)" : "My Personal P2P Identity (ZEN)"}
              </h3>

              {identity ? (
                <div className="space-y-4">
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-[10px] font-bold uppercase opacity-40">Public Key (pub)</span>
                    </label>
                    <div className="p-3 bg-base-300/50 rounded-lg font-mono text-[10px] break-all select-all border border-base-content/5 shadow-inner">
                      {identity.pub}
                    </div>
                  </div>
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-[10px] font-bold uppercase opacity-40">Private Key (priv)</span>
                    </label>
                    <div className="relative group">
                      <div
                        className={`p-3 bg-base-300/50 rounded-lg font-mono text-[10px] break-all border border-base-content/5 select-all transition-all shadow-inner ${!showPrivateKeys["gundb_priv"] ? "blur-sm select-none grayscale opacity-30" : ""}`}
                      >
                        {identity.priv}
                      </div>
                      <button
                        className="absolute top-2 right-2 btn btn-xs btn-circle btn-ghost hover:bg-base-300"
                        onClick={() => togglePrivateKey("gundb_priv")}
                        type="button"
                      >
                        {showPrivateKeys["gundb_priv"] ? (
                          <EyeOff size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-[10px] font-bold uppercase opacity-40">
                        Encryption Public Key (epub)
                      </span>
                    </label>
                    <div className="p-3 bg-base-300/50 rounded-lg font-mono text-[10px] break-all select-all border border-base-content/5 shadow-inner">
                      {identity.epub}
                    </div>
                  </div>
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-[10px] font-bold uppercase opacity-40">
                        Encryption Private Key (epriv)
                      </span>
                    </label>
                    <div className="relative group">
                      <div
                        className={`p-3 bg-base-300/50 rounded-lg font-mono text-[10px] break-all border border-base-content/5 select-all transition-all shadow-inner ${!showPrivateKeys["gundb_epriv"] ? "blur-sm select-none grayscale opacity-30" : ""}`}
                      >
                        {identity.epriv}
                      </div>
                      <button
                        className="absolute top-2 right-2 btn btn-xs btn-circle btn-ghost hover:bg-base-300"
                        onClick={() => togglePrivateKey("gundb_epriv")}
                        type="button"
                      >
                        {showPrivateKeys["gundb_epriv"] ? (
                          <EyeOff size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-[10px] font-bold uppercase opacity-40">Alias</span>
                    </label>
                    <div className="p-3 bg-base-300/50 rounded-lg font-mono text-sm border border-base-content/5 shadow-inner">
                      {identity.alias || "N/A"}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline gap-2 shadow-sm"
                      onClick={() => {
                        const json = JSON.stringify(identity, null, 2);
                        navigator.clipboard.writeText(json);
                      }}
                    >
                      <Copy size={14} /> Copy JSON
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline gap-2 shadow-sm"
                      onClick={() => {
                        const blob = new Blob(
                          [JSON.stringify(identity, null, 2)],
                          { type: "application/json" },
                        );
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = `tunecamp-identity-${identity.alias || "node"}.json`;
                        a.click();
                        URL.revokeObjectURL(a.href);
                      }}
                    >
                      <Download size={14} /> Export
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center opacity-30 italic">
                  Loading identity...
                </div>
              )}
            </div>
          </div>

          {/* Import Identity Card - Only for Root Admin */}
          {isRootAdmin && (
            <div className="card card-m3 border border-warning/10 bg-warning/5">
              <div className="card-body p-6">
                <h3 className="card-title text-[10px] uppercase tracking-[0.2em] text-warning mb-4 flex items-center gap-2">
                  <Key size={16} /> Import Node Identity
                </h3>

              <div className="alert alert-warning shadow-m3-1 text-xs mb-4 py-3 bg-warning/10 border-warning/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>
                    Paste a valid ZEN key pair (JSON) to restore a previous
                    identity. This is a <strong>destructive action</strong>.
                  </span>
                </div>
              </div>

              <form onSubmit={handleImport} className="space-y-4">
                <textarea
                  className="textarea textarea-bordered w-full font-mono text-[10px] h-32 bg-base-100/50 focus:border-warning"
                  placeholder='{"pub":"...", "priv":"...", "epub":"...", "epriv":"..."}'
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                ></textarea>

                {error && <div className="text-error text-xs font-bold px-1">{error}</div>}
                {success && <div className="text-success text-xs font-bold px-1">{success}</div>}
                <div className="card-actions justify-end">
                  <button
                    type="submit"
                    className="btn btn-warning btn-sm gap-2 shadow-md"
                    disabled={loading || !importData}
                  >
                    <Save size={16} /> Import Identity
                  </button>
                </div>
              </form>
            </div>
          </div>
          )}
        </div>
      )}

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
                      <h3 className="font-bold">Instance Actor (Site)</h3>
                      <p className="text-[10px] opacity-40 font-mono mt-0.5">
                        @site@{window.location.hostname}
                      </p>
                    </div>
                  </div>
                  <div className="badge badge-primary badge-outline badge-sm font-bold tracking-wider py-2">
                    SERVICE
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-[10px] font-bold uppercase opacity-40">
                        RSA Public Key
                      </span>
                    </label>
                    <div className="p-3 bg-base-300/50 rounded-lg font-mono text-[10px] break-all select-all max-h-32 overflow-y-auto border border-base-content/5 scrollbar-thin shadow-inner">
                      {siteApIdentity.publicKey}
                    </div>
                  </div>

                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-[10px] font-bold uppercase opacity-40">
                        RSA Private Key
                      </span>
                    </label>
                    <div className="relative group">
                      <div
                        className={`p-3 bg-base-300/50 rounded-lg font-mono text-[10px] break-all border border-base-content/5 select-all transition-all scrollbar-thin shadow-inner ${!showPrivateKeys["site"] ? "blur-sm select-none grayscale opacity-30" : "max-h-32 overflow-y-auto"}`}
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
                        <p className="text-[10px] opacity-40 font-mono mt-0.5">
                          @{artist.slug}@{window.location.hostname}
                        </p>
                      </div>
                    </div>
                    <div className="badge badge-secondary badge-outline badge-sm font-bold tracking-wider py-2">
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
                          <span className="label-text text-[10px] font-bold uppercase opacity-40">
                            RSA Public Key
                          </span>
                        </label>
                        <div className="p-3 bg-base-300/50 rounded-lg font-mono text-[10px] break-all select-all max-h-32 overflow-y-auto border border-base-content/5 scrollbar-thin shadow-inner">
                          {publicKey}
                        </div>
                      </div>

                      <div className="form-control">
                        <label className="label py-1">
                          <span className="label-text text-[10px] font-bold uppercase opacity-40">
                            RSA Private Key
                          </span>
                        </label>
                        <div className="relative group">
                          <div
                            className={`p-3 bg-base-300/50 rounded-lg font-mono text-[10px] break-all border border-base-content/5 select-all transition-all scrollbar-thin shadow-inner ${!showPrivateKeys[artist.id] ? "blur-sm select-none grayscale opacity-30" : "max-h-32 overflow-y-auto"}`}
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

