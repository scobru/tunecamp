import { jest } from '@jest/globals';

export const mockFfmpegInstance: any = {
    outputOptions: jest.fn().mockReturnThis(),
    seekInput: jest.fn().mockReturnThis(),
    toFormat: jest.fn().mockReturnThis(),
    audioCodec: jest.fn().mockReturnThis(),
    audioBitrate: jest.fn().mockReturnThis(),
    save: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation(function(this: any, event: any, callback: any) {
        if (event === 'end') {
            setTimeout(callback, 10);
        }
        return mockFfmpegInstance;
    }),
};

const mockFfmpeg: any = jest.fn(() => mockFfmpegInstance);
mockFfmpeg.setFfmpegPath = jest.fn();
mockFfmpeg.setFfprobePath = jest.fn();
mockFfmpeg.ffprobe = jest.fn();

export default mockFfmpeg;
