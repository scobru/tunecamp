import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Disc, LayoutGrid, List, AlignJustify } from 'lucide-react';
import { ReleaseCard } from '../components/ui/ReleaseCard';
import { PageHeader } from '../components/ui/PageHeader';
import { queryKeys } from '../hooks/queries';
import API from '../services/api';
import clsx from 'clsx';

const Releases = () => {
    const { data: releases = [], isLoading: loading } = useQuery({
        queryKey: queryKeys.releases,
        queryFn: () => API.getReleases(),
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

    if (loading) return <div className="p-12 text-center opacity-50">Loading releases...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
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

             {availableCategories.length > 2 && (
                <div className="tabs tabs-boxed bg-base-200/40 w-fit max-w-full overflow-x-auto flex-nowrap">
                    {availableCategories.map(c => (
                        <button
                            key={c.key}
                            className={clsx("tab whitespace-nowrap", category === c.key && "tab-active")}
                            onClick={() => setCategory(c.key)}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
             )}

             <div className={clsx(
                "grid gap-6",
                viewMode === 'grid'
                    ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"
                    : viewMode === 'list'
                        ? "grid-cols-1 md:grid-cols-2 gap-4"
                        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2"
             )}>
                {filteredReleases.map(item => (
                    <ReleaseCard key={item.id} item={item} viewMode={viewMode} />
                ))}
             </div>

             
             {filteredReleases.length === 0 && (
                <div className="text-center py-20 opacity-30 flex flex-col items-center gap-4">
                    <Disc size={64}/>
                    <p className="text-xl">No formal releases found matching your search.</p>
                </div>
             )}
        </div>
    );
};

export default Releases;
