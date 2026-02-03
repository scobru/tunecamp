import { useState, useEffect } from 'react';
import API from '../services/api';
import { useParams, Link } from 'react-router-dom';
import { Play, Disc, Globe } from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import type { Artist, Album, Post } from '../types';

export const ArtistDetails = () => {
    const { id } = useParams();
    const [artist, setArtist] = useState<Artist | null>(null);
    const [albums, setAlbums] = useState<Album[]>([]);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const { playTrack } = usePlayerStore();

    useEffect(() => {
        if (id) {
            Promise.all([
                API.getArtist(id),
                API.getArtistPosts(id)
            ]).then(([artistData, artistPosts]) => {
                setArtist(artistData);
                // Use albums directly from artist response if available
                // @ts-ignore
                if (artistData.albums) {
                    // @ts-ignore
                    setAlbums(artistData.albums);
                } else {
                    // Fallback to fetching all (deprecated logic, but keeping for safety if backend older)
                    API.getAlbums().then(allAlbums => {
                         setAlbums(allAlbums.filter(a => a.artistId === artistData.id));
                    });
                }
                setPosts(artistPosts);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
        }
    }, [id]);

    if (loading) return <div className="p-12 text-center opacity-50">Loading artist...</div>;
    if (!artist) return <div className="p-12 text-center opacity-50">Artist not found.</div>;

    const handlePlay = () => {
        // Maybe play top tracks? For now play first album.
        if (albums.length > 0 && albums[0].tracks && albums[0].tracks.length > 0) {
            playTrack(albums[0].tracks[0], albums[0].tracks);
        }
    };

    return (
        <div className="space-y-12 animate-fade-in">
             {/* Header */}
             <div className="relative h-80 rounded-2xl overflow-hidden flex items-end p-8 border border-white/5">
                {/* Background Image ideally from artist cover or generic */}
                 <div className="absolute inset-0 z-0">
                     {artist.coverImage ? (
                        <img src={API.getArtistCoverUrl(artist.id)} className="w-full h-full object-cover opacity-30 blur-sm scale-105" />
                     ) : (
                         <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 h-full w-full"/>
                     )}
                     <div className="absolute inset-0 bg-gradient-to-t from-base-100 via-base-100/50 to-transparent"></div>
                </div>

                <div className="relative z-10 flex gap-6 items-end w-full">
                     <figure className="w-40 h-40 rounded-full shadow-2xl border-4 border-base-100 overflow-hidden shrink-0">
                         {artist.coverImage ? (
                             <img src={API.getArtistCoverUrl(artist.id)} className="w-full h-full object-cover"/>
                         ) : (
                             <div className="w-full h-full bg-neutral flex items-center justify-center text-4xl">{artist.name[0]}</div>
                         )}
                     </figure>
                     <div className="flex-1 space-y-2">
                         <h1 className="text-5xl md:text-7xl font-black tracking-tight">{artist.name}</h1>
                         <div className="flex items-center gap-4 text-sm font-bold opacity-70">
                            <span>{albums.length} Releases</span>
                         </div>
                     </div>
                     <div className="flex gap-2">
                        {artist.links?.map((link, i) => (
                            <a href={link.url} key={i} target="_blank" rel="noopener noreferrer" className="btn btn-circle btn-ghost bg-white/5">
                                <Globe size={20}/>
                            </a>
                        ))}
                         <button className="btn btn-primary btn-circle btn-lg text-white shadow-xl hover:scale-105 transition-transform" onClick={handlePlay}>
                             <Play fill="currentColor" size={28}/>
                         </button>
                     </div>
                </div>
             </div>

             {/* Posts / News */}
             {posts.length > 0 && (
                <section>
                    <div className="flex items-center gap-2 mb-6 opacity-80 border-b border-white/5 pb-2">
                        <Globe size={20}/>
                        <h2 className="text-xl font-bold">Latest News</h2>
                    </div>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {posts.map(post => (
                            <div key={post.id} className="card bg-base-200 border border-white/5 p-6 space-y-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="avatar placeholder">
                                        <div className="bg-neutral text-neutral-content rounded-full w-8">
                                            <span>{artist?.name[0]}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="font-bold text-sm">{artist?.name}</div>
                                        <div className="text-xs opacity-50">{new Date(post.createdAt).toLocaleDateString()}</div>
                                    </div>
                                </div>
                                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: post.content }} />
                            </div>
                        ))}
                    </div>
                </section>
             )}

             {/* Discography */}
             <section>
                <div className="flex items-center gap-2 mb-6 opacity-80 border-b border-white/5 pb-2">
                    <Disc/>
                    <h2 className="text-xl font-bold">Discography</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {albums.map(album => (
                        <Link to={`/albums/${album.id}`} key={album.id} className="group">
                             <figure className="aspect-square relative overflow-hidden rounded-lg shadow-lg mb-3">
                                {album.coverImage ? (
                                    <img 
                                        src={API.getAlbumCoverUrl(album.id)} 
                                        alt={album.title} 
                                        className="object-cover w-full h-full group-hover:scale-105 transition-transform" 
                                    />
                                ) : (
                                    <div className="w-full h-full bg-neutral flex items-center justify-center opacity-30"><Disc size={32}/></div>
                                )}
                            </figure>
                            <h3 className="font-bold truncate group-hover:text-primary transition-colors">{album.title}</h3>
                            <p className="text-xs opacity-50">{album.year} • {album.type}</p>
                        </Link>
                    ))}
                </div>
             </section>
        </div>
    );
};
