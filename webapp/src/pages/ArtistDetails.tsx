import { useState, useEffect } from 'react';
import API from '../services/api';
import { useParams, Link } from 'react-router-dom';
import { Play, Disc, Globe, Shield, Wallet, Copy, Twitter, Instagram, Youtube, Facebook, Github, Mail, Heart } from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useConfigStore } from '../stores/useConfigStore';
import { formatDuration } from '../utils/format';
import type { Artist, Album, Post, Track, Release } from '../types';

const PlatformIcon = ({ platform }: { platform: string }) => {
    const p = platform.toLowerCase();
    if (p.includes('twitter') || p.includes('x.com')) return <Twitter size={16} />;
    if (p.includes('instagram')) return <Instagram size={16} />;
    if (p.includes('youtube')) return <Youtube size={16} />;
    if (p.includes('facebook')) return <Facebook size={16} />;
    if (p.includes('github')) return <Github size={16} />;
    if (p.includes('mail')) return <Mail size={16} />;
    return <Globe size={16} />;
};

const ArtistDetails = () => {
    const { idOrSlug } = useParams();
    const { cacheBuster } = useConfigStore();
    const [artist, setArtist] = useState<Artist | null>(null);
    const [formalReleases, setFormalReleases] = useState<Release[]>([]);
    const [libraryAlbums, setLibraryAlbums] = useState<Album[]>([]);
    const [looseTracks, setLooseTracks] = useState<Track[]>([]);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const { playTrack } = usePlayerStore();
    const { isAdminAuthenticated } = useAuthStore();
    const [starred, setStarred] = useState(false);

    const loadData = () => {
        if (!idOrSlug) return;
        setLoading(true);
        Promise.all([
            API.getArtist(idOrSlug),
            API.getArtistPosts(idOrSlug)
        ]).then(([artistData, artistPosts]) => {
            setArtist(artistData);
            setStarred(!!artistData.starred);
            
            // Map formal releases
            if (artistData.releases) {
                setFormalReleases(artistData.releases);
            } else if (artistData.albums) {
                const formal = artistData.albums.filter(a => a.is_formal_release || a.is_release);
                setFormalReleases(formal as any); // Release and Album are slightly different but close enough for these lists
            }

            // Map library albums (extra items)
            if (artistData.albums) {
                const library = artistData.albums.filter(a => !a.is_formal_release && !a.is_release);
                setLibraryAlbums(library);
            }

            if (artistData.tracks) {
                setLooseTracks(artistData.tracks);
            }
            setPosts(artistPosts);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadData();
    }, [idOrSlug]);

    if (loading) return <div className="p-12 text-center opacity-50">Loading artist...</div>;
    if (!artist) return <div className="p-12 text-center opacity-50">Artist not found.</div>;

    const handlePlay = () => {
        const albumsToUse = formalReleases.length > 0 ? formalReleases : libraryAlbums;
        if (albumsToUse.length > 0 && albumsToUse[0].tracks && albumsToUse[0].tracks.length > 0) {
            playTrack(albumsToUse[0].tracks[0], albumsToUse[0].tracks);
        } else if (looseTracks.length > 0) {
            playTrack(looseTracks[0], looseTracks);
        }
    };



    const handleToggleStar = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!artist) return;
        
        const oldStarred = starred;
        setStarred(!oldStarred);
        
        try {
            if (oldStarred) {
                await API.unstarArtist(artist.id);
            } else {
                await API.starArtist(artist.id);
            }
        } catch (err) {
            setStarred(oldStarred);
            console.error("Failed to toggle star:", err);
        }
    };

    return (
        <div className="space-y-12 animate-fade-in">
             {/* Header */}
             <div className="relative h-80 rounded-2xl overflow-hidden flex items-end p-8 border border-base-content/5">
                 <div className="absolute inset-0 z-0">
                     {artist.coverImage ? (
                        <img src={API.getArtistCoverUrl(artist.id, cacheBuster)} className="w-full h-full object-cover opacity-30 blur-sm scale-105" />
                     ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20"/>
                     )}
                     <div className="absolute inset-0 bg-gradient-to-t from-base-100 via-base-100/50 to-transparent"></div>
                </div>

                <div className="relative z-10 flex gap-6 items-end w-full">
                     <figure className="w-40 h-40 rounded-full shadow-2xl border-4 border-base-100 overflow-hidden shrink-0">
                         {artist.coverImage ? (
                             <img src={API.getArtistCoverUrl(artist.id, cacheBuster)} className="w-full h-full object-cover"/>
                         ) : (
                             <div className="w-full h-full bg-neutral flex items-center justify-center text-4xl">{artist.name[0]}</div>
                         )}
                     </figure>
                     <div className="flex-1 space-y-2">
                         <h1 className="text-5xl md:text-7xl font-black tracking-tight text-prominent">{artist.name}</h1>
                         {artist.bio && (
                             <p className="text-lg opacity-80 max-w-2xl line-clamp-2" title={artist.bio}>{artist.bio}</p>
                         )}
                          <div className="flex items-center gap-4 text-sm font-bold opacity-70">
                             <span>
                                 {formalReleases.length > 0 ? (
                                     `${formalReleases.length} ${formalReleases.length === 1 ? 'Release' : 'Releases'}`
                                 ) : (
                                     (isAdminAuthenticated || libraryAlbums.length > 0 || looseTracks.length > 0) ? 'Library Artist' : '0 Releases'
                                 )}
                                 {(isAdminAuthenticated || libraryAlbums.length + looseTracks.length > 0) && (
                                     <span className="opacity-60 ml-1"> 
                                         ({formalReleases.length > 0 ? '+' : ''}{libraryAlbums.length + looseTracks.length} Library Items)
                                     </span>
                                 )}
                             </span>
                             {isAdminAuthenticated && formalReleases.length === 0 && libraryAlbums.length === 0 && looseTracks.length === 0 && (
                                 <span className="badge badge-warning badge-sm gap-1 py-3 px-3 mr-2">
                                     <Shield size={12}/> Empty Profile
                                 </span>
                             )}

                          </div>
                     </div>
                      <div className="flex flex-col gap-4 mt-6">
                          {artist.walletAddress && (
                              <div className="flex items-center gap-2 self-start text-xs font-mono bg-emerald-500/10 text-emerald-400 px-4 py-2 rounded-xl border border-emerald-500/20 backdrop-blur-sm">
                                  <Wallet size={14} />
                                  <span title={artist.walletAddress}>
                                      {artist.walletAddress.substring(0, 6)}...{artist.walletAddress.substring(artist.walletAddress.length - 4)}
                                  </span>
                                  <button 
                                      className="btn btn-xs btn-ghost btn-circle text-emerald-400 hover:bg-emerald-500/20" 
                                      onClick={() => {
                                          navigator.clipboard.writeText(artist.walletAddress || '');
                                          alert('Wallet address copied!');
                                      }}
                                      title="Copy Wallet"
                                  >
                                      <Copy size={12} />
                                  </button>
                              </div>
                          )}

                          <div className="flex gap-4 items-center flex-wrap">
                              <div className="flex gap-2 flex-wrap flex-1">
                                 {artist.links?.map((link, i) => (
                                     <a href={link.url} key={i} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline gap-2 bg-base-content/5 border-base-content/10 hover:bg-base-content/10 text-base-content rounded-xl">
                                         <PlatformIcon platform={link.platform || link.url} />
                                         <span className="capitalize">{link.platform || 'Link'}</span>
                                     </a>
                                 ))}
                              </div>
                              <button className="btn btn-primary btn-circle btn-lg text-white shadow-xl hover:scale-105 transition-transform shrink-0" onClick={handlePlay}>
                                  <Play fill="currentColor" size={28}/>
                              </button>
                              <button 
                                  className={`btn btn-circle btn-lg shadow-xl hover:scale-105 transition-transform shrink-0 ${starred ? 'btn-error text-white' : 'btn-outline border-base-content/20'}`} 
                                  onClick={handleToggleStar}
                              >
                                  <Heart fill={starred ? "currentColor" : "none"} size={28}/>
                              </button>
                          </div>
                      </div>
                </div>
             </div>

             {/* Posts / News */}
             {posts.length > 0 && (
                <section>
                    <div className="flex items-center gap-2 mb-6 opacity-80 border-b border-base-content/5 pb-2">
                        <Globe size={20}/>
                        <h2 className="text-xl font-bold">Latest News</h2>
                    </div>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {posts.map(post => (
                            <div key={post.id} className="card bg-base-200 border border-base-content/5 p-6 space-y-4 relative group">
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="avatar placeholder">
                                            <div className="bg-neutral text-neutral-content rounded-full w-8">
                                                <span>{artist?.name[0]}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm flex items-center gap-2">
                                                {artist?.name}
                                                {post.visibility === 'private' && <Shield size={12} className="text-warning"/>}
                                            </div>
                                            <div className="text-xs opacity-50">{new Date(post.createdAt).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                    
                                </div>
                                {post.title && (
                                    <h3 className="font-extrabold text-lg leading-snug tracking-tight text-prominent mb-1">
                                        {post.title}
                                    </h3>
                                )}
                                {post.summary && (
                                    <p className="text-xs italic opacity-70 leading-relaxed mb-2 font-serif border-l-2 border-primary/30 pl-2">
                                        {post.summary}
                                    </p>
                                )}
                                <div className="prose prose-sm max-w-none opacity-90" dangerouslySetInnerHTML={{ __html: post.content }} />
                            </div>
                        ))}
                    </div>
                </section>
             )}

              {/* Discography / Releases */}
             {formalReleases.length > 0 && (
                <section>
                    <div className="flex items-center gap-2 mb-6 opacity-80 border-b border-base-content/5 pb-2">
                        <Disc />
                        <h2 className="text-xl font-bold">Discography</h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        {formalReleases.map(album => (
                            <Link to={`/releases/${album.slug || album.id}`} key={album.id} className="group">
                                <figure className="aspect-square relative overflow-hidden rounded-lg shadow-lg mb-3">
                                    <img 
                                        src={API.getReleaseCoverUrl(album.id, cacheBuster)} 
                                        alt={album.title} 
                                        className="absolute inset-0 object-cover w-full h-full group-hover:scale-105 transition-transform" 
                                        onError={(e) => {
                                           const target = e.target as HTMLImageElement;
                                           target.style.display = 'none';
                                           if (target.nextElementSibling) {
                                              (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                           }
                                        }}
                                    />
                                    <div className="hidden absolute inset-0 bg-neutral w-full h-full items-center justify-center opacity-30">
                                        <Disc size={32} />
                                    </div>
                                </figure>
                                <h3 className="font-bold truncate group-hover:text-primary transition-colors">{album.title}</h3>
                                <p className="text-xs opacity-50">{album.year} • {album.type}</p>
                            </Link>
                        ))}
                    </div>
                </section>
             )}

              {/* Library Additions */}
              {libraryAlbums.length > 0 && (
                 <section>
                     <div className="flex items-center gap-2 mb-6 opacity-80 border-b border-base-content/5 pb-2">
                         <Disc />
                         <h2 className="text-xl font-bold">{isAdminAuthenticated ? 'Library Additions' : 'Other Albums'}</h2>
                     </div>
                     <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                         {libraryAlbums.map(album => (
                             <Link to={`/albums/${album.slug || album.id}`} key={album.id} className="group">
                                 <figure className="aspect-square relative overflow-hidden rounded-lg shadow-lg mb-3">
                                     <img 
                                         src={API.getAlbumCoverUrl(album.id, cacheBuster)} 
                                         alt={album.title} 
                                         className="absolute inset-0 object-cover w-full h-full group-hover:scale-105 transition-transform" 
                                         onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = 'none';
                                            if (target.nextElementSibling) {
                                               (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                            }
                                         }}
                                     />
                                     <div className="hidden absolute inset-0 bg-neutral w-full h-full items-center justify-center opacity-30">
                                         <Disc size={32} />
                                     </div>
                                 </figure>
                                 <h3 className="font-bold truncate group-hover:text-primary transition-colors">{album.title}</h3>
                                 <p className="text-xs opacity-50">{album.year} • {album.type}</p>
                             </Link>
                         ))}
                     </div>
                 </section>
              )}
 
              {/* Loose Tracks */}
              {looseTracks.length > 0 && (
                 <section>
                     <div className="flex items-center gap-2 mb-6 opacity-80 border-b border-base-content/5 pb-2">
                         <Play size={20} />
                         <h2 className="text-xl font-bold">{isAdminAuthenticated ? 'Singles & Orphaned Tracks' : 'Singles'}</h2>
                     </div>
                     <div className="overflow-x-auto bg-base-200/30 rounded-2xl border border-base-content/5">
                         <table className="table w-full">
                             <thead>
                                 <tr className="border-b border-base-content/10 opacity-50 text-xs uppercase tracking-wider">
                                     <th className="w-12 text-center">#</th>
                                     <th>Title</th>
                                     <th className="text-right">Duration</th>
                                 </tr>
                             </thead>
                             <tbody>
                                 {looseTracks.map((track, i) => (
                                     <tr key={track.id} className="hover:bg-base-content/5 group border-b border-base-content/5 last:border-0 transition-colors cursor-pointer" onClick={() => playTrack(track, looseTracks)}>
                                         <td className="text-center font-mono w-12 relative">
                                             <span className="opacity-40 group-hover:opacity-0 transition-opacity absolute inset-0 flex items-center justify-center">
                                                 {i + 1}
                                             </span>
                                             <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 flex items-center justify-center text-primary">
                                                 <Play size={14} fill="currentColor" />
                                             </div>
                                         </td>
                                         <td>
                                             <div className="font-bold">{track.title}</div>
                                             <div className="text-xs opacity-40">{track.artistName}</div>
                                         </td>
                                         <td className="text-right opacity-40 font-mono text-xs">
                                             {formatDuration(track.duration)}
                                         </td>
                                     </tr>
                                 ))}
                             </tbody>
                         </table>
                     </div>
                 </section>
              )}
        </div>
    );
};




export default ArtistDetails;

