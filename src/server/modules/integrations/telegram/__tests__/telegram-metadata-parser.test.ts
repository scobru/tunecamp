import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TelegramMetadataParser } from '../telegram-metadata-parser.js';
import type { OpenRouterService } from '../../../ai/openrouter.service.js';

describe('TelegramMetadataParser', () => {
    let mockAiService: jest.Mocked<OpenRouterService>;

    beforeEach(() => {
        mockAiService = {
            isEnabled: jest.fn(),
            parseMetadataFromText: jest.fn(),
        } as unknown as jest.Mocked<OpenRouterService>;
    });

    it('should return empty object for empty or whitespace caption', async () => {
        const parser = new TelegramMetadataParser();
        expect(await parser.parse('')).toEqual({});
        expect(await parser.parse('   ')).toEqual({});
    });

    it('should correctly parse hashtags for metadata', async () => {
        const parser = new TelegramMetadataParser();
        const caption = `
        Here is a cool track.
        #artist: The Beatles
        #album- Abbey Road
        #year= 1969
        #title: Come Together
        #genre: Rock
        `;

        const result = await parser.parse(caption);
        expect(result).toEqual({
            artist: 'The Beatles',
            album: 'Abbey Road',
            year: 1969,
            title: 'Come Together',
            genre: 'Rock'
        });
    });

    it('should use AI parsing if hashtags are missing and AI is enabled', async () => {
        mockAiService.isEnabled.mockReturnValue(true);
        mockAiService.parseMetadataFromText.mockResolvedValue({
            artist: 'AI Artist',
            album: 'AI Album'
        });

        const parser = new TelegramMetadataParser(mockAiService);
        const result = await parser.parse('Just some random text without hashtags');

        expect(result).toEqual({
            artist: 'AI Artist',
            album: 'AI Album'
        });
        expect(mockAiService.parseMetadataFromText).toHaveBeenCalledWith('Just some random text without hashtags');
    });

    it('should use AI parsing and handle array return type from AI service', async () => {
        mockAiService.isEnabled.mockReturnValue(true);
        mockAiService.parseMetadataFromText.mockResolvedValue([
            { artist: 'AI Array Artist', album: 'AI Array Album' }
        ] as any);

        const parser = new TelegramMetadataParser(mockAiService);
        const result = await parser.parse('Just some random text without hashtags');

        expect(result).toEqual({
            artist: 'AI Array Artist',
            album: 'AI Array Album'
        });
    });

    it('should fallback to line-based parsing if AI parsing throws an error', async () => {
        mockAiService.isEnabled.mockReturnValue(true);
        mockAiService.parseMetadataFromText.mockRejectedValue(new Error('AI failed'));

        const parser = new TelegramMetadataParser(mockAiService);
        const caption = "Line1 Artist\nLine2 Album\nLine3 Extra";

        const result = await parser.parse(caption);

        expect(result).toEqual({
            artist: 'Line1 Artist',
            album: 'Line2 Album'
        });
    });

    it('should fallback to line-based parsing if no AI service is provided and hashtags are missing', async () => {
        const parser = new TelegramMetadataParser();
        const caption = "Line1 Artist\nLine2 Album";

        const result = await parser.parse(caption);

        expect(result).toEqual({
            artist: 'Line1 Artist',
            album: 'Line2 Album'
        });
    });

    it('should ignore empty lines and lines starting with # for line-based fallback', async () => {
        const parser = new TelegramMetadataParser();
        const caption = "\n\n  \n#ignore this\nLine1 Artist\n\nLine2 Album";

        const result = await parser.parse(caption);

        expect(result).toEqual({
            artist: 'Line1 Artist',
            album: 'Line2 Album'
        });
    });
});
