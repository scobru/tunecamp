// plugins/demo-provider.js

// Mock list of copyright-free tracks from SoundHelix
const DEMO_TRACKS = [
    {
        id: "demo:song1",
        title: "SoundHelix Song 1",
        artist: "SoundHelix",
        album: "Helix Resonance",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        coverUrl: "https://images.unsplash.com/photo-1614680376593-902f74fa0d41?w=500",
        genre: "Electronic",
        year: 2021,
        date: "2021-01-01",
        description: "A fast-paced synthwave instrumental test track from SoundHelix.",
        duration: 372
    },
    {
        id: "demo:song2",
        title: "SoundHelix Song 2",
        artist: "SoundHelix",
        album: "Helix Resonance",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
        coverUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500",
        genre: "Electro-Rock",
        year: 2021,
        date: "2021-02-01",
        description: "A dynamic and upbeat instrumental test track from SoundHelix.",
        duration: 423
    },
    {
        id: "demo:song3",
        title: "SoundHelix Song 3",
        artist: "SoundHelix",
        album: "Helix Resonance",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
        coverUrl: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=500",
        genre: "Synthpop",
        year: 2021,
        date: "2021-03-01",
        description: "A melodic electronic synth pop instrumental test track from SoundHelix.",
        duration: 344
    }
];

export default class DemoProvider {
    id = "demo";
    name = "Demo Audio & Metadata Provider";
    version = "1.0.0";
    description = "Plugin dimostrativo per sviluppatori che fornisce tracce e metadati royalty-free.";

    async onEnable() {
        console.log("🔌 [DemoProvider] Plugin abilitato ed attivo!");
    }

    async onDisable() {
        console.log("🔌 [DemoProvider] Plugin disabilitato.");
    }

    // --- MetadataProvider Interface ---

    async searchRelease(query) {
        console.log(`[DemoProvider] Ricerca release per: "${query}"`);
        const lower = query.toLowerCase();
        if (lower.includes("demo") || lower.includes("soundhelix") || lower.includes("helix") || lower.includes("resonance")) {
            return [{
                id: "demo:album1",
                title: "Helix Resonance",
                artist: "SoundHelix",
                date: "2021-01-01",
                year: 2021,
                genre: "Electronic",
                coverUrl: "https://images.unsplash.com/photo-1614680376593-902f74fa0d41?w=500",
                description: "L'album dimostrativo ufficiale di SoundHelix.",
                source: "demo"
            }];
        }
        return [];
    }

    async searchRecording(query) {
        console.log(`[DemoProvider] Ricerca registrazione per: "${query}"`);
        const lower = query.toLowerCase();
        return DEMO_TRACKS.filter(t =>
            t.title.toLowerCase().includes(lower) ||
            t.artist.toLowerCase().includes(lower) ||
            t.album.toLowerCase().includes(lower)
        ).map(t => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            date: t.date,
            year: t.year,
            genre: t.genre,
            coverUrl: t.coverUrl,
            albumTitle: t.album,
            description: t.description,
            source: "demo"
        }));
    }

    async getCoverUrl(id) {
        if (id === "demo:album1") {
            return "https://images.unsplash.com/photo-1614680376593-902f74fa0d41?w=500";
        }
        const track = DEMO_TRACKS.find(t => t.id === id);
        return track ? track.coverUrl : null;
    }

    async searchArtist(query) {
        const lower = query.toLowerCase();
        if ("soundhelix".includes(lower)) {
            return [{
                id: "demo:artist1",
                name: "SoundHelix",
                bio: "SoundHelix è un progetto che genera musica strumentale elettronica casuale e ricca di sfumature.",
                avatarUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100",
                source: "demo"
            }];
        }
        return [];
    }

    // --- StreamingProvider Interface ---

    canHandle(sourceId) {
        const handle = typeof sourceId === "string" && sourceId.startsWith("demo:");
        console.log(`[DemoProvider] canHandle "${sourceId}"? -> ${handle}`);
        return handle;
    }

    async getStreamById(id) {
        console.log(`[DemoProvider] Ottenimento stream per ID: "${id}"`);
        const track = DEMO_TRACKS.find(t => t.id === id);
        return track ? track.url : null;
    }

    async getStreamUrl(trackTitle, artistName, albumTitle) {
        console.log(`[DemoProvider] Ottenimento stream per traccia: "${trackTitle}" di ${artistName}`);
        const lowerTitle = trackTitle.toLowerCase();
        const lowerArtist = artistName.toLowerCase();
        const track = DEMO_TRACKS.find(t =>
            t.title.toLowerCase().includes(lowerTitle) &&
            t.artist.toLowerCase().includes(lowerArtist)
        );
        return track ? track.url : null;
    }

    async search(query) {
        console.log(`[DemoProvider] Ricerca sorgenti di streaming per: "${query}"`);
        const lower = query.toLowerCase();
        return DEMO_TRACKS.filter(t =>
            t.title.toLowerCase().includes(lower) ||
            t.artist.toLowerCase().includes(lower)
        ).map(t => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            provider: "demo",
            thumbnail: t.coverUrl,
            duration: t.duration,
            meta: {
                album: t.album,
                description: t.description
            }
        }));
    }

    async isAvailable() {
        return true;
    }
}
