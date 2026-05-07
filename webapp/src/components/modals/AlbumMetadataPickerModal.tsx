import { useState, useEffect } from "react";
import API from "../../services/api";
import { X, Wand2, Check, Loader2, Disc } from "lucide-react";

interface MetadataMatch {
    id: string;
    title: string;
    artist: string;
    date?: string;
    year?: number;
    genre?: string;
    coverUrl?: string;
    source: string;
}

interface AlbumMetadataPickerModalProps {
    album: any;
    isOpen: boolean;
    onClose: () => void;
    onApplied: () => void;
}

export const AlbumMetadataPickerModal = ({ album, isOpen, onClose, onApplied }: AlbumMetadataPickerModalProps) => {
    const [candidates, setCandidates] = useState<MetadataMatch[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isApplying, setIsApplying] = useState(false);

    useEffect(() => {
        if (isOpen && album) {
            loadCandidates();
        }
    }, [isOpen, album]);

    const loadCandidates = async () => {
        setIsLoading(true);
        try {
            const data = await API.getAlbumMetadataCandidates(album.id);
            setCandidates(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelect = async (candidate: MetadataMatch) => {
        setIsApplying(true);
        try {
            await API.applyAlbumMetadata(album.id, candidate);
            onApplied();
            onClose();
        } catch (e: any) {
            alert("Failed to apply metadata: " + e.message);
        } finally {
            setIsApplying(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal modal-open">
            <div className="modal-box max-w-2xl bg-base-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl flex items-center gap-2">
                        <Disc className="text-primary" /> Select Album Metadata
                    </h3>
                    <button className="btn btn-sm btn-ghost btn-circle" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="mb-6 p-4 bg-base-300 rounded-box border border-base-content/5">
                    <div className="text-xs uppercase opacity-50 font-bold mb-1">Current Album Info</div>
                    <div className="font-bold">{album.artist_name} - {album.title}</div>
                    <div className="text-sm opacity-70 italic">Genre: {album.genre || "N/A"} | Year: {album.year || "N/A"}</div>
                </div>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    {isLoading ? (
                        <div className="text-center py-12">
                            <Loader2 className="animate-spin mx-auto mb-2 opacity-50" size={40} />
                            <p className="opacity-50">Searching online providers...</p>
                        </div>
                    ) : candidates.length === 0 ? (
                        <div className="text-center py-12 opacity-50">
                            No matching results found online.
                        </div>
                    ) : (
                        candidates.map((c, i) => (
                            <div 
                                key={`${c.id}-${i}`} 
                                className="flex gap-4 p-4 bg-base-100 rounded-xl border border-base-content/5 hover:border-primary/50 transition-all group cursor-pointer"
                                onClick={() => !isApplying && handleSelect(c)}
                            >
                                <div className="w-24 h-24 bg-base-300 rounded-lg overflow-hidden flex-shrink-0 border border-base-content/5">
                                    {c.coverUrl ? (
                                        <img src={c.coverUrl} alt="Cover" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center opacity-20">
                                            <Disc size={32} />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <div className="font-bold text-lg truncate">{c.title}</div>
                                        <div className="badge badge-sm opacity-50">{c.source}</div>
                                    </div>
                                    <div className="text-primary font-medium">{c.artist}</div>
                                    <div className="flex gap-2 mt-2">
                                        {c.genre && <div className="badge badge-outline badge-xs opacity-70">{c.genre}</div>}
                                        {c.year && <div className="badge badge-outline badge-xs opacity-70">{c.year}</div>}
                                        {c.date && <div className="text-xs opacity-50">{c.date}</div>}
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <button 
                                        className="btn btn-circle btn-primary btn-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                        disabled={isApplying}
                                    >
                                        {isApplying ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="modal-action">
                    <button className="btn" onClick={onClose} disabled={isApplying}>Cancel</button>
                </div>
            </div>
            <div className="modal-backdrop bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
        </div>
    );
};
