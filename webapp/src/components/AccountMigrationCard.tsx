import { useRef, useState } from "react";
import { Download, Upload, Globe } from "lucide-react";
import API from "../services/api";
import { notify } from "../utils/notify";

/**
 * Account portability (Mastodon-style data model). Exports the logged-in
 * account's profile link + playlists as a JSON archive, and imports one on
 * another instance after registering there. Auth stays per-instance, so this
 * moves data — not credentials. Artist follower-redirect is separate (the
 * ActivityPub "Identity Migration" panel / Move activity).
 */
interface AccountMigrationCardProps {
  hasArtistProfile?: boolean;
  onNavigateToArtist?: () => void;
}

export default function AccountMigrationCard({
  hasArtistProfile = false,
  onNavigateToArtist,
}: AccountMigrationCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<null | {
    imported_playlists: number;
    imported_tracks: number;
    skipped_tracks: number;
    skipped: { playlist: string; title: string; artist: string }[];
    identity_linked: boolean;
    identity_note?: string;
  }>(null);

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const archive = await API.exportAccount();
      const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tunecamp-account-${archive?.username || "export"}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify.success("Account archive exported.");
    } catch (e: any) {
      notify.error(e?.message || "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file || busy) return;
    setBusy(true);
    setReport(null);
    try {
      const archive = JSON.parse(await file.text());
      const res = await API.importAccount(archive);
      setReport(res);
      notify.success(`Imported ${res.imported_playlists} playlist(s), ${res.imported_tracks} track(s).`);
    } catch (e: any) {
      notify.error(e?.message || "Import failed (invalid archive?)");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-box border border-base-300 bg-base-200/30 p-4 space-y-3">
      <h3 className="font-bold flex items-center gap-2">
        <Globe size={18} className="text-secondary" /> Migrate account (data)
      </h3>
      <p className="text-sm opacity-70">
        Move your account to another TuneCamp instance. Export your profile + playlists here,
        then register on the new instance and import the archive. Purchases stay on the instance
        where they were made.
        {hasArtistProfile && onNavigateToArtist && (
          <>
            {" "}
            To redirect your artist followers, use the ActivityPub identity migration in the{" "}
            <button
              type="button"
              className="link link-primary font-semibold align-baseline p-0 h-auto min-h-0 text-sm"
              onClick={onNavigateToArtist}
            >
              Artist Profile
            </button>{" "}
            tab.
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-outline btn-sm gap-2" onClick={handleExport} disabled={busy}>
          <Download size={15} /> Export archive
        </button>
        <button
          className="btn btn-outline btn-sm gap-2"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <Upload size={15} /> Import archive
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportFile}
        />
      </div>

      {report && (
        <div className="text-sm space-y-1 border-t border-base-300 pt-2">
          <div>
            Imported <b>{report.imported_playlists}</b> playlist(s), <b>{report.imported_tracks}</b> track(s).
          </div>
          {report.identity_note && (
            <div className="opacity-70 italic">{report.identity_note}</div>
          )}
          {report.skipped_tracks > 0 && (
            <details>
              <summary className="cursor-pointer text-warning">
                {report.skipped_tracks} track(s) not found on this instance (skipped)
              </summary>
              <ul className="mt-1 ml-4 list-disc opacity-70 max-h-40 overflow-y-auto">
                {report.skipped.map((s, i) => (
                  <li key={i}>
                    {s.title}{s.artist ? ` — ${s.artist}` : ""} <span className="opacity-50">({s.playlist})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
