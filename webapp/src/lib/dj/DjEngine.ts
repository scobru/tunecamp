/**
 * DjEngine — experimental (LAB) Web Audio DJ mixer.
 *
 * Plays a list of tracks back-to-back with gapless, equal-power crossfades —
 * the foundation of the "Auto Mix / DJ Mode" design proposal
 * (see docs/auto-mix-dj.md). This is Phase 1+2 of that doc.
 *
 * Phase 1: two-deck Web Audio engine with equal-power crossfades.
 * Phase 2: preset system (Fade, Rise, Cut) with per-deck EQ filter nodes for
 *          bass-swap and high-pass sweep effects, plus beat-aligned transitions
 *          driven by client-side BPM/beat-grid detection — a lookahead preload
 *          feeds bar-quantised, beat-snapped crossfades.
 *
 * It is deliberately self-contained and does NOT touch the main <audio>-based
 * player (PlayerBar / usePlayerStore), so normal playback carries zero
 * regression risk. The LAB page drives it directly.
 */

export type DjPreset = 'fade' | 'rise' | 'cut';
export type VolumeMode = 'overlap' | 'smooth';
export type EqMode = 'center-bass' | 'none';
export type EffectsMode = 'lowpass' | 'none';

/** Per-transition configuration saved from the transition editor. */
export interface TransitionConfig {
  preset: DjPreset | 'auto';
  bars: 1 | 2 | 4 | 8;
  volume: VolumeMode;
  eq: EqMode;
  effects: EffectsMode;
}

export interface DjTrack {
  id: string | number;
  title: string;
  artistName?: string;
  src: string;
  coverUrl?: string;
  duration?: number;
}

export interface DjEngineState {
  isPlaying: boolean;
  currentIndex: number;
  currentTrack: DjTrack | null;
  nextTrack: DjTrack | null;
  position: number; // seconds into the current track
  duration: number; // seconds of the current track
  isCrossfading: boolean;
  ended: boolean;
  preset: DjPreset;
  volume: number;
  beatSync: boolean;
}

type Listener = (state: DjEngineState) => void;

interface Deck {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  highPass: BiquadFilterNode;  // for sweep (rise preset)
  lowShelf: BiquadFilterNode;  // for bass-swap (fade preset)
  lowPass: BiquadFilterNode;   // for lowpass effects (effects preset)
  gain: GainNode;
}

/** A planned crossfade: how long to blend and where the incoming track enters. */
interface CrossfadePlan {
  fadeWindow: number;       // crossfade length in seconds
  incomingStartSec: number; // where to start the next track (its beat, for sync)
}

/** Beat grid derived from a track's detected tempo + phase. */
interface BeatGrid {
  beatSec: number;   // seconds per beat
  barSec: number;    // seconds per bar (assumes 4/4)
  offsetSec: number; // phase of the beat within [0, beatSec)
}

const CURVE_STEPS = 64;

// CUT preset: very short overlap in seconds
const CUT_WINDOW_SEC = 0.3;

// Lookahead: how early (seconds before the active track ends) to preload the
// next track onto the idle deck, so beat-aligned seeking is reliable.
const PRELOAD_LEAD_SEC = 15;

export class DjEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private decks: [Deck | null, Deck | null] = [null, null];
  private activeDeck = 0;

  private tracks: DjTrack[] = [];
  private index = -1;
  private crossfadeSec = 8;
  private volume = 1;
  private preset: DjPreset = 'fade';
  private beatSync = true;
  /** Detected tempo + beat-grid phase per track id, for beat-aligned mixing. */
  private beatInfo = new Map<string, { bpm: number; beatOffsetMs: number }>();
  /** Track index currently preloaded onto the idle deck (-1 = none). */
  private preloadedIndex = -1;

  private playing = false;
  private crossfading = false;
  private ended = false;

  private tickHandle: number | null = null;
  private listeners = new Set<Listener>();
  /** Per-transition overrides, keyed by the outgoing track's index. */
  private transitions = new Map<number, TransitionConfig>();

  // ─── Public API ──────────────────────────────────────────────────────────

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.snapshot());
    return () => this.listeners.delete(cb);
  }

  load(tracks: DjTrack[], startIndex = 0): void {
    this.tracks = tracks;
    this.index = tracks.length ? Math.min(Math.max(startIndex, 0), tracks.length - 1) : -1;
    this.ended = false;
  }

  /**
   * Replace the track set in place, keeping `currentIndex` as the active track.
   * Used to reorder/shuffle the *upcoming* tracks without disturbing the one
   * currently playing on the active deck.
   */
  setTracks(tracks: DjTrack[], currentIndex: number): void {
    this.tracks = tracks;
    this.index = tracks.length
      ? Math.min(Math.max(currentIndex, 0), tracks.length - 1)
      : -1;
    this.preloadedIndex = -1; // upcoming order may have changed
    this.emit();
  }

  setCrossfade(seconds: number): void {
    this.crossfadeSec = Math.max(0, Math.min(seconds, 30));
  }

  setPreset(preset: DjPreset): void {
    this.preset = preset;
    this.emit();
  }

  setBeatSync(on: boolean): void {
    this.beatSync = on;
    this.emit();
  }

  /**
   * Provide a track's detected tempo and beat-grid phase so upcoming
   * transitions can be aligned to the beat. Keyed by track id; safe to call
   * repeatedly as detection completes.
   */
  setBeatInfo(id: string | number, bpm: number, beatOffsetMs: number): void {
    if (!bpm || bpm <= 0) return;
    this.beatInfo.set(String(id), { bpm, beatOffsetMs });
  }

  /** Save a per-transition configuration for the fade from track `fromIndex` to the next. */
  setTransition(fromIndex: number, config: TransitionConfig): void {
    this.transitions.set(fromIndex, config);
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(v, 1));
    if (this.master) this.master.gain.value = this.volume;
    this.emit();
  }

  seek(percent: number): void {
    const active = this.decks[this.activeDeck];
    if (!active) return;
    const dur = active.audio.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    if (this.crossfading) this.cancelCrossfade();
    active.audio.currentTime = Math.max(0, Math.min(percent, 1)) * dur;
    this.emit();
  }

  async play(): Promise<void> {
    if (this.index < 0 || !this.tracks.length) return;
    this.ensureContext();
    if (this.ctx!.state === 'suspended') await this.ctx!.resume();

    const active = this.decks[this.activeDeck]!;
    if (!active.audio.src || this.ended) {
      // Fresh start (or restart after the set ended).
      if (this.ended) {
        this.ended = false;
        this.index = 0;
      }
      this.loadDeck(active, this.tracks[this.index]);
      active.gain.gain.value = 1;
    }
    try {
      await active.audio.play();
    } catch (e) {
      // Autoplay rejection or decode error — surface as stopped.
      console.warn('[DjEngine] play() failed', e);
      this.playing = false;
      this.emit();
      return;
    }
    this.playing = true;
    this.startTick();
    this.emit();
  }

  pause(): void {
    this.playing = false;
    this.decks.forEach((d) => d?.audio.pause());
    this.stopTick();
    this.emit();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else void this.play();
  }

  /** Hard-skip to the next track (no crossfade). */
  skipNext(): void {
    if (this.index >= this.tracks.length - 1) {
      this.finish();
      return;
    }
    this.ensureContext();
    this.hardSwitchTo(this.index + 1);
  }

  /**
   * Hard-skip to the previous track (no crossfade). If we're more than 3s into
   * the current track (or already on the first track), restart it instead —
   * the familiar "previous" behaviour from media players.
   */
  skipPrev(): void {
    this.ensureContext();
    const active = this.decks[this.activeDeck];
    if ((active && active.audio.currentTime > 3) || this.index <= 0) {
      this.seek(0);
      if (!this.playing) void this.play();
      return;
    }
    this.hardSwitchTo(this.index - 1);
  }

  /** Hard-jump to an arbitrary track in the set and start playing it. */
  jumpTo(index: number): void {
    if (index < 0 || index >= this.tracks.length) return;
    this.ensureContext();
    this.hardSwitchTo(index);
    if (!this.playing) void this.play();
  }

  /**
   * Manually trigger the crossfade into the next track now, using the
   * configured crossfade window (clamped to the remaining time). Lets the user
   * "mix early" instead of waiting for the automatic fade window.
   */
  mixNow(): void {
    if (this.crossfading || this.index >= this.tracks.length - 1) return;
    this.ensureContext();
    const active = this.decks[this.activeDeck];
    if (!active) return;
    const dur = active.audio.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    const remaining = dur - active.audio.currentTime;
    const effectiveFade = this.preset === 'cut' ? CUT_WINDOW_SEC : this.crossfadeSec;
    const fadeWindow = Math.min(effectiveFade > 0 ? effectiveFade : 4, remaining, dur / 2);
    if (fadeWindow <= 0) {
      this.skipNext();
      return;
    }
    if (!this.playing) void this.play();
    const gridB = this.gridFor(this.tracks[this.index + 1]);
    this.beginCrossfade(
      {
        fadeWindow,
        incomingStartSec: this.beatSync && gridB ? gridB.offsetSec : 0,
      },
      this.transitions.get(this.index),
    );
  }

  /**
   * Shared hard-switch: load `index` onto the active deck at full gain, silence
   * the idle deck, and (if playing) start it. Cancels any running crossfade.
   */
  private hardSwitchTo(index: number): void {
    this.cancelCrossfade();
    this.preloadedIndex = -1;
    this.ended = false;
    this.index = index;
    const now = this.ctx!.currentTime;
    const active = this.decks[this.activeDeck]!;
    this.loadDeck(active, this.tracks[this.index]);
    active.gain.gain.cancelScheduledValues(now);
    active.gain.gain.value = 1;
    this.resetDeckEq(active);
    // Make sure the idle deck is silenced.
    const idle = this.decks[1 - this.activeDeck];
    if (idle) {
      idle.audio.pause();
      idle.gain.gain.cancelScheduledValues(now);
      idle.gain.gain.value = 0;
      this.resetDeckEq(idle);
    }
    if (this.playing) void active.audio.play().catch(() => {});
    this.emit();
  }

  stop(): void {
    this.cancelCrossfade();
    this.preloadedIndex = -1;
    this.playing = false;
    this.stopTick();
    this.decks.forEach((d) => {
      if (d) {
        d.audio.pause();
        d.audio.removeAttribute('src');
        d.audio.load();
        this.resetDeckEq(d);
      }
    });
    this.index = this.tracks.length ? 0 : -1;
    this.ended = false;
    this.emit();
  }

  destroy(): void {
    this.stop();
    this.listeners.clear();
    this.decks.forEach((d) => {
      d?.source.disconnect();
      d?.highPass.disconnect();
      d?.lowShelf.disconnect();
      d?.lowPass.disconnect();
      d?.gain.disconnect();
    });
    this.decks = [null, null];
    this.master?.disconnect();
    this.master = null;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private ensureContext(): void {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.decks[0] = this.createDeck();
    this.decks[1] = this.createDeck();
  }

  private createDeck(): Deck {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    const source = this.ctx!.createMediaElementSource(audio);

    // EQ nodes: source → highPass → lowShelf → gain → master
    const highPass = this.ctx!.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 20;   // effectively off by default

    const lowShelf = this.ctx!.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 200;  // 200 Hz crossover for bass
    lowShelf.gain.value = 0;         // 0 dB = no change

    const lowPass = this.ctx!.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 20000; // pass-through by default (20 kHz)

    const gain = this.ctx!.createGain();
    gain.gain.value = 0;

    source.connect(highPass);
    highPass.connect(lowShelf);
    lowShelf.connect(lowPass);
    lowPass.connect(gain);
    gain.connect(this.master!);

    audio.addEventListener('ended', () => this.onDeckEnded(audio));
    return { audio, source, highPass, lowShelf, lowPass, gain };
  }

  /** Reset EQ nodes to pass-through state. */
  private resetDeckEq(deck: Deck): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    deck.highPass.frequency.cancelScheduledValues(now);
    deck.highPass.frequency.value = 20;
    deck.lowShelf.gain.cancelScheduledValues(now);
    deck.lowShelf.gain.value = 0;
    deck.lowPass.frequency.cancelScheduledValues(now);
    deck.lowPass.frequency.value = 20000;
  }

  private loadDeck(deck: Deck, track: DjTrack): void {
    deck.audio.src = track.src;
    deck.audio.currentTime = 0;
  }

  /** Beat grid for a track from its detected tempo/phase, or null if unknown. */
  private gridFor(track: DjTrack | null | undefined): BeatGrid | null {
    if (!track) return null;
    const info = this.beatInfo.get(String(track.id));
    if (!info || !info.bpm) return null;
    const beatSec = 60 / info.bpm;
    return {
      beatSec,
      barSec: beatSec * 4, // assume 4/4
      offsetSec: (((info.beatOffsetMs / 1000) % beatSec) + beatSec) % beatSec,
    };
  }

  /**
   * Lookahead preload: once the active track is within PRELOAD_LEAD_SEC of the
   * end, load the next track onto the idle deck (silent) so its metadata is
   * ready and beat-aligned seeking at crossfade time is reliable.
   */
  private preloadNext(): void {
    if (this.crossfading) return;
    const nextIdx = this.index + 1;
    if (nextIdx >= this.tracks.length) return;
    if (this.preloadedIndex === nextIdx) return;
    const active = this.decks[this.activeDeck];
    const idle = this.decks[1 - this.activeDeck];
    if (!active || !idle) return;
    const dur = active.audio.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    if (dur - active.audio.currentTime > PRELOAD_LEAD_SEC) return;
    this.loadDeck(idle, this.tracks[nextIdx]);
    idle.gain.gain.value = 0;
    this.resetDeckEq(idle);
    this.preloadedIndex = nextIdx;
  }

  private onDeckEnded(audio: HTMLAudioElement): void {
    // Only react to the *active* deck ending without a crossfade having taken
    // over (e.g. crossfade disabled, or track shorter than the window).
    const active = this.decks[this.activeDeck];
    if (!this.crossfading && active && active.audio === audio) {
      if (this.index >= this.tracks.length - 1) {
        this.finish();
      } else {
        this.skipNext();
      }
    }
  }

  private startTick(): void {
    if (this.tickHandle != null) return;
    const tick = () => {
      this.preloadNext();
      this.maybeCrossfade();
      this.emit();
      this.tickHandle = window.setTimeout(tick, 250);
    };
    tick();
  }

  private stopTick(): void {
    if (this.tickHandle != null) {
      clearTimeout(this.tickHandle);
      this.tickHandle = null;
    }
  }

  private maybeCrossfade(): void {
    if (!this.playing || this.crossfading) return;
    if (this.index >= this.tracks.length - 1) return;

    const config = this.transitions.get(this.index);
    const effectivePreset =
      config?.preset && config.preset !== 'auto' ? config.preset : this.preset;

    // 'cut' ignores the user crossfade setting
    const effectiveFade = effectivePreset === 'cut' ? CUT_WINDOW_SEC : this.crossfadeSec;
    if (effectiveFade <= 0 && !config?.bars) return;

    const active = this.decks[this.activeDeck]!;
    const dur = active.audio.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;

    let fadeWindow = Math.min(effectiveFade > 0 ? effectiveFade : 8, dur / 2);
    let incomingStartSec = 0;
    // Default: start the blend so it ends exactly as the track does.
    let startAt = dur - fadeWindow;

    if (this.beatSync || config?.bars) {
      const gridA = this.gridFor(this.tracks[this.index]);
      const gridB = this.gridFor(this.tracks[this.index + 1]);
      if (gridA) {
        if (effectivePreset !== 'cut') {
          // Use per-transition bar count if specified, otherwise auto-quantise.
          const targetBars = config?.bars
            ? config.bars
            : Math.max(1, Math.round(fadeWindow / gridA.barSec));
          const quantised = targetBars * gridA.barSec;
          if (quantised > 0 && quantised <= dur / 2) fadeWindow = quantised;
        }
        // Begin on the outgoing track's beat: the latest beat boundary that
        // still lets the blend finish by the end of the track.
        const latest = dur - fadeWindow;
        const beatsIn = Math.floor((latest - gridA.offsetSec) / gridA.beatSec);
        const aligned = gridA.offsetSec + beatsIn * gridA.beatSec;
        startAt = aligned > 0 && aligned <= latest ? aligned : latest;
      } else if (config?.bars) {
        // No BPM data but bars were specified — approximate at ~120 BPM (2s/bar).
        const approxBarSec = 2;
        const barsWindow = Math.min(config.bars * approxBarSec, dur / 2);
        if (barsWindow > 0) {
          fadeWindow = barsWindow;
          startAt = dur - fadeWindow;
        }
      }
      if (gridB) {
        // Bring the next track in on its own beat so the grids line up.
        incomingStartSec = gridB.offsetSec;
      }
    }

    if (active.audio.currentTime < startAt) return;
    this.beginCrossfade({ fadeWindow, incomingStartSec }, config);
  }

  private beginCrossfade(plan: CrossfadePlan, config?: TransitionConfig): void {
    const ctx = this.ctx!;
    const { fadeWindow, incomingStartSec } = plan;
    const fromDeck = this.decks[this.activeDeck]!;
    const toDeckIdx = 1 - this.activeDeck;
    const toDeck = this.decks[toDeckIdx]!;
    const nextTrack = this.tracks[this.index + 1];
    if (!nextTrack) return;

    const effectivePreset =
      config?.preset && config.preset !== 'auto' ? config.preset : this.preset;

    this.crossfading = true;
    // Reuse the preloaded deck if it already holds the next track; otherwise
    // load it now (a seek may not take until metadata is ready).
    if (this.preloadedIndex !== this.index + 1) {
      this.loadDeck(toDeck, nextTrack);
    }
    this.preloadedIndex = -1;
    this.resetDeckEq(toDeck);
    if (incomingStartSec > 0) {
      // Enter the incoming track on its beat so the two grids line up.
      try {
        toDeck.audio.currentTime = incomingStartSec;
      } catch {
        /* not seekable yet — fall back to a natural start */
      }
    }

    const now = ctx.currentTime;

    // Volume curves — equal-power for fade and rise, linear for cut/overlap.
    const outCurve = new Float32Array(CURVE_STEPS);
    const inCurve = new Float32Array(CURVE_STEPS);
    const useOverlap = config?.volume === 'overlap';
    for (let i = 0; i < CURVE_STEPS; i++) {
      const t = i / (CURVE_STEPS - 1);
      if (effectivePreset === 'cut') {
        outCurve[i] = t < 0.5 ? 1 : 0;
        inCurve[i] = t < 0.5 ? 0 : 1;
      } else if (useOverlap) {
        // Both tracks play at full volume — incoming fades in quickly.
        outCurve[i] = 1;
        inCurve[i] = Math.min(1, t * 2);
      } else {
        // equal-power
        outCurve[i] = Math.cos((t * Math.PI) / 2);
        inCurve[i] = Math.cos(((1 - t) * Math.PI) / 2);
      }
    }

    fromDeck.gain.gain.cancelScheduledValues(now);
    toDeck.gain.gain.cancelScheduledValues(now);
    fromDeck.gain.gain.setValueCurveAtTime(outCurve, now, fadeWindow);
    toDeck.gain.gain.setValueCurveAtTime(inCurve, now, fadeWindow);

    // Preset-specific EQ automation
    if (effectivePreset === 'rise') {
      // Incoming high-pass filter sweeps from 2000 Hz down to 20 Hz — the
      // track appears to "materialise" from the top of the frequency range.
      toDeck.highPass.frequency.cancelScheduledValues(now);
      toDeck.highPass.frequency.setValueAtTime(2000, now);
      toDeck.highPass.frequency.exponentialRampToValueAtTime(20, now + fadeWindow);
    } else if (effectivePreset === 'fade' || config?.eq === 'center-bass') {
      // Bass-swap: fade outgoing lows out, incoming lows in.
      fromDeck.lowShelf.gain.cancelScheduledValues(now);
      fromDeck.lowShelf.gain.setValueAtTime(0, now);
      fromDeck.lowShelf.gain.linearRampToValueAtTime(-24, now + fadeWindow * 0.7);

      toDeck.lowShelf.gain.cancelScheduledValues(now);
      toDeck.lowShelf.gain.setValueAtTime(-24, now);
      toDeck.lowShelf.gain.linearRampToValueAtTime(0, now + fadeWindow * 0.7);
    }

    // Low-pass effect: outgoing track's highs are progressively cut.
    if (config?.effects === 'lowpass') {
      fromDeck.lowPass.frequency.cancelScheduledValues(now);
      fromDeck.lowPass.frequency.setValueAtTime(20000, now);
      fromDeck.lowPass.frequency.exponentialRampToValueAtTime(300, now + fadeWindow * 0.85);
    }

    void toDeck.audio.play().catch((e) => console.warn('[DjEngine] next deck play failed', e));

    setTimeout(() => {
      // Crossfade complete: the incoming deck is now active.
      fromDeck.audio.pause();
      fromDeck.gain.gain.value = 0;
      toDeck.gain.gain.value = 1;
      this.resetDeckEq(fromDeck);
      this.resetDeckEq(toDeck);
      this.activeDeck = toDeckIdx;
      this.index += 1;
      this.crossfading = false;
      this.emit();
    }, fadeWindow * 1000);
  }

  private cancelCrossfade(): void {
    if (!this.crossfading || !this.ctx) {
      this.crossfading = false;
      return;
    }
    const now = this.ctx.currentTime;
    this.decks.forEach((d) => {
      if (!d) return;
      d.gain.gain.cancelScheduledValues(now);
      d.lowShelf.gain.cancelScheduledValues(now);
      d.highPass.frequency.cancelScheduledValues(now);
      d.lowPass.frequency.cancelScheduledValues(now);
    });
    this.crossfading = false;
  }

  private finish(): void {
    this.cancelCrossfade();
    this.playing = false;
    this.ended = true;
    this.stopTick();
    this.decks.forEach((d) => d?.audio.pause());
    this.emit();
  }

  private snapshot(): DjEngineState {
    const active = this.decks[this.activeDeck];
    return {
      isPlaying: this.playing,
      currentIndex: this.index,
      currentTrack: this.tracks[this.index] ?? null,
      nextTrack: this.tracks[this.index + 1] ?? null,
      position: active?.audio.currentTime ?? 0,
      duration:
        active && Number.isFinite(active.audio.duration)
          ? active.audio.duration
          : this.tracks[this.index]?.duration ?? 0,
      isCrossfading: this.crossfading,
      ended: this.ended,
      preset: this.preset,
      volume: this.volume,
      beatSync: this.beatSync,
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    this.listeners.forEach((cb) => cb(snap));
  }
}
