/**
 * Audio Engine for TuneCamp Collab
 * Web Audio API multitrack playback, waveform extraction, mixing, and WAV export.
 */

export interface TrackClip {
  id: string;
  sampleId: string;
  name: string;
  startTime: number; // in seconds
  duration: number; // in seconds
  offset?: number; // offset within the original sample
  url?: string;
}

export interface TrackState {
  id: string;
  name: string;
  volume: number; // 0 to 1
  muted: boolean;
  solo: boolean;
  locked?: boolean;
  samples: TrackClip[];
}

export interface AudioFrequencyData {
  level: number;
  bass: number;
  mid: number;
  high: number;
  isBeat: boolean;
}

export class AudioEngine {
  public audioContext: AudioContext | null = null;
  public analyser: AnalyserNode | null = null;
  public masterGain: GainNode | null = null;

  private audioBuffers = new Map<string, AudioBuffer>();
  private audioBlobUrls = new Map<string, { url: string; blob: Blob }>();
  private activeSources = new Map<string, { audio?: HTMLAudioElement; sourceNode?: AudioNode }>();
  private scheduledTimeouts = new Map<string, number>();

  public isPlaying = false;
  public startTime = 0;
  public pauseTime = 0;
  public latencyOffset = 0;

  private mediaRecorder: MediaRecorder | null = null;
  private recordingStream: MediaStream | null = null;
  public isRecording = false;
  private recordedChunks: Blob[] = [];

  private smoothedLevel = 0;
  private smoothedBass = 0;
  private smoothedHigh = 0;

  public async init(): Promise<AudioContext> {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;

      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    return this.audioContext;
  }

  public async loadAudioFromUrl(url: string, sampleId: string): Promise<AudioBuffer | null> {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return await this.loadAudio(blob, sampleId);
    } catch (err) {
      console.error(`[AudioEngine] Failed to fetch audio from ${url}:`, err);
      return null;
    }
  }

  public async loadAudio(audioBlob: Blob, sampleId: string): Promise<AudioBuffer> {
    await this.init();

    const blobUrl = URL.createObjectURL(audioBlob);
    this.audioBlobUrls.set(sampleId, { url: blobUrl, blob: audioBlob });

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);
      this.audioBuffers.set(sampleId, audioBuffer);
      return audioBuffer;
    } catch (e) {
      console.warn('[AudioEngine] decodeAudioData failed, fallback to element duration', e);
      // Dummy buffer fallback
      const dummy = this.audioContext!.createBuffer(1, 44100, 44100);
      this.audioBuffers.set(sampleId, dummy);
      return dummy;
    }
  }

  public getBuffer(sampleId: string): AudioBuffer | undefined {
    return this.audioBuffers.get(sampleId);
  }

  public getWaveformData(buffer: AudioBuffer, samplesCount = 300): number[] {
    const rawData = buffer.getChannelData(0);
    const blockSize = Math.floor(rawData.length / samplesCount) || 1;
    const waveformData: number[] = [];

    for (let i = 0; i < samplesCount; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        const idx = i * blockSize + j;
        if (idx < rawData.length) {
          sum += Math.abs(rawData[idx]);
        }
      }
      waveformData.push(sum / blockSize);
    }

    return waveformData;
  }

  public async playTimeline(tracks: TrackState[]): Promise<void> {
    await this.init();

    const seekPosition = this.pauseTime;
    this.stopPlayback();

    this.isPlaying = true;
    this.startTime = this.audioContext!.currentTime - seekPosition;

    const hasSolo = tracks.some((t) => t.solo);

    tracks.forEach((track) => {
      const isMuted = track.muted || (hasSolo && !track.solo);
      if (isMuted) return;

      const trackGain = this.audioContext!.createGain();
      trackGain.gain.value = track.volume ?? 1.0;
      trackGain.connect(this.masterGain!);

      track.samples.forEach((sample) => {
        const sampleStart = sample.startTime || 0;
        const sampleDuration = sample.duration || 1;
        const sampleEnd = sampleStart + sampleDuration;
        const sampleOffset = sample.offset || 0;

        if (sampleEnd <= seekPosition) return;

        let relativeStartTime = sampleStart - seekPosition;
        let playOffset = sampleOffset;
        let playDuration = sampleDuration;

        if (relativeStartTime < 0) {
          const cursorOffset = seekPosition - sampleStart;
          playOffset = sampleOffset + cursorOffset;
          playDuration = sampleDuration - cursorOffset;
          relativeStartTime = 0;
        }

        const startDelayMs = relativeStartTime * 1000;
        const key = `${track.id}-${sample.id}`;

        const playSampleFn = () => {
          if (!this.isPlaying) return;
          const buffer = this.audioBuffers.get(sample.sampleId);
          if (buffer && buffer.length > 10) {
            // BufferSource playback
            const source = this.audioContext!.createBufferSource();
            source.buffer = buffer;
            source.connect(trackGain);
            source.start(this.audioContext!.currentTime, playOffset, playDuration);
            this.activeSources.set(key, { sourceNode: source });
          } else {
            // HTML5 Audio playback fallback
            const blobData = this.audioBlobUrls.get(sample.sampleId);
            if (!blobData && sample.url) {
              const audio = new Audio(sample.url);
              audio.currentTime = playOffset;
              audio.volume = track.volume;
              audio.play().catch(console.error);
              this.activeSources.set(key, { audio });
              return;
            }
            if (blobData) {
              const audio = new Audio(blobData.url);
              audio.currentTime = playOffset;
              audio.volume = track.volume;
              audio.play().catch(console.error);
              this.activeSources.set(key, { audio });
            }
          }
        };

        if (startDelayMs > 0) {
          const timeoutId = window.setTimeout(playSampleFn, startDelayMs);
          this.scheduledTimeouts.set(key, timeoutId);
        } else {
          playSampleFn();
        }
      });
    });
  }

  public pausePlayback(): void {
    if (!this.isPlaying || !this.audioContext) return;
    this.pauseTime = this.audioContext.currentTime - this.startTime;
    this.clearSources();
    this.isPlaying = false;
  }

  public stopPlayback(): void {
    this.clearSources();
    this.pauseTime = 0;
    this.isPlaying = false;
  }

  public seek(timeSeconds: number): void {
    this.pauseTime = Math.max(0, timeSeconds);
    if (this.audioContext && this.isPlaying) {
      this.startTime = this.audioContext.currentTime - this.pauseTime;
    }
  }

  public getCurrentTime(): number {
    if (!this.isPlaying || !this.audioContext) {
      return this.pauseTime;
    }
    return Math.max(0, this.audioContext.currentTime - this.startTime);
  }

  private clearSources(): void {
    this.scheduledTimeouts.forEach((tid) => clearTimeout(tid));
    this.scheduledTimeouts.clear();

    this.activeSources.forEach(({ audio, sourceNode }) => {
      if (audio) {
        audio.pause();
      }
      if (sourceNode && 'stop' in sourceNode) {
        try {
          (sourceNode as AudioBufferSourceNode).stop();
        } catch {
          // ignore already stopped
        }
      }
    });
    this.activeSources.clear();
  }

  public getAudioData(): AudioFrequencyData {
    if (!this.analyser) {
      return { level: 0, bass: 0, mid: 0, high: 0, isBeat: false };
    }

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    const third = Math.floor(bufferLength / 3);

    let bassSum = 0;
    for (let i = 0; i < third; i++) bassSum += dataArray[i];
    const bass = bassSum / third / 255;

    let midSum = 0;
    for (let i = third; i < third * 2; i++) midSum += dataArray[i];
    const mid = midSum / third / 255;

    let highSum = 0;
    for (let i = third * 2; i < bufferLength; i++) highSum += dataArray[i];
    const high = highSum / third / 255;

    const level = (bass + mid + high) / 3;
    const smoothing = 0.8;

    this.smoothedLevel = this.smoothedLevel * smoothing + level * (1 - smoothing);
    this.smoothedBass = this.smoothedBass * smoothing + bass * (1 - smoothing);
    this.smoothedHigh = this.smoothedHigh * smoothing + high * (1 - smoothing);

    const isBeat = bass > this.smoothedBass * 1.4 && bass > 0.35;

    return {
      level: this.smoothedLevel,
      bass: this.smoothedBass,
      mid,
      high: this.smoothedHigh,
      isBeat,
    };
  }

  public async startRecording(): Promise<void> {
    await this.init();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    this.recordingStream = stream;
    this.mediaRecorder = new MediaRecorder(stream);
    this.recordedChunks = [];

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };

    this.mediaRecorder.start(100);
    this.isRecording = true;
  }

  public async stopRecording(): Promise<Blob | null> {
    if (!this.isRecording || !this.mediaRecorder) return null;

    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
        this.recordingStream?.getTracks().forEach((t) => t.stop());
        this.isRecording = false;
        this.recordingStream = null;
        this.mediaRecorder = null;
        resolve(blob);
      };
      this.mediaRecorder!.stop();
    });
  }

  public async exportWav(tracks: TrackState[]): Promise<Blob> {
    await this.init();

    // Find max duration
    let maxDuration = 10;
    tracks.forEach((t) => {
      t.samples.forEach((s) => {
        const end = (s.startTime || 0) + (s.duration || 0);
        if (end > maxDuration) maxDuration = end;
      });
    });

    const sampleRate = 44100;
    const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * maxDuration), sampleRate);
    const hasSolo = tracks.some((t) => t.solo);

    for (const track of tracks) {
      const isMuted = track.muted || (hasSolo && !track.solo);
      if (isMuted) continue;

      const trackGain = offlineCtx.createGain();
      trackGain.gain.value = track.volume ?? 1.0;
      trackGain.connect(offlineCtx.destination);

      for (const sample of track.samples) {
        const buffer = this.audioBuffers.get(sample.sampleId);
        if (!buffer) continue;

        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(trackGain);
        source.start(sample.startTime || 0, sample.offset || 0, sample.duration || buffer.duration);
      }
    }

    const renderedBuffer = await offlineCtx.startRendering();
    return this.bufferToWavBlob(renderedBuffer);
  }

  private bufferToWavBlob(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const out = new DataView(new ArrayBuffer(length));
    let channels: Float32Array[] = [];
    let sampleRate = buffer.sampleRate;
    let offset = 0;

    function writeString(str: string) {
      for (let i = 0; i < str.length; i++) {
        out.setUint8(offset++, str.charCodeAt(i));
      }
    }

    writeString('RIFF');
    out.setUint32(offset, length - 8, true);
    offset += 4;
    writeString('WAVE');
    writeString('fmt ');
    out.setUint32(offset, 16, true);
    offset += 4;
    out.setUint16(offset, 1, true);
    offset += 2;
    out.setUint16(offset, numOfChan, true);
    offset += 2;
    out.setUint32(offset, sampleRate, true);
    offset += 4;
    out.setUint32(offset, sampleRate * 2 * numOfChan, true);
    offset += 4;
    out.setUint16(offset, numOfChan * 2, true);
    offset += 2;
    out.setUint16(offset, 16, true);
    offset += 2;
    writeString('data');
    out.setUint32(offset, length - offset - 4, true);
    offset += 4;

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    let pos = 0;
    while (pos < buffer.length) {
      for (let ch = 0; ch < numOfChan; ch++) {
        let sample = Math.max(-1, Math.min(1, channels[ch][pos]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        out.setInt16(offset, sample, true);
        offset += 2;
      }
      pos++;
    }

    return new Blob([out.buffer], { type: 'audio/wav' });
  }
}

export const audioEngine = new AudioEngine();
