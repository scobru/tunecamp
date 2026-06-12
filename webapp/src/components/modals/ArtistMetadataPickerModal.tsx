import { useState, useEffect } from "react";
import API from "../../services/api";
import { X, Check, Loader2, User, Globe } from "lucide-react";
import { notify } from "../../utils/notify";

interface ArtistMetadataMatch {
    id: string;
    name: string;
    bio?: string;
    avatarUrl?: string;
    links?: any;
    source: string;
    aiBio?: string; // Bio provided by AI disambiguation
}

interface ArtistMetadataPickerModalProps {
    artist: any;
    isOpen: boolean;
    onClose: () => void;
    onApplied: () => void;
}

export const ArtistMetadataPickerModal = ({ artist, isOpen, onClose, onApplied }: ArtistMetadataPickerModalProps) => {
    const [candidates, setCandidates] = useState<ArtistMetadataMatch[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isApplying, setIsApplying] = useState(false);

    useEffect(() => {
        if (isOpen && artist) {
            loadCandidates();
        }
    }, [isOpen, artist]);

    const loadCandidates = async () => {
        setIsLoading(true);
        try {
            const data = await API.getArtistMetadataCandidates(artist.id);
            setCandidates(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelect = async (candidate: ArtistMetadataMatch) => {
        setIsApplying(true);
        try {
            await API.applyArtistMetadata(artist.id, candidate);
            onApplied();
            onClose();
        } catch (e: any) {
            notify.error(e, "Failed to apply artist metadata");
        } finally {
            setIsApplying(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal modal-open">
            <div className="modal-box max-w-3xl bg-base-200 border border-primary/20 shadow-level-1">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl flex items-center gap-2">
                        <User className="text-primary" /> Artist Metadata Enrichment
                    </h3>
                    <button className="btn btn-sm btn-ghost btn-circle" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="mb-6 p-4 bg-primary/5 rounded-box border border-primary/10">
                    <div className="text-xs opacity-50 font-bold mb-1">Local Artist Profile</div>
                    <div className="font-bold text-lg">{artist.name}</div>
                    <div className="text-sm opacity-70">Searching for high-quality photos and official bios...</div>
                </div>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    {isLoading ? (
                        <div className="text-center py-12">
                            <div className="relative inline-block mb-4">
                                <Loader2 className="animate-spin opacity-20" size={60} />
                                <Globe className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary animate-pulse" size={30} />
                            </div>
                            <p className="opacity-50 font-medium">AI is identifying the artist and searching providers...</p>
                            <p className="text-xs opacity-30 mt-1 italic">Cross-referencing releases for maximum accuracy</p>
                        </div>
                    ) : candidates.length === 0 ? (
                        <div className="text-center py-12 opacity-50">
                            No matching artists found with photo data.
                        </div>
                    ) : (
                        candidates.map((c, i) => (
                            <div 
                                key={`${c.id}-${i}`} 
                                className="flex gap-4 p-4 bg-base-100 rounded-xl border border-base-content/5 hover:border-primary/50 transition-all group cursor-pointer"
                                onClick={() => !isApplying && handleSelect(c)}
                            >
                                <div className="w-24 h-24 bg-base-300 rounded-full overflow-hidden flex-shrink-0 border-2 border-base-content/10 group-hover:border-primary/30 transition-colors">
                                    {c.avatarUrl ? (
                                        <img src={c.avatarUrl} alt={c.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center opacity-20">
                                            <User size={32} />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <div className="font-bold text-lg truncate group-hover:text-primary transition-colors">{c.name}</div>
                                        <div className="badge badge-sm badge-outline opacity-50">{c.source}</div>
                                    </div>
                                    
                                    {(c.aiBio || c.bio) && (
                                        <p className="text-sm opacity-70 line-clamp-3 mt-1 leading-relaxed">
                                            {c.aiBio || c.bio}
                                        </p>
                                    )}
                                    
                                    {c.aiBio && (
                                        <div className="mt-2 text-xs tracking-normal font-bold text-primary/50">
                                            ✨ AI Disambiguation Match
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center">
                                    <button 
                                        className="btn btn-circle btn-primary btn-sm shadow-level-1 shadow-primary/20 scale-90 group-hover:scale-100 transition-transform"
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
                    <button className="btn btn-ghost" onClick={onClose} disabled={isApplying}>Cancel</button>
                </div>
            </div>
            <div className="modal-backdrop bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
        </div>
    );
};
