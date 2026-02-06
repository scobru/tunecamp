import API from '../../services/api';
import { UploadCloud, Music, X, Trash2 } from 'lucide-react';
import type { Track } from '../../types';

export const UploadTracksModal = ({ onUploadComplete }: { onUploadComplete?: () => void }) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [releaseSlug, setReleaseSlug] = useState<string>('');
    const [releaseTitle, setReleaseTitle] = useState<string>('');
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0); // Mock progress for now
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [existingTracks, setExistingTracks] = useState<Track[]>([]);
    const [loadingExisting, setLoadingExisting] = useState(false);

    useEffect(() => {
        const handleOpen = (e: CustomEvent) => {
            if (e.detail) {
                setReleaseSlug(e.detail.slug);
                setReleaseTitle(e.detail.title);
                if (e.detail.slug) {
                    loadExistingTracks(e.detail.slug);
                }
            } else {
                setExistingTracks([]);
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

    const loadExistingTracks = async (slug: string) => {
        setLoadingExisting(true);
        try {
            const album = await API.getAlbum(slug);
            if (album && album.tracks) {
                setExistingTracks(album.tracks);
            }
        } catch (e) {
            console.error('Failed to load existing tracks:', e);
        } finally {
            setLoadingExisting(false);
        }
    };

    const handleDeleteTrack = async (trackId: string) => {
        if (!confirm('Are you sure you want to delete this track? This will remove it from the database.')) return;
        
        try {
            await API.deleteTrack(trackId);
            setExistingTracks(prev => prev.filter(t => t.id !== trackId));
            if (onUploadComplete) onUploadComplete();
        } catch (e: any) {
            setError(e.message || 'Failed to delete track');
        }
    };

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

                {/* Single / Release Toggle */}
                {!releaseTitle && (
                    <div className="tabs tabs-boxed mb-4 bg-transparent p-0">
                        <a 
                            className={`tab tab-sm ${!releaseSlug ? 'tab-active' : ''}`} 
                            onClick={() => setReleaseSlug('')}
                        >
                            Library (Single)
                        </a>
                        <a 
                            className={`tab tab-sm ${releaseSlug ? 'tab-active opacity-50 cursor-not-allowed' : ''}`}
                            title="To upload to a specific release, use the Releases page"
                        >
                            Release
                        </a>
                    </div>
                )}

                {releaseTitle && (
                    <div className="alert alert-sm bg-base-200 mb-4 border-none flex-row">
                        <Music size={16} className="opacity-50"/>
                        <span className="text-sm">Adding to: <span className="font-bold">{releaseTitle}</span></span>
                    </div>
                )}

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

                    {/* Existing Tracks List */}
                    {releaseSlug && existingTracks.length > 0 && (
                        <div className="space-y-2">
                             <label className="label">
                                <span className="label-text-alt uppercase font-bold opacity-50">Current Tracks</span>
                            </label>
                            <div className="bg-base-300/30 rounded p-2 max-h-40 overflow-y-auto space-y-1">
                                {existingTracks.map((track) => (
                                    <div key={track.id} className="flex justify-between items-center text-xs p-2 hover:bg-white/5 rounded border border-white/5">
                                        <div className="flex items-center gap-2 truncate">
                                            <Music size={12} className="text-secondary opacity-50"/> 
                                            <span className="truncate">{track.title}</span>
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={() => handleDeleteTrack(track.id)} 
                                            className="btn btn-ghost btn-xs btn-square text-error"
                                            title="Delete track"
                                        >
                                            <Trash2 size={12}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {loadingExisting && <div className="text-center py-2"><span className="loading loading-spinner loading-xs text-secondary"></span></div>}

                    {files.length > 0 && (
                        <div className="space-y-2">
                            <label className="label">
                                <span className="label-text-alt uppercase font-bold opacity-50 text-secondary">Files to Upload</span>
                            </label>
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
