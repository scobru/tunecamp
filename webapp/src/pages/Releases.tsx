import { useState, useEffect } from 'react';
import API from '../services/api';
import { Disc, LayoutGrid, List, AlignJustify } from 'lucide-react';
import { ReleaseCard } from '../components/ui/ReleaseCard';
import { useAuthStore } from '../stores/useAuthStore';
import clsx from 'clsx';

const Releases = () => {
    const { isAuthenticated } = useAuthStore();
    const [releases, setReleases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'minimal'>('grid');

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const data = await API.getReleases().catch(err => {
                    console.error("Failed to load releases:", err);
                    return [];
                });
                setReleases(data);
            } catch (e) {
                console.error("Error loading releases:", e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [isAuthenticated]);

    if (loading) return <div className="p-12 text-center opacity-50">Loading releases...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <Disc size={32} className="text-primary"/> Formal Releases
                </h1>
                
                <div className="flex items-center gap-4">
                    <div className="join bg-base-200 hidden md:flex">
                        <button
                            className={clsx("btn btn-sm join-item", viewMode === 'grid' && "btn-active")}
                            onClick={() => setViewMode('grid')}
                            title="Grid View"
                        >
                            <LayoutGrid size={16} />
                        </button>
                        <button
                            className={clsx("btn btn-sm join-item", viewMode === 'list' && "btn-active")}
                            onClick={() => setViewMode('list')}
                            title="List View"
                        >
                            <List size={16} />
                        </button>
                        <button
                            className={clsx("btn btn-sm join-item", viewMode === 'minimal' && "btn-active")}
                            onClick={() => setViewMode('minimal')}
                            title="Minimal View"
                        >
                            <AlignJustify size={16} />
                        </button>
                    </div>
                </div>
             </div>

             <div className={clsx(
                "grid gap-6",
                viewMode === 'grid'
                    ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"
                    : viewMode === 'list'
                        ? "grid-cols-1 md:grid-cols-2 gap-4"
                        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2"
             )}>
                {releases.map(item => (
                    <ReleaseCard key={item.id} item={item} viewMode={viewMode} />
                ))}
             </div>

             
             {releases.length === 0 && (
                <div className="text-center py-20 opacity-30 flex flex-col items-center gap-4">
                    <Disc size={64}/>
                    <p className="text-xl">No formal releases published yet.</p>
                </div>
             )}
        </div>
    );
};
 );
};

export default Releases;
