/**
 * DjEngine — experimental (LAB) Web Audio DJ mixer.
 *
 * Plays a list of tracks back-to-back with gapless, equal-power crossfades —
 * the foundation of the "Auto Mix / DJ Mode" design proposal
 * (see docs/auto-mix-dj.md). This is Phase 1 of that doc: a two-deck Web Audio
 * engine that overlaps the outgoing and incoming track. Beat alignment and the
 * per-transition editor are intentionally out of scope here.
 *
 * It is deliberately self-contained and does NOT touch the main <audio>-based
 * player (PlayerBar / usePlayerStore), so normal playback carries zero
 * regression risk. The LAB page drives it directly.
 */

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
}

type Listener = (state: DjEngineState) => void;

interface Deck {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

const CURVE_STEPS = 64;

export class DjEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private decks: [Deck | null, Deck | null] = [null, null];
  private activeDeck = 0;

  private tracks: DjTrack[] = [];
  private index = -1;
  private crossfadeSec = 8;
  private volume = 1;

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

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(v, 1));
    if (this.master) this.master.gain.value = this.volume;
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
    // Make sure the idle deck is silenced.
    const idle = this.decks[1 - this.activeDeck];
    if (idle) {
      idle.audio.pause();
      idle.gain.gain.cancelScheduledValues(this.ctx!.currentTime);
      idle.gain.gain.value = 0;
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
    const gain = this.ctx!.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(this.master!);
    audio.addEventListener('ended', () => this.onDeckEnded(audio));
    return { audio, source, gain };
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
    if (!this.playing || this.crossfading || this.crossfadeSec <= 0) return;
    if (this.index >= this.tracks.length - 1) return;

    const active = this.decks[this.activeDeck]!;
    const dur = active.audio.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    const remaining = dur - active.audio.currentTime;

    // Don't try to crossfade a track shorter than the window.
    const fadeWindow = Math.min(this.crossfadeSec, dur / 2);
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

    const now = ctx.currentTime;
    const outCurve = new Float32Array(CURVE_STEPS);
    const inCurve = new Float32Array(CURVE_STEPS);
    for (let i = 0; i < CURVE_STEPS; i++) {
      const t = i / (CURVE_STEPS - 1); // 0..1
      // Equal-power crossfade.
      outCurve[i] = Math.cos((t * Math.PI) / 2);
      inCurve[i] = Math.cos(((1 - t) * Math.PI) / 2);
    }

    fromDeck.gain.gain.cancelScheduledValues(now);
    toDeck.gain.gain.cancelScheduledValues(now);
    fromDeck.gain.gain.setValueCurveAtTime(outCurve, now, fadeWindow);
    toDeck.gain.gain.setValueCurveAtTime(inCurve, now, fadeWindow);

    void toDeck.audio.play().catch((e) => console.warn('[DjEngine] next deck play failed', e));

    setTimeout(() => {
      // Crossfade complete: the incoming deck is now active.
      fromDeck.audio.pause();
      fromDeck.gain.gain.value = 0;
      toDeck.gain.gain.value = 1;
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
    this.decks.forEach((d) => d?.gain.gain.cancelScheduledValues(now));
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
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    this.listeners.forEach((cb) => cb(snap));
  }
}
