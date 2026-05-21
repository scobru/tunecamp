import { Wrench, Download, Tags, FileAudio, ExternalLink } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';

const Tools = () => {
    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <PageHeader 
                title="Audio Tools" 
                subtitle="Useful resources to build your library"
                icon={Wrench}
                iconColor="text-primary"
            />

            <div className="max-w-4xl mx-auto space-y-8 mt-8">
                
                {/* Audio Downloaders */}
                <section>
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                        <Download className="text-secondary" /> Downloaders & Rippers
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <a href="https://github.com/yt-dlp/yt-dlp" target="_blank" rel="noreferrer" className="card bg-base-200 border border-base-content/5 hover:border-primary/30 transition-all hover:-translate-y-1">
                            <div className="card-body p-6">
                                <h3 className="card-title text-lg mb-1 flex justify-between">yt-dlp <ExternalLink size={16} className="opacity-50" /></h3>
                                <p className="text-sm opacity-70">The ultimate command-line audio/video downloader. Supports thousands of sites.</p>
                            </div>
                        </a>
                        <a href="https://doubledouble.top/" target="_blank" rel="noreferrer" className="card bg-base-200 border border-base-content/5 hover:border-primary/30 transition-all hover:-translate-y-1">
                            <div className="card-body p-6">
                                <h3 className="card-title text-lg mb-1 flex justify-between">DoubleDouble <ExternalLink size={16} className="opacity-50" /></h3>
                                <p className="text-sm opacity-70">Web-based music downloader. Supports Spotify, Tidal, Qobuz, Apple Music.</p>
                            </div>
                        </a>
                        <a href="https://lucida.to/" target="_blank" rel="noreferrer" className="card bg-base-200 border border-base-content/5 hover:border-primary/30 transition-all hover:-translate-y-1">
                            <div className="card-body p-6">
                                <h3 className="card-title text-lg mb-1 flex justify-between">Lucida <ExternalLink size={16} className="opacity-50" /></h3>
                                <p className="text-sm opacity-70">Advanced streaming platform downloader offering high-quality FLAC and MP3 rips.</p>
                            </div>
                        </a>
                    </div>
                </section>

                {/* Metadata & Tagging */}
                <section>
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 mt-8">
                        <Tags className="text-secondary" /> Metadata & Tagging
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <a href="https://picard.musicbrainz.org/" target="_blank" rel="noreferrer" className="card bg-base-200 border border-base-content/5 hover:border-primary/30 transition-all hover:-translate-y-1">
                            <div className="card-body p-6">
                                <h3 className="card-title text-lg mb-1 flex justify-between">MusicBrainz Picard <ExternalLink size={16} className="opacity-50" /></h3>
                                <p className="text-sm opacity-70">Official tagger using acoustic fingerprinting to identify and tag your audio files perfectly.</p>
                            </div>
                        </a>
                        <a href="https://www.mp3tag.de/en/" target="_blank" rel="noreferrer" className="card bg-base-200 border border-base-content/5 hover:border-primary/30 transition-all hover:-translate-y-1">
                            <div className="card-body p-6">
                                <h3 className="card-title text-lg mb-1 flex justify-between">Mp3tag <ExternalLink size={16} className="opacity-50" /></h3>
                                <p className="text-sm opacity-70">Powerful and easy-to-use tool to edit metadata of audio files. Excellent batch editing.</p>
                            </div>
                        </a>
                        <a href="https://beets.io/" target="_blank" rel="noreferrer" className="card bg-base-200 border border-base-content/5 hover:border-primary/30 transition-all hover:-translate-y-1">
                            <div className="card-body p-6">
                                <h3 className="card-title text-lg mb-1 flex justify-between">Beets <ExternalLink size={16} className="opacity-50" /></h3>
                                <p className="text-sm opacity-70">CLI-based media library management system for obsessive-compulsive music geeks.</p>
                            </div>
                        </a>
                    </div>
                </section>

                {/* FMHY */}
                <section>
                    <div className="card bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 mt-12">
                        <div className="card-body flex-row items-center justify-between gap-6">
                            <div>
                                <h3 className="card-title text-xl mb-2 flex items-center gap-2"><FileAudio /> Need more tools?</h3>
                                <p className="opacity-80">Check out the massive FMHY (Free Media Heck Yeah) directory for an exhaustive list of audio tools, trackers, and resources.</p>
                            </div>
                            <a href="https://fmhy.net/audio#audio-tools" target="_blank" rel="noreferrer" className="btn btn-primary shrink-0">
                                View FMHY Audio Wiki
                            </a>
                        </div>
                    </div>
                </section>

            </div>
        </div>
    );
};

export default Tools;
