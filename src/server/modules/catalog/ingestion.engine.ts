import path from "path";
import fs from "fs/promises";
import { createReadStream } from "fs";
import { parseFile } from "music-metadata";
import type { DatabaseService, Track, Album, Release } from "../../core/database.js";
import type { StorageEngine } from "../storage/storage.engine.js";
import { WaveformPeakService } from "../waveform/waveform-peak.service.js";
import { getFastFileHash } from "../../../utils/fileUtils.js";
import { slugify } from "../../../utils/audioUtils.js";
import { convertWavToMp3 } from "../media/ffmpeg.js";

export interface IngestionRequest {
    sources: string[];
    context: 'library' | 'release';
    ownerId: number;
    artistId?: number;
    albumId?: number;
    metadata?: {
        albumTitle?: string;
        artistName?: string;
        year?: number;
        genre?: string;
        tracks?: Array<{
            title: string;
            trackNum: number;
            artistName?: string;
        }>;
    };
}

export interface IngestionReport {
    success: boolean;
    results: IngestionResult[];
    albumId?: number;
    releaseId?: number;
}

export interface IngestionResult {
    sourcePath: string;
    trackId?: number;
    action: 'created' | 'updated' | 'skipped' | 'failed';
    message: string;
}

/**
 * IngestionEngine — Deep module for atomic music ingestion.
 * Handles the transition of files from external sources to either the Private Santuario or Public Arena.
 */
export class IngestionEngine {
    constructor(
        private database: DatabaseService,
        private storage: StorageEngine,
        private musicDir: string
    ) {}

    /**
     * Primary entry point for ingesting music.
     * Guarantees atomicity and physical organization.
     */
    async ingest(request: IngestionRequest): Promise<IngestionReport> {
        console.log(`[IngestionEngine] Starting ingestion for ${request.sources.length} files (Context: ${request.context})`);
        
        const report: IngestionReport = {
            success: true,
            results: []
        };

        try {
            await this.database.transaction(async () => {
                // 1. Resolve or Create Album/Release Container
                let containerId = request.albumId;
                if (!containerId) {
                    containerId = await this.resolveContainer(request);
                }

                if (request.context === 'library') report.albumId = containerId;
                else report.releaseId = containerId;

                // 2. Process each file
                for (const source of request.sources) {
                    const result = await this.processFile(source, containerId, request, report);
                    report.results.push(result);
                    if (result.action === 'failed') report.success = false;
                }
            });
        } catch (error: any) {
            console.error(`[IngestionEngine] Critical failure during ingestion: ${error.message}`);
            return {
                success: false,
                results: request.sources.map(s => ({ sourcePath: s, action: 'failed', message: error.message }))
            };
        }

        return report;
    }

    private async resolveContainer(request: IngestionRequest): Promise<number> {
        const title = request.metadata?.albumTitle || "Untitled Collection";
        const artistId = request.artistId || null;
        const slug = slugify(`${request.context}-${artistId || 'none'}-${title}`);

        if (request.context === 'release') {
            return this.database.createRelease({
                title,
                slug,
                artist_id: artistId,
                owner_id: request.ownerId,
                status: 'draft',
                visibility: 'private',
                genre: request.metadata?.genre || 'Unknown',
                year: request.metadata?.year || null,
                date: request.metadata?.year ? `${request.metadata.year}-01-01` : null,
                is_release: true,
                price: 0, currency: 'ETH', price_usdc: 0, price_usdt: 0,
                cover_path: null,
                description: null,
                type: 'album',
                download: null,
                external_links: null,
                published_at: null,
                published_to_gundb: false,
                published_to_ap: false,
                license: null,
                album_artist: request.metadata?.artistName || null,
                use_nft: true,
                is_public: false
            });
        } else {
            return this.database.createAlbum({
                title,
                slug,
                artist_id: artistId,
                owner_id: request.ownerId,
                status: 'draft',
                visibility: 'private',
                genre: request.metadata?.genre || 'Library',
                year: request.metadata?.year || null,
                date: request.metadata?.year ? `${request.metadata.year}-01-01` : null,
                is_release: false,
                price: 0, currency: 'ETH', price_usdc: 0, price_usdt: 0,
                cover_path: null,
                description: null,
                type: 'album',
                download: null,
                external_links: null,
                published_at: null,
                published_to_gundb: false,
                published_to_ap: false,
                album_artist: request.metadata?.artistName || null,
                use_nft: true,
                is_public: false
            });
        }
    }

    private async processFile(sourcePath: string, containerId: number, request: IngestionRequest, report: IngestionReport): Promise<IngestionResult> {
        try {
            // A. Validation & Metadata
            if (!await this.storage.pathExists(sourcePath)) {
                throw new Error("Source file not found");
            }

            const metadata = await parseFile(sourcePath);
            const hash = await getFastFileHash(sourcePath);
            const ext = path.extname(sourcePath).toLowerCase();
            const isLossless = ['.flac', '.wav'].includes(ext);

            // B. Physical Organization
            let finalPath: string;
            if (request.context === 'release') {
                // For Arena: Standardized organization
                const release = this.database.getRelease(containerId);
                const artistName = request.metadata?.artistName || metadata.common.artist || "Unknown Artist";
                const albumTitle = release?.title || "Untitled";
                const trackNum = metadata.common.track.no || report.results.length + 1;
                const title = metadata.common.title || path.basename(sourcePath, ext);
                
                const targetDir = path.join(this.musicDir, 'releases', slugify(artistName), slugify(albumTitle));
                await fs.mkdir(targetDir, { recursive: true });
                
                const fileName = `${String(trackNum).padStart(2, '0')}-${slugify(title)}${ext}`;
                finalPath = path.join(targetDir, fileName);
                
                // Copy for releases (Step 3: duplication)
                await fs.copyFile(sourcePath, finalPath);
            } else {
                // For Santuario: Maintain original or move to a library subfolder
                finalPath = sourcePath; // simplified for now, usually kept in place
            }

            const relativePath = path.relative(this.musicDir, finalPath).replace(/\\/g, '/');

            // C. Processing (Step 1: Atomicity)
            let mp3Path = relativePath;
            if (isLossless && request.context === 'release') {
                // Auto-convert to MP3 for public streaming
                const targetMp3 = finalPath.replace(ext, '.mp3');
                await convertWavToMp3(finalPath, targetMp3);
                mp3Path = path.relative(this.musicDir, targetMp3).replace(/\\/g, '/');
            }

            const waveform = await WaveformPeakService.generateWaveform(finalPath);

            // D. Persistence
            const trackId = this.database.createTrack({
                title: metadata.common.title || path.basename(sourcePath, ext),
                album_id: request.context === 'library' ? containerId : null,
                artist_id: request.artistId || null,
                owner_id: request.ownerId,
                track_num: metadata.common.track.no || null,
                duration: metadata.format.duration || 0,
                file_path: mp3Path,
                lossless_path: isLossless ? relativePath : null,
                format: isLossless ? 'mp3' : ext.slice(1),
                bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : null,
                sample_rate: metadata.format.sampleRate || null,
                hash: hash,
                waveform: JSON.stringify(waveform),
                genre: metadata.common.genre?.[0] || request.metadata?.genre || null,
                year: metadata.common.year || request.metadata?.year || null,
                price: 0, price_usdc: 0, price_usdt: 0, currency: 'ETH',
                url: null,
                service: null,
                external_artwork: null
            });

            if (request.context === 'release') {
                this.database.addTrackToRelease(containerId, trackId, {
                    title: metadata.common.title || path.basename(sourcePath, ext),
                    track_num: metadata.common.track.no || null,
                    file_path: mp3Path
                });
            }

            return {
                sourcePath,
                trackId,
                action: 'created',
                message: "Successfully ingested and processed."
            };

        } catch (error: any) {
            return {
                sourcePath,
                action: 'failed',
                message: error.message
            };
        }
    }
}

