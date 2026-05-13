import fetch from "node-fetch";
import { TuneCampProvider, MetadataProvider, MetadataMatch, ArtistMetadata } from "../../core/provider.js";
import { USER_AGENT } from "../../modules/catalog/metadata.service.js";
import { drainResponse } from "../../common/network.js";

export class TheAudioDBProvider implements TuneCampProvider, MetadataProvider {
    id = "theaudiodb";
    name = "TheAudioDB";
    version = "1.0.0";
    description = "Artist biographies and photos from TheAudioDB";

    private apiKey = "2"; // Use free public key

    async searchRelease(query: string): Promise<MetadataMatch[]> {
        // TheAudioDB is better for artists/albums than individual releases, 
        // but we could implement if needed. For now focused on artists.
        return [];
    }

    async searchRecording(query: string): Promise<MetadataMatch[]> {
        return [];
    }

    async getCoverUrl(id: string): Promise<string | null> {
        return null;
    }

    async searchArtist(query: string): Promise<ArtistMetadata[]> {
        const url = `https://www.theaudiodb.com/api/v1/json/${this.apiKey}/search.php?s=${encodeURIComponent(query)}`;

        try {
            const response = await fetch(url, {
                headers: { "User-Agent": USER_AGENT }
            });

            if (!response.ok) {
                console.error(`TheAudioDB API error: ${response.status}`);
                await drainResponse(response);
                return [];
            }

            const data = await response.json() as any;
            const artists = (data.artists || []);

            return artists.map((a: any) => {
                const links: any[] = [];
                if (a.strWebsite) links.push({ platform: 'website', url: a.strWebsite.startsWith('http') ? a.strWebsite : `https://${a.strWebsite}`, type: 'music' });
                if (a.strFacebook) links.push({ platform: 'facebook', url: a.strFacebook.startsWith('http') ? a.strFacebook : `https://${a.strFacebook}`, type: 'social' });
                if (a.strTwitter) links.push({ platform: 'twitter', url: a.strTwitter.startsWith('http') ? a.strTwitter : `https://${a.strTwitter}`, type: 'social' });
                
                return {
                    id: a.idArtist,
                    name: a.strArtist,
                    bio: a.strBiographyEN,
                    bioIT: a.strBiographyIT,
                    avatarUrl: a.strArtistThumb || a.strArtistFanart,
                    links,
                    source: "theaudiodb"
                };
            });
        } catch (error) {
            console.error("Error searching TheAudioDB:", error);
            return [];
        }
    }
}
