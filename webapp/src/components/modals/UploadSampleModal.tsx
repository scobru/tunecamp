import { useState, useRef, useEffect } from "react";
import API from "../../services/api";
import { UploadCloud, Music2 } from "lucide-react";

const LICENSES = ["cc0", "cc-by", "cc-by-sa", "royalty-free"];

export const UploadSampleModal = ({
  onUploadComplete,
}: {
  onUploadComplete?: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bpm, setBpm] = useState("");
  const [musicalKey, setMusicalKey] = useState("");
  const [license, setLicense] = useState("cc0");
  const [attributionName, setAttributionName] = useState("");
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleOpen = () => {
      setFile(null);
      setTitle("");
      setDescription("");
      setBpm("");
      setMusicalKey("");
      setLicense("cc0");
      setAttributionName("");
      setTags("");
      setError("");
      setUploading(false);
      dialogRef.current?.showModal();
    };
    document.addEventListener("open-upload-sample-modal", handleOpen);
    return () => document.removeEventListener("open-upload-sample-modal", handleOpen);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) return;

    setUploading(true);
    setError("");
    try {
      await API.uploadSample(file, { title, description, bpm, musicalKey, license, attributionName, tags });
      onUploadComplete?.();
      dialogRef.current?.close();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <dialog id="upload-sample-modal" className="modal" ref={dialogRef}>
      <div className="modal-box bg-base-100 border border-base-content/5">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
        </form>

        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <UploadCloud size={20} className="text-secondary" /> Upload Sample
        </h3>

        <form onSubmit={handleUpload} className="space-y-4">
          <div className="form-control">
            <label className="label"><span className="label-text">Audio File</span></label>
            <input
              type="file"
              className="file-input file-input-bordered w-full"
              accept="audio/*"
              onChange={handleFileChange}
            />
            {file && (
              <span className="text-xs opacity-60 mt-1 flex items-center gap-1"><Music2 size={12} /> {file.name}</span>
            )}
          </div>

          <div className="form-control">
            <label className="label"><span className="label-text">Title</span></label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label"><span className="label-text-alt font-bold opacity-50">BPM</span></label>
              <input type="number" className="input input-bordered input-sm w-full" value={bpm} onChange={(e) => setBpm(e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text-alt font-bold opacity-50">Key</span></label>
              <input type="text" placeholder="e.g. Am" className="input input-bordered input-sm w-full" value={musicalKey} onChange={(e) => setMusicalKey(e.target.value)} />
            </div>
          </div>

          <div className="form-control">
            <label className="label"><span className="label-text-alt font-bold opacity-50">License</span></label>
            <select className="select select-bordered select-sm w-full" value={license} onChange={(e) => setLicense(e.target.value)}>
              {LICENSES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
            </select>
          </div>

          <div className="form-control">
            <label className="label"><span className="label-text-alt font-bold opacity-50">Attribution Name (optional)</span></label>
            <input type="text" className="input input-bordered input-sm w-full" value={attributionName} onChange={(e) => setAttributionName(e.target.value)} />
          </div>

          <div className="form-control">
            <label className="label"><span className="label-text-alt font-bold opacity-50">Tags (comma-separated)</span></label>
            <input type="text" className="input input-bordered input-sm w-full" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>

          <div className="form-control">
            <label className="label"><span className="label-text-alt font-bold opacity-50">Description</span></label>
            <textarea className="textarea textarea-bordered w-full" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {error && <div className="text-error text-sm text-center">{error}</div>}

          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Close</button>
            <button type="submit" className="btn btn-secondary" disabled={uploading || !file || !title}>
              {uploading ? (<><span className="loading loading-spinner loading-xs"></span> Uploading...</>) : "Upload Sample"}
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
};
