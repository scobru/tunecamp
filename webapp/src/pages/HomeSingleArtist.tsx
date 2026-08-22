import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import API from "../services/api";
import { ReleaseCard } from "../components/ui/ReleaseCard";
import { queryKeys } from "../hooks/queries";
import { useSiteSettingsStore } from "../stores/useSiteSettingsStore";
import { usePlayerStore } from "../stores/usePlayerStore";
import { Play, Pause, Share, Music } from "lucide-react";
import { useConfigStore } from "../stores/useConfigStore";
import { renderMarkdown } from "../utils/markdown";

export const HomeSingleArtist = () => {
    const { settings: siteSettings } = useSiteSettingsStore();
    const { cacheBuster } = useConfigStore();
    const { currentTrack, isPlaying, togglePlay, playTrack } = usePlayerStore();
    
    // In single_artist mode, the backend injects the primary artist info into settings
    const primaryArtistId = siteSettings?.primaryArtistId;

    const { data: artist, isLoading: artistLoading } = useQuery({
        queryKey: ["artist", primaryArtistId],
        queryFn: () => API.getArtist(String(primaryArtistId)),
        enabled: !!primaryArtistId
    });

    const { data: catalog, isLoading: catalogLoading } = useQuery({
        queryKey: queryKeys.catalog,
        queryFn: () => API.getCatalog(),
    });

    const loading = artistLoading || catalogLoading;
    const recentReleases: any[] = catalog?.recentReleases || [];
    const recentAlbums: any[] = catalog?.recentAlbums || [];
    const allReleases = [...recentReleases, ...recentAlbums].filter(
        (v, i, a) => a.findIndex(t => t.id === v.id) === i
    ).sort((a, b) => new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime());

    const latestRelease = allReleases.length > 0 ? allReleases[0] : null;

    if (loading) {
        return (
            <div className="p-4 lg:p-8 space-y-8 animate-pulse">
                <div className="skeleton h-64 w-full rounded-[2rem]"></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8">
                    {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-48 w-full rounded-2xl"></div>)}
                </div>
            </div>
        );
    }

    if (!artist) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
                <Music size={48} className="opacity-20" />
                <h1 className="text-2xl font-bold">Artist Profile Not Found</h1>
                <p className="opacity-50">Create an artist profile or switch instance modes.</p>
            </div>
        );
    }

    const handlePlayAll = () => {
        if (latestRelease && latestRelease.tracks && latestRelease.tracks.length > 0) {
            playTrack(latestRelease.tracks[0], latestRelease.tracks);
        }
    };

    const isPlayingLatest = currentTrack && latestRelease?.tracks?.some((t: any) => t.id === currentTrack.id);

    return (
        <section className="space-y-16 pb-20 animate-fade-in">
            {/* Hero Section */}
            <div className="relative rounded-[2.5rem] overflow-hidden border border-base-content/5 shadow-level-2 bg-base-300 min-h-[50vh] flex items-end">
                <div className="absolute inset-0 z-0">
                    {artist.bannerImage ? (
                        <img src={API.getArtistBannerUrl(artist.id, cacheBuster)} className="w-full h-full object-cover" />
                    ) : artist.coverImage ? (
                        <img src={API.getArtistCoverUrl(artist.id, cacheBuster)} className="w-full h-full object-cover opacity-50 blur-xl scale-110" />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-base-300 via-base-300/80 to-transparent"></div>
                </div>

                <div className="relative z-10 p-6 md:p-12 w-full max-w-5xl mx-auto flex flex-col md:flex-row gap-8 items-end">
                    <figure className="w-32 h-32 md:w-48 md:h-48 rounded-full shadow-level-3 border-4 border-base-300 overflow-hidden shrink-0">
                        {artist.coverImage ? (
                            <img src={API.getArtistCoverUrl(artist.id, cacheBuster)} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-neutral flex items-center justify-center text-5xl font-bold">{artist.name[0]}</div>
                        )}
                    </figure>
                    <div className="flex-1 space-y-4">
                        <h1 className="text-4xl md:text-6xl font-black tracking-tight text-prominent leading-none">{artist.name}</h1>
                        
                        <div className="flex flex-wrap gap-3 items-center">
                            {latestRelease && (
                                <button
                                    onClick={() => isPlayingLatest ? togglePlay() : handlePlayAll()}
                                    className="btn btn-primary btn-lg rounded-2xl shadow-level-2 shadow-primary/30"
                                >
                                    {isPlayingLatest && isPlaying ? <Pause fill="currentColor" size={20} /> : <Play fill="currentColor" size={20} />}
                                    {isPlayingLatest && isPlaying ? "Pause" : "Play Latest"}
                                </button>
                            )}
                            {artist.links && artist.links.length > 0 && (
                                <div className="flex gap-2">
                                    {artist.links.slice(0, 3).map((link: any, i: number) => (
                                        <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="btn btn-circle btn-ghost bg-base-100/50 hover:bg-base-100 backdrop-blur-md border border-base-content/10">
                                            <Share size={18} />
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Latest Release Highlight */}
            {latestRelease && (
                <div className="max-w-5xl mx-auto px-4 md:px-8 space-y-6">
                    <h2 className="text-2xl font-black tracking-tighter">Latest Release</h2>
                    <div className="card md:card-side bg-base-200 border border-base-content/5 shadow-level-1 overflow-hidden">
                        <figure className="md:w-1/3 aspect-square shrink-0">
                            <img 
                                src={latestRelease.coverUrl || API.getAlbumCoverUrl(latestRelease.id)} 
                                alt={latestRelease.title}
                                className="w-full h-full object-cover"
                            />
                        </figure>
                        <div className="card-body">
                            <p className="text-[10px] font-black tracking-[0.2em] uppercase opacity-50 mb-[-0.5rem]">{latestRelease.type || "Album"}</p>
                            <h3 className="card-title text-3xl font-bold">{latestRelease.title}</h3>
                            <p className="opacity-70 flex-grow-0">{new Date(latestRelease.created_at || latestRelease.createdAt).getFullYear()}</p>
                            
                            <div className="mt-4 space-y-2">
                                {(latestRelease.tracks || []).slice(0, 4).map((track: any, idx: number) => (
                                    <div key={track.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-base-content/5 group cursor-pointer" onClick={() => playTrack(track, latestRelease.tracks)}>
                                        <span className="w-4 text-xs opacity-40 text-right">{idx + 1}</span>
                                        <span className="flex-1 text-sm font-medium">{track.title}</span>
                                        <Play size={14} className="opacity-0 group-hover:opacity-50" />
                                    </div>
                                ))}
                                {(latestRelease.tracks?.length || 0) > 4 && (
                                    <p className="text-xs opacity-50 pl-9 pt-2">...and {(latestRelease.tracks?.length || 0) - 4} more</p>
                                )}
                            </div>
                            
                            <div className="card-actions justify-end mt-4">
                                <Link to={`/albums/${latestRelease.id}`} className="btn btn-secondary btn-sm rounded-xl">View Details</Link>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Discography Grid */}
            {allReleases.length > 1 && (
                <div className="max-w-5xl mx-auto px-4 md:px-8 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-black tracking-tighter">Discography</h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                        {allReleases.slice(1).map((release: any) => (
                            <ReleaseCard key={release.id} item={release} type="release" />
                        ))}
                    </div>
                </div>
            )}

            {/* Bio Section */}
            {artist.bio && (
                <div className="max-w-3xl mx-auto px-4 md:px-8 py-12 text-center space-y-6">
                    <h2 className="text-2xl font-black tracking-tighter">About</h2>
                    <div 
                        className="prose prose-sm md:prose-base prose-invert mx-auto opacity-80"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(artist.bio) }}
                    />
                </div>
            )}
        </section>
    );
};
