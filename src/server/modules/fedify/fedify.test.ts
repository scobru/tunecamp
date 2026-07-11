import { jest } from '@jest/globals';
import { handleDeleteObject } from './fedify.js';

describe('handleDeleteObject', () => {
    let dbMock: any;
    let consoleLogSpy: any;

    beforeEach(() => {
        dbMock = {
            removeAllFollowers: jest.fn(),
            deleteApReply: jest.fn().mockReturnValue(false),
            deleteRemoteContent: jest.fn(),
        };
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('should return early if objectId is undefined', () => {
        handleDeleteObject(dbMock, undefined, 'https://example.com/actor');

        expect(dbMock.removeAllFollowers).not.toHaveBeenCalled();
        expect(dbMock.deleteApReply).not.toHaveBeenCalled();
        expect(dbMock.deleteRemoteContent).not.toHaveBeenCalled();
    });

    test('should remove all followers when objectId equals actorUri (Account Deletion)', () => {
        const uri = 'https://example.com/actor';
        handleDeleteObject(dbMock, uri, uri);

        expect(dbMock.removeAllFollowers).toHaveBeenCalledWith(uri);
        expect(consoleLogSpy).toHaveBeenCalledWith(`🗑️ Remote actor deleted (optimized with single query); removed as follower: ${uri}`);
        expect(dbMock.deleteApReply).not.toHaveBeenCalled();
        expect(dbMock.deleteRemoteContent).not.toHaveBeenCalled();
    });

    test('should delete object and remote content when objectId does not equal actorUri', () => {
        const objectId = 'https://example.com/post/1';
        const actorUri = 'https://example.com/actor';

        handleDeleteObject(dbMock, objectId, actorUri);

        expect(dbMock.deleteApReply).toHaveBeenCalledWith(objectId);
        expect(dbMock.deleteRemoteContent).toHaveBeenCalledWith(objectId);
        expect(consoleLogSpy).toHaveBeenCalledWith(`🗑️ Processed Delete for object ${objectId}`);
        expect(dbMock.removeAllFollowers).not.toHaveBeenCalled();
    });

    test('should log message when deleteApReply returns true', () => {
        const objectId = 'https://example.com/reply/1';
        dbMock.deleteApReply.mockReturnValue(true);

        handleDeleteObject(dbMock, objectId, undefined);

        expect(dbMock.deleteApReply).toHaveBeenCalledWith(objectId);
        expect(dbMock.deleteRemoteContent).toHaveBeenCalledWith(objectId);
        expect(consoleLogSpy).toHaveBeenCalledWith(`🗑️ Deleted federated reply ${objectId}`);
        expect(consoleLogSpy).toHaveBeenCalledWith(`🗑️ Processed Delete for object ${objectId}`);
    });
});
