import { useEffect, useState } from 'react';
import API from '../services/api';
import { Heart, Github, Coffee, DollarSign, ExternalLink } from 'lucide-react';

export const Support = () => {
    const [donationLinks, setDonationLinks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadSupportInfo = async () => {
             setLoading(true);
             try {
                 // Try site settings first
                 const settings = await API.getSiteSettings();
                 let links = settings.donationLinks || [];

                 // If no site links, try first artist (legacy behavior fallback)
                 if (!links || links.length === 0) {
                     const artists = await API.getArtists();
                     if (artists.length > 0) {
                         // Parse first artist links
                         const artist = artists[0];
                         // @ts-ignore
                         const rawLinks = typeof artist.links === 'string' ? JSON.parse(artist.links) : artist.links;
                         // @ts-ignore
                         const artistDonationLinks = artist.donationLinks;

                         if (artistDonationLinks && artistDonationLinks.length > 0) {
                            links = artistDonationLinks;
                         } else if (Array.isArray(rawLinks)) {
                             // Detect support links
                             links = rawLinks.filter((l: any) => {
                                 const label = (l.label || l.platform || '').toLowerCase();
                                 const url = (l.url || '').toLowerCase();
                                 return label.includes('patreon') || label.includes('ko-fi') || label.includes('paypal') || label.includes('donate') || url.includes('patreon') || url.includes('ko-fi');
                             }).map((l: any) => ({
                                 platform: l.label || l.platform,
                                 url: l.url,
                                 type: 'support',
                                 description: 'Support via ' + (l.label || l.platform)
                             }));
                         }
                     }
                 }
                 setDonationLinks(links);
             } catch (e) {
                 console.error('Failed to load support info', e);
             } finally {
                 setLoading(false);
             }
        };

        loadSupportInfo();
    }, []);

    const getIcon = (platform: string = '') => {
        const p = platform.toLowerCase();
        if (p.includes('github')) return <Github size={20} />;
        if (p.includes('coffee') || p.includes('ko-fi')) return <Coffee size={20} />;
        if (p.includes('paypal') || p.includes('patreon')) return <DollarSign size={20} />;
        return <ExternalLink size={20} />;
    };

    return (
        <div className="p-4 lg:p-8 animate-fade-in max-w-5xl mx-auto">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold mb-4 flex items-center justify-center gap-3">
                    <Heart className="text-primary fill-primary/20" size={40} /> Support
                </h1>
                <p className="text-xl opacity-60">Support the artists and the platform.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Artist Support */}
                <div className="card bg-base-200 border border-white/5 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1">
                    <div className="card-body items-center text-center">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
                            <DollarSign size={32} />
                        </div>
                        <h2 className="card-title text-2xl mb-2">Support the Artist</h2>
                        <p className="opacity-70 mb-8 max-w-sm">
                            Directly support the artists on this server. Your contribution helps them create more music.
                        </p>
                        
                        <div className="w-full space-y-3">
                            {loading ? (
                                <div className="loading loading-dots loading-lg opacity-50"></div>
                            ) : donationLinks.length > 0 ? (
                                donationLinks.map((link, i) => (
                                    <a 
                                        key={i} 
                                        href={link.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="btn btn-primary btn-block gap-3 text-lg h-14"
                                    >
                                        {getIcon(link.platform)}
                                        {link.description || link.platform}
                                    </a>
                                ))
                            ) : (
                                <div className="p-4 rounded-lg bg-base-300/50 border border-white/5 opacity-60 italic">
                                    No donation links currently configured.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* TuneCamp Support */}
                <div className="card bg-base-200 border border-white/5 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1">
                    <div className="card-body items-center text-center">
                        <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mb-4 text-secondary">
                            <Coffee size={32} />
                        </div>
                        <h2 className="card-title text-2xl mb-2">Support TuneCamp</h2>
                        <p className="opacity-70 mb-8 max-w-sm">
                            TuneCamp is an open-source project empowering independent musicians. Support the development.
                        </p>
                        
                        <div className="w-full space-y-3">
                             <a 
                                href="https://buymeacoffee.com/scobru" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="btn btn-outline btn-secondary btn-block gap-3 text-lg h-14"
                             >
                                <Coffee size={20} /> Buy us a coffee
                             </a>
                             <a 
                                href="https://github.com/scobru/tunecamp" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="btn btn-outline btn-block gap-3 text-lg h-14"
                             >
                                <Github size={20} /> GitHub Sponsors
                             </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Support;
