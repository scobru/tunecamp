import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import path from 'path';

/**
 * These tests pin the streaming-format DECISION made by MediaEngine.getStream:
 * which source formats are served as-is and which must be transcoded to mp3
 * before reaching a browser <audio> element.
 *
 * Regression guard for the cloud-import bug: tracks whose DB `format` is "mp4"
 * (Apple M4A / ALAC, sometimes mislabeled .mp3 with an ID3 tag glued on) were
 * served raw as audio/mpeg and failed in the browser with
 * DEMUXER_ERROR_COULD_NOT_OPEN. They must now be transcoded to mp3 instead.
 *
 * ffmpeg and the filesystem are fully mocked so the test is deterministic and
 * never spawns a process or touches disk — it asserts on the routing only.
 */

// --- Mock ./ffmpeg.js: a fake transcode command + always-available live slot ---
const fakeTranscodeStream: any = { on: jest.fn().mockReturnThis(), destroy: jest.fn(), destroyed: false };
const fakeCommand: any = { pipe: jest.fn(() => fakeTranscodeStream), on: jest.fn().mockReturnThis() };
const transcode = jest.fn((..._args: any[]) => fakeCommand);
const transcodeToFile = jest.fn(() => Promise.resolve());
const tryAcquireLiveSlot = jest.fn(() => true);
const releaseLiveSlot = jest.fn();

jest.unstable_mockModule('./ffmpeg.js', () => ({
  __esModule: true,
  transcode,
  transcodeToFile,
  tryAcquireLiveSlot,
  releaseLiveSlot,
}));

// --- Mock fs-extra: the track file "exists", cache files do not ---
const fakeFileStream: any = { on: jest.fn() };
const mockFs = {
  // Source track is present on disk; anything in the transcode cache is absent
  // so transcoded plays take the live-encode path (cache miss).
  pathExists: jest.fn(async (p: string) => !String(p).includes('.transcode-cache')),
  stat: jest.fn(async () => ({ size: 4_835_034 })),
  createReadStream: jest.fn(() => fakeFileStream),
  ensureDir: jest.fn(async () => {}),
  move: jest.fn(async () => {}),
  remove: jest.fn(async () => {}),
  readdir: jest.fn(async () => [] as string[]),
};
jest.unstable_mockModule('../../../utils/fs.js', () => ({ __esModule: true, default: mockFs }));

let MediaEngine: any;

beforeAll(async () => {
  ({ MediaEngine } = await import('./media-engine.js'));
});

const MUSIC_DIR = path.join('/srv', 'music');

interface FakeTrack {
  id: number;
  file_path: string;
  format: string;
  external_id?: string | null;
  url?: string | null;
  lossless_path?: string | null;
  bitrate?: number | null;
  title?: string;
  artist_name?: string;
  owner_id?: number;
}

function makeEngine(track: FakeTrack) {
  const database: any = {
    getTrack: jest.fn(() => track),
    getTrackByExternalId: jest.fn(() => undefined),
    getPrimaryAdminId: jest.fn(() => 1),
  };
  return new MediaEngine(database, MUSIC_DIR);
}

const track = (format: string, ext: string): FakeTrack => ({
  id: 152,
  file_path: `cloud_imports/Unknown/Morgan - 09_Un_chimico.${ext}`,
  format,
  external_id: null,
  url: null,
  lossless_path: null,
  bitrate: 0,
  title: 'Un chimico',
  artist_name: 'Morgan',
  owner_id: 1,
});

describe('MediaEngine.getStream — local format routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tryAcquireLiveSlot.mockReturnValue(true);
  });

  describe('transcodes to mp3 for browser-unsafe source formats', () => {
    // The regression case: M4A body, .mp3 filename, DB format "mp4".
    it('mp4 container mislabeled .mp3 is transcoded, not served raw', async () => {
      const engine = makeEngine(track('mp4', 'mp3'));
      const result = await engine.getStream({ trackId: 152 });

      expect(transcode).toHaveBeenCalledTimes(1);
      // Source path passed to ffmpeg; target format mp3.
      expect(transcode).toHaveBeenCalledWith(
        path.join(MUSIC_DIR, 'cloud_imports/Unknown/Morgan - 09_Un_chimico.mp3'),
        'mp3',
        undefined,
        undefined,
      );
      expect(result.contentType).toBe('audio/mpeg');
      expect(result.statusCode).toBe(200);
      expect(result.stream).toBe(fakeTranscodeStream);
      // It must NOT have been read off disk and piped verbatim.
      expect(mockFs.createReadStream).not.toHaveBeenCalled();
    });

    it.each(['mp4', 'm4a', 'alac', 'wav'])(
      'source format "%s" is transcoded to mp3',
      async (format) => {
        const engine = makeEngine(track(format, format));
        const result = await engine.getStream({ trackId: 152 });

        expect(transcode).toHaveBeenCalledTimes(1);
        expect(transcode.mock.calls[0][1]).toBe('mp3');
        expect(result.contentType).toBe('audio/mpeg');
      },
    );
  });

  describe('serves directly for browser-safe source formats', () => {
    it.each([
      ['mp3', 'audio/mpeg'],
      ['flac', 'audio/flac'],
      ['ogg', 'audio/ogg'],
      ['opus', 'audio/opus'],
      ['aac', 'audio/aac'],
    ])('source format "%s" is streamed without transcoding', async (format, contentType) => {
      const engine = makeEngine(track(format, format));
      const result = await engine.getStream({ trackId: 152 });

      expect(transcode).not.toHaveBeenCalled();
      expect(mockFs.createReadStream).toHaveBeenCalledTimes(1);
      expect(result.contentType).toBe(contentType);
      expect(result.statusCode).toBe(200);
      expect(result.stream).toBe(fakeFileStream);
    });
  });

  // Regression guard: ffmpeg emits 'error' on the COMMAND object, not on the
  // piped stream. If the live path only listened on the stream, an ffmpeg
  // failure on a corrupt source became an uncaughtException and crash-looped
  // the server. The command MUST carry an 'error' listener.
  it('registers an error listener on the ffmpeg command (crash guard)', async () => {
    const engine = makeEngine(track('mp4', 'mp3'));
    await engine.getStream({ trackId: 152 });

    const errorListener = fakeCommand.on.mock.calls.find((c: any[]) => c[0] === 'error');
    expect(errorListener).toBeDefined();
    expect(typeof errorListener[1]).toBe('function');

    // Simulating the ffmpeg failure must not throw out of the handler.
    expect(() => errorListener[1](new Error('ffmpeg exited with code 234'))).not.toThrow();
    expect(fakeTranscodeStream.destroy).toHaveBeenCalled();
  });

  it('honours an explicit ?format override even for a safe source', async () => {
    const engine = makeEngine(track('flac', 'flac'));
    const result = await engine.getStream({ trackId: 152, format: 'ogg' });

    expect(transcode).toHaveBeenCalledTimes(1);
    expect(transcode.mock.calls[0][1]).toBe('ogg');
    expect(result.contentType).toBe('audio/ogg');
  });
});
