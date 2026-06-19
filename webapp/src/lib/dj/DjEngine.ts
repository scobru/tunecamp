/**
 * DjEngine — experimental (LAB) Web Audio DJ mixer.
 *
 * Plays a list of tracks back-to-back with gapless, equal-power crossfades —
 * the foundation of the "Auto Mix / DJ Mode" design proposal
 * (see docs/auto-mix-dj.md). This is Phase 1+2 of that doc.
 *
 * Phase 1: two-deck Web Audio engine with equal-power crossfades.
 * Phase 2: preset system (Fade, Rise, Cut) with per-deck EQ filter nodes for
 *          bass-swap and high-pass sweep effects.
 *
 * It is deliberately self-contained and does NOT touch the main <audio>-based
 * player (PlayerBar / usePlayerStore), so normal playback carries zero
 * regression risk. The LAB page drives it directly.
 */

export type DjPreset = 'fade' | 'rise' | 'cut';

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
}

type Listener = (state: DjEngineState) => void;

interface Deck {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  lowShelf: BiquadFilterNode;  // for bass-swap (fade preset)
  highPass: BiquadFilterNode;  // for sweep (rise preset)
  gain: GainNode;
}

const CURVE_STEPS = 64;

// CUT preset: very short overlap in seconds
const CUT_WINDOW_SEC = 0.3;

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

  private playing = false;
  private crossfading = false;
  private ended = false;

  private tickHandle: number | null = null;
  private listeners = new Set<Listener>();

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

  setCrossfade(seconds: number): void {
    this.crossfadeSec = Math.max(0, Math.min(seconds, 30));
  }

  setPreset(preset: DjPreset): void {
    this.preset = preset;
    this.emit();
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
    this.cancelCrossfade();
    this.index += 1;
    const active = this.decks[this.activeDeck]!;
    this.loadDeck(active, this.tracks[this.index]);
    active.gain.gain.cancelScheduledValues(this.ctx!.currentTime);
    active.gain.gain.value = 1;
    this.resetDeckEq(active);
    // Make sure the idle deck is silenced.
    const idle = this.decks[1 - this.activeDeck];
    if (idle) {
      idle.audio.pause();
      idle.gain.gain.cancelScheduledValues(this.ctx!.currentTime);
      idle.gain.gain.value = 0;
      this.resetDeckEq(idle);
    }
    if (this.playing) void active.audio.play().catch(() => {});
    this.emit();
  }

  stop(): void {
    this.cancelCrossfade();
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
      d?.lowShelf.disconnect();
      d?.highPass.disconnect();
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

    const gain = this.ctx!.createGain();
    gain.gain.value = 0;

    source.connect(highPass);
    highPass.connect(lowShelf);
    lowShelf.connect(gain);
    gain.connect(this.master!);

    audio.addEventListener('ended', () => this.onDeckEnded(audio));
    return { audio, source, lowShelf, highPass, gain };
  }

  /** Reset EQ nodes to pass-through state. */
  private resetDeckEq(deck: Deck): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    deck.highPass.frequency.cancelScheduledValues(now);
    deck.highPass.frequency.value = 20;
    deck.lowShelf.gain.cancelScheduledValues(now);
    deck.lowShelf.gain.value = 0;
  }

  private loadDeck(deck: Deck, track: DjTrack): void {
    deck.audio.src = track.src;
    deck.audio.currentTime = 0;
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

    // 'cut' ignores the user crossfade setting
    const effectiveFade = this.preset === 'cut' ? CUT_WINDOW_SEC : this.crossfadeSec;
    if (effectiveFade <= 0) return;

    const active = this.decks[this.activeDeck]!;
    const dur = active.audio.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    const remaining = dur - active.audio.currentTime;

    const fadeWindow = Math.min(effectiveFade, dur / 2);
    if (remaining > fadeWindow) return;

    this.beginCrossfade(fadeWindow);
  }

  private beginCrossfade(fadeWindow: number): void {
    const ctx = this.ctx!;
    const fromDeck = this.decks[this.activeDeck]!;
    const toDeckIdx = 1 - this.activeDeck;
    const toDeck = this.decks[toDeckIdx]!;
    const nextTrack = this.tracks[this.index + 1];
    if (!nextTrack) return;

    this.crossfading = true;
    this.loadDeck(toDeck, nextTrack);
    this.resetDeckEq(toDeck);

    const now = ctx.currentTime;

    // Volume curves — equal-power for fade and rise, linear for cut.
    const outCurve = new Float32Array(CURVE_STEPS);
    const inCurve = new Float32Array(CURVE_STEPS);
    for (let i = 0; i < CURVE_STEPS; i++) {
      const t = i / (CURVE_STEPS - 1);
      if (this.preset === 'cut') {
        outCurve[i] = t < 0.5 ? 1 : 0;
        inCurve[i] = t < 0.5 ? 0 : 1;
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
    if (this.preset === 'rise') {
      // Incoming high-pass filter sweeps from 2000 Hz down to 20 Hz — the
      // track appears to "materialise" from the top of the frequency range.
      toDeck.highPass.frequency.cancelScheduledValues(now);
      toDeck.highPass.frequency.setValueAtTime(2000, now);
      toDeck.highPass.frequency.exponentialRampToValueAtTime(20, now + fadeWindow);
    } else if (this.preset === 'fade') {
      // Bass-swap: fade outgoing lows out, incoming lows in.
      fromDeck.lowShelf.gain.cancelScheduledValues(now);
      fromDeck.lowShelf.gain.setValueAtTime(0, now);
      fromDeck.lowShelf.gain.linearRampToValueAtTime(-24, now + fadeWindow * 0.7);

      toDeck.lowShelf.gain.cancelScheduledValues(now);
      toDeck.lowShelf.gain.setValueAtTime(-24, now);
      toDeck.lowShelf.gain.linearRampToValueAtTime(0, now + fadeWindow * 0.7);
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
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    this.listeners.forEach((cb) => cb(snap));
  }
}
