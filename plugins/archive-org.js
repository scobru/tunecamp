import path from "path";
import fs from "fs-extra";
import axios from "axios";

function isAudioFile(filename, format) {
    const ext = path.extname(filename).toLowerCase();
    const audioExts = ['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.opus', '.wma', '.mp4', '.mp2', '.ape', '.aac', '.alac'];
    if (audioExts.includes(ext)) {
        return true;
    }
    const fmt = (format || '').toLowerCase();
    if (fmt.includes('mp3') || fmt.includes('flac') || fmt.includes('ogg') || fmt.includes('wav') || fmt.includes('wma') || fmt.includes('audio') || fmt.includes('vorbis') || fmt.includes('shn')) {
        return true;
    }
    return false;
}

function encodeFilename(filename) {
    return filename.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

export default class ArchiveOrgProvider {
    constructor() {
        this.id = "archive-org";
        this.name = "Internet Archive";
        this.version = "1.0.0";
        this.description = "Scarica audio libero da Archive.org.";
        
        this.configSchema = [
            {
                key: "archive_max_results",
                label: "Risultati Massimi",
                type: "text",
                placeholder: "10",
                required: false
            },
            {
                key: "archive_safe_search",
                label: "Safe Search (Filtra contenuti)",
                type: "boolean",
                required: false
            }
        ];
    }

    async init(ctx) {
        const getSetting = ctx?.getSetting || (() => undefined);
        this.maxResults = getSetting("archive_max_results") || "10";
        this.safeSearch = getSetting("archive_safe_search") === "true";
        console.log(`[ArchiveOrg] Initialized. maxResults: ${this.maxResults}, safeSearch: ${this.safeSearch}`);
    }

    async search(query) {
        try {
            const rows = parseInt(this.maxResults) || 10;
            const searchQuery = `(${query}) AND mediatype:audio`;
            const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(searchQuery)}&fl[]=identifier,title,creator,description&rows=${rows}&output=json`;

            console.log(`[ArchiveOrg] Searching Archive.org: ${searchQuery}`);
            const response = await axios.get(searchUrl);
            const docs = response.data?.response?.docs || [];

            const results = [];
            
            await Promise.all(docs.map(async (doc) => {
                try {
                    const filesUrl = `https://archive.org/metadata/${doc.identifier}/files`;
                    const filesResponse = await axios.get(filesUrl);
                    const files = filesResponse.data?.result || [];

                    for (const file of files) {
                        if (file.name && isAudioFile(file.name, file.format)) {
                            const sizeBytes = parseInt(file.size) || 0;
                            
                            let fileTitle = file.title || doc.title || file.name;
                            if (file.track) {
                                fileTitle = `${file.track.padStart(2, '0')}. ${fileTitle}`;
                            }

                            results.push({
                                id: `archive-org:${doc.identifier}:${file.name}`,
                                title: fileTitle,
                                artist: doc.creator || "Unknown Artist",
                                filename: file.name,
                                sizeBytes: sizeBytes,
                                bitrate: file.format?.includes('MP3') ? 192 : undefined,
                                source: this.id,
                                meta: {
                                    identifier: doc.identifier,
                                    filename: file.name,
                                    format: file.format,
                                    size: sizeBytes
                                }
                            });
                        }
                    }
                } catch (err) {
                    console.error(`[ArchiveOrg] Failed to fetch files for ${doc.identifier}:`, err.message);
                }
            }));

            return results;
        } catch (err) {
            console.error(`[ArchiveOrg] Search failed:`, err);
            return [];
        }
    }

    async download(result) {
        const { identifier, filename } = result.meta || {};
        if (!identifier || !filename) {
            throw new Error("Invalid result metadata: missing identifier or filename");
        }

        const musicDir = process.env.TUNECAMP_MUSIC_DIR || path.join(process.cwd(), "music");
        const downloadDir = process.env.TUNECAMP_DOWNLOAD_DIR || path.join(musicDir, "downloads");

        await fs.ensureDir(downloadDir);
        const destPath = path.join(downloadDir, filename);

        console.log(`[ArchiveOrg] Downloading ${filename} of item ${identifier}`);
        const url = `https://archive.org/download/${identifier}/${encodeFilename(filename)}`;
        
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(destPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log(`[ArchiveOrg] Download completed: ${destPath}`);
                resolve(destPath);
            });
            writer.on('error', (err) => {
                console.error(`[ArchiveOrg] Write error:`, err);
                reject(err);
            });
            response.data.on('error', (err) => {
                console.error(`[ArchiveOrg] Stream error:`, err);
                reject(err);
            });
        });
    }

    async isAvailable() {
        return true;
    }
}
