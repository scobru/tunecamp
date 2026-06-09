/**
 * Lightweight, client-side BPM estimation for preview audio.
 *
 * Decodes the audio via Web Audio (requires a same-origin URL — route Bandcamp previews
 * through `/api/proxy/stream` so the buffer isn't CORS-tainted), builds a coarse energy
 * envelope, and autocorrelates it across a plausible tempo range. This is an approximation
 * intended as a DJ-workflow hint, not a precise analysis.
 */

const MIN_BPM = 70;
const MAX_BPM = 180;
/** Envelope sample rate in Hz — resolution of the onset/energy curve. */
const ENVELOPE_RATE = 200;
/** Only analyse the first N seconds to keep it fast. */
const MAX_SECONDS = 30;

type WindowAudioContext = typeof AudioContext;

function getAudioContextCtor(): WindowAudioContext | null {
    const w = window as unknown as { AudioContext?: WindowAudioContext; webkitAudioContext?: WindowAudioContext };
    return w.AudioContext || w.webkitAudioContext || null;
}

/** Build a downsampled energy envelope (one value per 1/ENVELOPE_RATE second). */
function buildEnvelope(channel: Float32Array, sampleRate: number): Float32Array {
    const samplesPerWindow = Math.max(1, Math.floor(sampleRate / ENVELOPE_RATE));
    const windowCount = Math.floor(channel.length / samplesPerWindow);
    const envelope = new Float32Array(windowCount);
    for (let i = 0; i < windowCount; i++) {
        let sum = 0;
        const start = i * samplesPerWindow;
        for (let j = 0; j < samplesPerWindow; j++) {
            const s = channel[start + j];
            sum += s * s;
        }
        envelope[i] = Math.sqrt(sum / samplesPerWindow);
    }
    // Differentiate + half-wave rectify to emphasise onsets.
    const onset = new Float32Array(windowCount);
    for (let i = 1; i < windowCount; i++) {
        const d = envelope[i] - envelope[i - 1];
        onset[i] = d > 0 ? d : 0;
    }
    return onset;
}

function estimateBpm(onset: Float32Array): number | null {
    if (onset.length < ENVELOPE_RATE) return null;
    let bestBpm: number | null = null;
    let bestScore = -Infinity;
    for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.5) {
        const lag = Math.round((60 / bpm) * ENVELOPE_RATE);
        if (lag <= 0 || lag >= onset.length) continue;
        let score = 0;
        for (let i = lag; i < onset.length; i++) {
            score += onset[i] * onset[i - lag];
        }
        // Normalise by overlap length so longer lags aren't penalised.
        score /= (onset.length - lag);
        if (score > bestScore) {
            bestScore = score;
            bestBpm = bpm;
        }
    }
    return bestBpm;
}

/** Estimate the BPM of an audio file at `url`. Returns null if it can't be determined. */
export async function detectBpmFromUrl(url: string): Promise<number | null> {
    const Ctx = getAudioContextCtor();
    if (!Ctx) return null;
    const ctx = new Ctx();
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        const audio = await ctx.decodeAudioData(buf);

        const sampleRate = audio.sampleRate;
        const maxLen = Math.min(audio.length, Math.floor(sampleRate * MAX_SECONDS));
        const channel = audio.getChannelData(0).subarray(0, maxLen);

        const onset = buildEnvelope(channel, sampleRate);
        const bpm = estimateBpm(onset);
        return bpm ? Math.round(bpm) : null;
    } catch (err) {
        console.error("[BPM] detection failed:", err);
        return null;
    } finally {
        ctx.close().catch(() => {});
    }
}
