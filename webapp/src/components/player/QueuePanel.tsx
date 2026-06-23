import { usePlayerStore } from '../../stores/usePlayerStore';
import { X, Trash2, ListX } from 'lucide-react';

export const QueuePanel = () => {
    const { queue, queueIndex, playQueue, removeFromQueue, clearQueue, toggleQueue, isQueueOpen } = usePlayerStore();

    if (!isQueueOpen) return null;

    return (
        <div className="fixed right-0 bottom-24 w-80 max-w-[90vw] h-96 bg-base-200/95 backdrop-blur-xl border border-base-content/10 shadow-level-1 rounded-tl-2xl rounded-bl-2xl p-4 flex flex-col z-40 transition-all">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-base-content/5">
                <h3 className="font-bold text-lg">Queue ({queue.length})</h3>
                <div className="flex items-center gap-1">
                    {queue.length > 1 && (
                        <button
                            onClick={clearQueue}
                            aria-label="Clear queue"
                            className="btn btn-ghost btn-sm gap-1 text-xs opacity-60 hover:opacity-100 hover:text-error transition-all"
                        >
                            <ListX size={14} /> Clear
                        </button>
                    )}
                    <button onClick={toggleQueue} aria-label="Close queue" className="btn btn-ghost btn-circle btn-sm"><X size={16}/></button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto scrollbar-thin">
                {queue.length === 0 ? (
                    <div className="flex justify-center items-center h-full opacity-50">Queue is empty</div>
                ) : (
                    <div className="space-y-1">
                        {queue.map((track, i) => {
                            if (!track) return null;
                            return (
                            <div 
                                key={`${track.id}-${i}`} 
                                className={`flex items-center gap-2 p-2 rounded-lg group ${i === queueIndex ? 'bg-primary/20 text-primary' : 'hover:bg-base-content/5'}`}
                            >
                                <span className={`text-xs w-5 text-center opacity-50 ${i === queueIndex ? 'text-primary' : ''}`}>
                                    {i + 1}
                                </span>
                                <button
                                    className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded p-1 -ml-1 cursor-pointer"
                                    onClick={() => playQueue(queue, i)}
                                    aria-label={`Play ${track.title}`}
                                >
                                    <div className="truncate font-medium text-sm">{track.title}</div>
                                    <div className="truncate text-xs opacity-60">{track.artistName || ''}</div>
                                </button>
                                
                                {i !== queueIndex && (
                                    <button 
                                        className="btn btn-ghost btn-xs btn-circle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-error"
                                        onClick={(e) => { e.stopPropagation(); removeFromQueue(i); }}
                                        aria-label={`Remove ${track.title} from queue`}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                        )})}
                    </div>
                )}
            </div>
        </div>
    );
};
