import type { DatabaseService, Track } from "../../database.js";
import { metadataService } from "./metadata.service.js";
import type { CatalogService } from "./catalog.service.ts";
import type { OpenRouterService } from "../ai/openrouter.service.ts";

export interface AuditResult {
    trackId: number;
    title: string;
    artist: string;
    status: 'verified' | 'repaired' | 'failed' | 'no_match';
    changes?: Record<string, { old: any, new: any }>;
    confidence: number;
}

export interface AutoTaggerStatus {
    isScanning: boolean;
    totalTracks: number;
    processedTracks: number;
    repairedCount: number;
    verifiedCount: number;
    failedCount: number;
    lastResult?: AuditResult;
}

export class AutoTaggerService {
    private status: AutoTaggerStatus = {
        isScanning: false,
        totalTracks: 0,
        processedTracks: 0,
        repairedCount: 0,
        verifiedCount: 0,
        failedCount: 0
    };

    constructor(
        private db: DatabaseService,
        private catalogService: CatalogService,
        private openRouter: OpenRouterService
    ) {}

    getStatus(): AutoTaggerStatus {
        return { ...this.status };
    }

    /**
     * Starts a full library audit and repair process.
     */
    async startAudit(options: { forceRepair?: boolean, useAI?: boolean } = {}): Promise<void> {
        if (this.status.isScanning) return;

        const tracks = this.db.getTracks();
        this.status = {
            isScanning: true,
            totalTracks: tracks.length,
            processedTracks: 0,
            repairedCount: 0,
            verifiedCount: 0,
            failedCount: 0
        };

        console.log(`[AutoTagger] Starting library audit for ${tracks.length} tracks...`);

        // Process in background
        this.processBatch(tracks, options).catch(err => {
            console.error("[AutoTagger] Batch processing failed:", err);
            this.status.isScanning = false;
        });
    }

    private async processBatch(tracks: Track[], options: { forceRepair?: boolean, useAI?: boolean }): Promise<void> {
        for (const track of tracks) {
            this.status.processedTracks++;
            
            try {
                const result = await this.auditTrack(track, options);
                this.status.lastResult = result;

                if (result.status === 'repaired') {
                    this.status.repairedCount++;
                } else if (result.status === 'verified') {
                    this.status.verifiedCount++;
                } else {
                    this.status.failedCount++;
                }

                // Low priority: yield to other tasks and avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, result.status === 'no_match' ? 100 : 500));
            } catch (err) {
                console.error(`[AutoTagger] Error auditing track ${track.id}:`, err);
                this.status.failedCount++;
            }

            if (!this.status.isScanning) break;
        }

        this.status.isScanning = false;
        console.log(`[AutoTagger] Audit completed. Repaired: ${this.status.repairedCount}, Verified: ${this.status.verifiedCount}`);
    }

    async auditTrack(track: Track, options: { forceRepair?: boolean, useAI?: boolean }): Promise<AuditResult> {
        const query = `${track.artist_name || 'Unknown Artist'} - ${track.title}`;
        
        // 1. Search online providers
        let matches = await metadataService.searchRecording(query);
        
        // 2. If no match and AI enabled, try AI
        if (matches.length === 0 && options.useAI) {
            const aiData = await this.openRouter.enrichMetadata(track.title, track.artist_name || 'Unknown Artist');
            if (aiData) {
                matches = [{
                    id: 'ai-' + Date.now(),
                    title: track.title,
                    artist: track.artist_name || 'Unknown Artist',
                    albumTitle: (track as any).album_title,
                    date: aiData.year ? String(aiData.year) : '',
                    year: aiData.year,
                    genre: aiData.genre,
                    source: 'openrouter'
                }];
            }
        }

        if (matches.length === 0) {
            return {
                trackId: track.id,
                title: track.title,
                artist: track.artist_name || 'Unknown Artist',
                status: 'no_match',
                confidence: 0
            };
        }

        // 3. Find best match and calculate confidence
        const bestMatch = this.findBestMatch(track, matches);
        const confidence = this.calculateConfidence(track, bestMatch);

        // 4. Compare and apply changes
        const changes: Record<string, { old: any, new: any }> = {};
        const updateData: any = {};

        if (bestMatch.genre && this.isBetter(track.genre, bestMatch.genre)) {
            changes.genre = { old: track.genre, new: bestMatch.genre };
            updateData.genre = bestMatch.genre;
        }

        if (bestMatch.year && this.isBetter(track.year, bestMatch.year)) {
            changes.year = { old: track.year, new: bestMatch.year };
            updateData.year = bestMatch.year;
        }

        if (bestMatch.artist && this.isBetter(track.artist_name, bestMatch.artist)) {
            changes.artist = { old: track.artist_name, new: bestMatch.artist };
            updateData.artist = bestMatch.artist;
        }

        if (bestMatch.albumTitle && !track.album_id) {
             changes.album = { old: null, new: bestMatch.albumTitle };
             updateData.album = bestMatch.albumTitle;
        }

        const hasChanges = Object.keys(updateData).length > 0;

        if (hasChanges && (options.forceRepair || confidence > 0.8)) {
            await this.catalogService.updateTrack(track.id, updateData);
            return {
                trackId: track.id,
                title: track.title,
                artist: track.artist_name || 'Unknown Artist',
                status: 'repaired',
                changes,
                confidence
            };
        }

        return {
            trackId: track.id,
            title: track.title,
            artist: track.artist_name || 'Unknown Artist',
            status: hasChanges ? 'verified' : 'verified', // If there are potential changes but confidence is low, we mark as verified (no change)
            changes: hasChanges ? changes : undefined,
            confidence
        };
    }

    private findBestMatch(track: Track, matches: any[]): any {
        // Simple heuristic: exact match on title/artist first
        const exact = matches.find(m => 
            m.title.toLowerCase() === track.title.toLowerCase() && 
            m.artist.toLowerCase() === (track.artist_name || '').toLowerCase()
        );
        return exact || matches[0];
    }

    private calculateConfidence(track: Track, match: any): number {
        const titleSim = this.similarity(track.title.toLowerCase(), match.title.toLowerCase());
        const artistSim = this.similarity((track.artist_name || '').toLowerCase(), match.artist.toLowerCase());
        return (titleSim + artistSim) / 2;
    }

    private isBetter(current: any, found: any): boolean {
        if (!current || current === 'Library' || current === 'Unknown Artist' || current === 0) return true;
        if (typeof current === 'string' && typeof found === 'string') {
            return current.toLowerCase() !== found.toLowerCase() && found.length > current.length;
        }
        return false;
    }

    private similarity(a: string, b: string): number {
        const longer = a.length > b.length ? a : b;
        const shorter = a.length > b.length ? b : a;
        const longerLength = longer.length;
        if (longerLength === 0) return 1.0;
        return (longerLength - this.levenshtein(longer, shorter)) / longerLength;
    }

    private levenshtein(a: string, b: string): number {
        const tmp = [];
        for (let i = 0; i <= b.length; i++) tmp[i] = [i];
        for (let i = 0; i <= a.length; i++) tmp[0][i] = i;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                tmp[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
                    ? tmp[i - 1][j - 1]
                    : Math.min(tmp[i - 1][j - 1] + 1, tmp[i][j - 1] + 1, tmp[i - 1][j] + 1);
            }
        }
        return tmp[b.length][a.length];
    }

    stopAudit(): void {
        this.status.isScanning = false;
    }
}
