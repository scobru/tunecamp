import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Disc, LayoutGrid, List, AlignJustify, Music } from 'lucide-react';
import { ReleaseCard } from '../components/ui/ReleaseCard';
import { PageHeader } from '../components/ui/PageHeader';
import { queryKeys } from '../hooks/queries';
import API from '../services/api';
import clsx from 'clsx';
import { Link, useLocation } from 'react-router-dom';
import Tracks from './Tracks';

const Releases = () => {
    const location = useLocation();
    const isTracks = location.pathname.includes('/tracks');

    const { data: releases = [], isLoading: loading } = useQuery({
        queryKey: queryKeys.releases,
        queryFn: () => API.getReleases(),
        enabled: !isTracks,
    });
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'minimal'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [category, setCategory] = useState<'all' | 'album' | 'single' | 'liveset' | 'podcast'>('all');

    const CATEGORIES: { key: typeof category; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'album', label: 'Albums' },
        { key: 'single', label: 'Singles' },
        { key: 'liveset', label: 'Livesets' },
        { key: 'podcast', label: 'Podcasts' },
    ];

    // Resolve a release's category from `type`, falling back to the legacy product_type for podcasts.
    const releaseCategory = (r: any): string =>
        (r.product_type === 'podcast' || r.productType === 'podcast') ? 'podcast' : (r.type || 'album');

    const filteredReleases = releases.filter(release => {
        const matchesSearch =
            release.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            release.artistName?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = category === 'all' || releaseCategory(release) === category;
        return matchesSearch && matchesCategory;
    });

    // Only show category tabs that actually have releases (besides "All").
    const availableCategories = CATEGORIES.filter(
        c => c.key === 'all' || releases.some(r => releaseCategory(r) === c.key)
    );

    const renderTabs = () => (
        <div className="flex gap-2 border-b border-base-content/10 px-2 pb-2 overflow-x-auto shrink-0 mb-4">
            <Link
                to="/releases"
                className={clsx(
                    "flex items-center gap-2 px-4 py-2 rounded-full font-bold transition-colors text-sm shrink-0",
                    !isTracks ? "bg-primary text-primary-content" : "hover:bg-base-300 text-base-content/60"
                )}
            >
                <Disc size={16} />
                Releases
            </Link>
            <Link
                to="/releases/tracks"
                className={clsx(
                    "flex items-center gap-2 px-4 py-2 rounded-full font-bold transition-colors text-sm shrink-0",
                    isTracks ? "bg-primary text-primary-content" : "hover:bg-base-300 text-base-content/60"
                )}
            >
                <Music size={16} />
                Tracks
            </Link>
        </div>
    );

    if (isTracks) {
        return (
            <div className="flex flex-col h-full animate-fade-in">
                {renderTabs()}
                <div className="flex-1">
                    <Tracks />
                </div>
            </div>
        );
    }

    if (loading) return (
        <div className="flex flex-col h-full animate-fade-in">
            {renderTabs()}
            <div className="p-12 text-center opacity-50">Loading releases...</div>
        </div>
    );

    return (
        <div className="flex flex-col h-full animate-fade-in">
             {renderTabs()}
             <div className="space-y-6">
                 <PageHeader 
                    title="Releases" 
                    subtitle={`${filteredReleases.length} releases available`}
                    icon={Disc}
                    iconColor="text-primary"
                 >
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                        <div className="relative w-full sm:w-64">
                            <Disc className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={18} />
                            <input
                                type="text"
                                placeholder="Search releases..."
                                className="input input-bordered w-full pl-10 h-10 text-sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="join bg-base-200 w-full sm:w-auto justify-center">
                            <button
                                className={clsx("btn btn-sm join-item flex-1 sm:flex-initial", viewMode === 'grid' && "btn-active")}
                                onClick={() => setViewMode('grid')}
                                title="Grid View"
                            >
                                <LayoutGrid size={16} />
                            </button>
                            <button
                                className={clsx("btn btn-sm join-item flex-1 sm:flex-initial", viewMode === 'list' && "btn-active")}
                                onClick={() => setViewMode('list')}
                                title="List View"
                            >
                                <List size={16} />
                            </button>
                            <button
                                className={clsx("btn btn-sm join-item flex-1 sm:flex-initial", viewMode === 'minimal' && "btn-active")}
                                onClick={() => setViewMode('minimal')}
                                title="Minimal View"
                            >
                                <AlignJustify size={16} />
                            </button>
                        </div>
                    </div>
                 </PageHeader>

                 <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-2">
                    {availableCategories.map(cat => (
                        <button
                            key={cat.key}
                            className={clsx(
                                "btn btn-sm rounded-full capitalize shrink-0 transition-all duration-medium-1",
                                category === cat.key 
                                    ? "btn-primary font-bold shadow-level-1" 
                                    : "btn-ghost border border-base-content/10 hover:bg-base-300"
                            )}
                            onClick={() => setCategory(cat.key)}
                        >
                            {cat.label}
                        </button>
                    ))}
                 </div>

                 <div className={clsx(
                    "grid gap-6 px-2",
                    viewMode === 'grid'
                        ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"
                        : viewMode === 'list'
                            ? "grid-cols-1 md:grid-cols-2 gap-4"
                            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2"
                 )}>
                    {filteredReleases.map(release => (
                        <ReleaseCard key={release.id} item={release} viewMode={viewMode} />
                    ))}
                 </div>

                 {filteredReleases.length === 0 && (
                    <div className="text-center py-20 opacity-30 flex flex-col items-center gap-4">
                        <Disc size={64}/>
                        <p className="text-xl">No releases found.</p>
                    </div>
                 )}
             </div>
        </div>
    );
};

export default Releases;
