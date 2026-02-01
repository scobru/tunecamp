import { useState, useRef, useEffect } from 'react';
import API from '../../services/api';
import { UploadCloud, Music, X } from 'lucide-react';

export const UploadTracksModal = ({ onUploadComplete }: { onUploadComplete?: () => void }) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [releaseSlug, setReleaseSlug] = useState<string>('');
    const [releaseTitle, setReleaseTitle] = useState<string>('');
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0); // Mock progress for now
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const handleOpen = (e: CustomEvent) => {
            if (e.detail) {
                setReleaseSlug(e.detail.slug);
                setReleaseTitle(e.detail.title);
            }
            setFiles([]);
            setError('');
            setSuccess('');
            setUploading(false);
            setProgress(0);
            dialogRef.current?.showModal();
        };

        document.addEventListener('open-upload-tracks-modal', handleOpen as EventListener);
        return () => document.removeEventListener('open-upload-tracks-modal', handleOpen as EventListener);
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
        }
    };

    const removeFile = (index: number) => {
        setFiles(files.filter((_, i) => i !== index));
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (files.length === 0) return;

        setUploading(true);
        setError('');
        
        try {
            await API.uploadTracks(files, { releaseSlug });
            setSuccess(`Successfully uploaded ${files.length} tracks.`);
            setFiles([]);
            if (onUploadComplete) onUploadComplete();
            
            // Auto close after success? Maybe keep open to see message.
        } catch (e: any) {
            console.error(e);
            setError(e.message || 'Failed to upload tracks');
        } finally {
            setUploading(false);
        }
    };

    return (
        <dialog id="upload-tracks-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-white/5">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>
                
                <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                    <UploadCloud size={20} className="text-secondary"/> Upload Tracks
                </h3>
                {releaseTitle && <p className="text-sm opacity-70 mb-4">Adding to: <span className="font-bold">{releaseTitle}</span></p>}

                <form onSubmit={handleUpload} className="space-y-4">
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Select Audio Files</span>
                        </label>
                        <input 
                            type="file" 
                            className="file-input file-input-bordered w-full" 
                            multiple 
                            accept="audio/*"
                            onChange={handleFileChange}
                        />
                    </div>

                    {files.length > 0 && (
                        <div className="bg-base-200 rounded p-2 max-h-40 overflow-y-auto space-y-1">
                            {files.map((file, i) => (
                                <div key={i} className="flex justify-between items-center text-xs p-1 hover:bg-white/5 rounded">
                                    <div className="flex items-center gap-2 truncate">
                                        <Music size={12}/> {file.name}
                                    </div>
                                    <button type="button" onClick={() => removeFile(i)} className="btn btn-ghost btn-xs btn-square">
                                        <X size={12}/>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {error && <div className="text-error text-sm text-center">{error}</div>}
                    {success && <div className="text-success text-sm text-center">{success}</div>}

                    <div className="modal-action flex-col">
                        {uploading && (
                            <div className="w-full mb-2">
                                <progress className="progress progress-secondary w-full" value={progress} max="100"></progress>
                            </div>
                        )}
                        <div className="flex justify-end gap-2">
                            <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Close</button>
                            <button type="submit" className="btn btn-secondary" disabled={uploading || files.length === 0}>
                                {uploading ? 'Uploading...' : 'Start Upload'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
};
