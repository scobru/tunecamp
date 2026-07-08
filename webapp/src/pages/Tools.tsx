import { Wrench, Tags, RefreshCw, Activity, Mic, SlidersHorizontal, FileText, Library, ExternalLink, FileAudio, type LucideIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';

interface Tool {
    name: string;
    url: string;
    description: string;
}

interface ToolSection {
    title: string;
    icon: LucideIcon;
    blurb: string;
    tools: Tool[];
}

const sections: ToolSection[] = [
    {
        title: 'Tagging & Library Management',
        icon: Tags,
        blurb: 'TuneCamp reads your files\' metadata on import — clean tags mean clean releases, artists and artwork.',
        tools: [
            {
                name: 'MusicBrainz Picard',
                url: 'https://picard.musicbrainz.org/',
                description: 'Official MusicBrainz tagger. Identifies files via acoustic fingerprinting and fills in accurate tags and cover art.',
            },
            {
                name: 'Mp3tag',
                url: 'https://www.mp3tag.de/en/',
                description: 'Powerful, easy batch tag editor. Great for fixing whole albums at once before uploading them.',
            },
            {
                name: 'Kid3',
                url: 'https://kid3.kde.org/',
                description: 'Cross-platform tag editor covering ID3, Vorbis, FLAC and more. Solid free alternative on Linux and macOS.',
            },
            {
                name: 'Beets',
                url: 'https://beets.io/',
                description: 'CLI library manager that auto-corrects tags against MusicBrainz. Ideal for cleaning large collections in bulk.',
            },
        ],
    },
    {
        title: 'Convert & Prepare Files',
        icon: RefreshCw,
        blurb: 'Get your audio into the right format — lossless FLAC for releases, MP3 for quick previews.',
        tools: [
            {
                name: 'fre:ac',
                url: 'https://www.freac.org/',
                description: 'Free, open-source audio converter and CD ripper. Converts between FLAC, MP3, Opus, AAC and more, tags included.',
            },
            {
                name: 'FFmpeg',
                url: 'https://ffmpeg.org/',
                description: 'The command-line Swiss Army knife for audio. Convert, resample, trim or normalize anything, scriptable in batch.',
            },
            {
                name: 'CUETools',
                url: 'http://cue.tools/wiki/CUETools',
                description: 'Splits single-file album rips (CUE + FLAC) into properly tagged individual tracks — perfect before importing.',
            },
        ],
    },
    {
        title: 'Quality Check & Analysis',
        icon: Activity,
        blurb: 'Verify that what you upload (or collect) is genuine lossless, and learn the key and BPM of any track.',
        tools: [
            {
                name: 'Spek',
                url: 'https://www.spek.cc/',
                description: 'Acoustic spectrum analyzer. Instantly spots fake FLACs — lossy files re-encoded as lossless — from the spectrogram.',
            },
            {
                name: 'Sonic Visualiser',
                url: 'https://www.sonicvisualiser.org/',
                description: 'In-depth waveform and spectrogram analysis with annotations. For when you want to study a recording closely.',
            },
            {
                name: 'Tunebat',
                url: 'https://tunebat.com/',
                description: 'Online database and analyzer for musical key and BPM — handy for DJs, remixers and playlist curators.',
            },
        ],
    },
    {
        title: 'Record & Edit',
        icon: Mic,
        blurb: 'Capture and polish your audio before it becomes a release.',
        tools: [
            {
                name: 'Audacity',
                url: 'https://www.audacityteam.org/',
                description: 'The classic free multi-track recorder and editor. Trim, fade, denoise and export in any format.',
            },
            {
                name: 'ocenaudio',
                url: 'https://www.ocenaudio.com/',
                description: 'Lightweight, modern audio editor with real-time effect preview. Faster than a DAW for quick fixes.',
            },
        ],
    },
    {
        title: 'Produce',
        icon: SlidersHorizontal,
        blurb: 'Free and fair-priced tools to write, arrange and mix your next release.',
        tools: [
            {
                name: 'REAPER',
                url: 'https://www.reaper.fm/',
                description: 'Full professional DAW with an unlimited evaluation and a very affordable license. Tiny, fast, endlessly customizable.',
            },
            {
                name: 'LMMS',
                url: 'https://lmms.io/',
                description: 'Free, open-source DAW for beat making and synthesis. A complete studio at zero cost.',
            },
            {
                name: 'Waveform Free',
                url: 'https://www.tracktion.com/products/waveform-free',
                description: 'Genuinely free, unrestricted DAW from Tracktion — unlimited tracks and plugin support.',
            },
            {
                name: 'Vital',
                url: 'https://vital.audio/',
                description: 'Stunning spectral wavetable synthesizer with a free tier. One of the best soft synths available, at any price.',
            },
        ],
    },
    {
        title: 'Lyrics & Synced Lyrics',
        icon: FileText,
        blurb: 'Add lyrics to your tracks — TuneCamp displays them alongside your music.',
        tools: [
            {
                name: 'LRCLIB',
                url: 'https://lrclib.net/',
                description: 'Open, community-driven database of plain and time-synced lyrics. Search, download and contribute .lrc files.',
            },
            {
                name: 'LRCGET',
                url: 'https://github.com/tranxuanthang/lrcget',
                description: 'Desktop app that mass-downloads synced lyrics from LRCLIB for your whole library.',
            },
            {
                name: 'LRC Maker',
                url: 'https://lrc-maker.github.io/',
                description: 'Browser tool to write your own time-synced lyrics: play the track, tap along, export the .lrc.',
            },
        ],
    },
    {
        title: 'Royalty-Free Sounds & Samples',
        icon: Library,
        blurb: 'Legal source material for your productions — field recordings, effects and vintage samples.',
        tools: [
            {
                name: 'Freesound',
                url: 'https://freesound.org/',
                description: 'Huge collaborative archive of Creative Commons sounds and field recordings.',
            },
            {
                name: 'BBC Sound Effects',
                url: 'https://sound-effects.bbcrewind.co.uk/',
                description: '33,000+ professional effects from the BBC archives, free for personal and educational use.',
            },
            {
                name: 'Citizen DJ',
                url: 'https://citizen-dj.labs.loc.gov/',
                description: 'Library of Congress project for sampling public-domain audio — dig through history, legally.',
            },
        ],
    },
];

const Tools = () => {
    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <PageHeader
                title="Audio Tools"
                subtitle="A curated toolbox for artists and collectors"
                icon={Wrench}
                iconColor="text-primary"
            />

            <div className="max-w-4xl mx-auto space-y-10 mt-8">
                {sections.map((section) => (
                    <section key={section.title}>
                        <h2 className="text-2xl font-bold mb-1 flex items-center gap-2">
                            <section.icon className="text-secondary" /> {section.title}
                        </h2>
                        <p className="text-sm opacity-60 mb-4">{section.blurb}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {section.tools.map((tool) => (
                                <a
                                    key={tool.name}
                                    href={tool.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="card bg-base-200 border border-base-content/5 hover:border-primary/30 transition-all hover:-translate-y-1"
                                >
                                    <div className="card-body p-6">
                                        <h3 className="card-title text-lg mb-1 flex justify-between">
                                            {tool.name} <ExternalLink size={16} className="opacity-50" />
                                        </h3>
                                        <p className="text-sm opacity-70">{tool.description}</p>
                                    </div>
                                </a>
                            ))}
                        </div>
                    </section>
                ))}

                <section>
                    <div className="card bg-base-200/40 border border-primary/20 mt-12">
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
