
import { useState, useRef, useEffect } from 'react';
import API from '../../services/api';
import { Search, Check, X } from 'lucide-react';

interface TrackPickerModalProps {
    onTracksSelected: (tracks: any[]) => void;
    onClose: () => void;
    isOpen: boolean;
    excludeTrackIds?: number[];
}

export const TrackPickerModal = ({ onTracksSelected, onClose, isOpen, excludeTrackIds = [] }: TrackPickerModalProps) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [tracks, setTracks] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selectedTracks, setSelectedTracks] = useState<any[]>([]);

    useEffect(() => {
        if (isOpen) {
            dialogRef.current?.showModal();
            loadTracks();
            setSelectedTracks([]);
            setError(null);
        } else {
            dialogRef.current?.close();
        }
    }, [isOpen]);

    const loadTracks = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await API.getTracks();
            const available = data.filter((t: any) => !excludeTrackIds.includes(parseInt(t.id)));
            setTracks(available);
        } catch (e: any) {
            console.error(e);
            setError(e?.message || 'Failed to load tracks');
        } finally {
            setLoading(false);
        }
    };

    const toggleTrack = (track: any) => {
        setSelectedTracks(prev => {
            const exists = prev.find(t => t.id === track.id);
            if (exists) return prev.filter(t => t.id !== track.id);
            return [...prev, track];
        });
    };

    const handleConfirm = () => {
        onTracksSelected(selectedTracks);
        onClose();
    };

    const filteredTracks = tracks.filter(t => 
        t.title.toLowerCase().includes(search.toLowerCase()) || 
        (t.artistName && t.artistName.toLowerCase().includes(search.toLowerCase())) ||
        (t.artist_name && t.artist_name.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <dialog ref={dialogRef} className="modal">
            <div className="modal-box w-11/12 max-w-3xl h-[80vh] flex flex-col p-0">
                <div className="p-4 border-b border-base-content/10 flex justify-between items-center bg-base-200">
                    <h3 className="font-bold text-lg">Select Tracks from Library</h3>
                    <button className="btn btn-sm btn-ghost btn-circle" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-4 bg-base-100 border-b border-base-content/5">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" size={16} />
                        <input 
                            type="text" 
                            className="input input-bordered w-full pl-10" 
                            placeholder="Search tracks..." 
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="text-center py-8 opacity-50">Loading tracks...</div>
                    ) : error ? (
                        <div className="text-center py-8 text-error">
                            <div className="font-bold mb-1">Error loading tracks</div>
                            <div className="text-xs opacity-70">{error}</div>
                            <button className="btn btn-sm btn-ghost mt-3" onClick={loadTracks}>Retry</button>
                        </div>
                    ) : filteredTracks.length === 0 && search ? (
                        <div className="text-center py-8 opacity-50">No tracks match your search.</div>
                    ) : filteredTracks.length === 0 ? (
                        <div className="text-center py-8 opacity-50">
                            <div className="mb-1">No tracks in your library.</div>
                            <div className="text-xs">Upload tracks from the Library section first.</div>
                        </div>
                    ) : (
                        <div className="grid gap-2">
                            {filteredTracks.map(track => {
                                const isSelected = !!selectedTracks.find(t => t.id === track.id);
                                return (
                                    <div 
                                        key={track.id} 
                                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 border-primary' : 'bg-base-200/50 border-transparent hover:bg-base-200'}`}
                                        onClick={() => toggleTrack(track)}
                                    >
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected ? 'bg-primary border-primary text-primary-content' : 'border-base-content/30'}`}>
                                            {isSelected && <Check size={14} />}
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-bold flex items-center gap-2">
                                                {track.title}
                                                {(track.losslessPath || track.lossless_path) ? (
                                                    <span className="badge badge-xs badge-outline opacity-50 font-mono">
                                                        {(track.losslessPath || track.lossless_path || '').toLowerCase().endsWith('.wav') ? 'WAV' : 'FLAC'}
                                                    </span>
                                                ) : (
                                                    <span className="badge badge-xs badge-outline opacity-50 font-mono">
                                                        {track.format || 'MP3'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs opacity-60">{track.artistName || track.artist_name || 'Unknown Artist'} • {track.albumName || track.album_title || 'Unknown Album'}</div>
                                        </div>
                                        <div className="text-xs font-mono opacity-50">
                                            {track.duration ? `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, '0')}` : '-'}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-base-content/10 bg-base-200 flex justify-end gap-2">
                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    <button 
                        className="btn btn-primary" 
                        onClick={handleConfirm}
                        disabled={selectedTracks.length === 0}
                    >
                        Add {selectedTracks.length} Tracks
                    </button>
                </div>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button onClick={onClose}>close</button>
            </form>
        </dialog>
    );
};

