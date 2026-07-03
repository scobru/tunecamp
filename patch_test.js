const fs = require('fs');

const file = 'src/server/modules/catalog/__tests__/scanner.test.ts';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('getTracksByIds: jest.fn()')) {
    code = code.replace(
        /getTrack: jest\.fn\(\),/g,
        'getTrack: jest.fn(),\n    getTracksByIds: jest.fn(),'
    );
}

if (!code.includes('mockDbService as any).getTracksByIds = jest.fn')) {
    code = code.replace(
        /getTrack = jest\.fn\(\(id: number\) => tracks\.find\(t => t\.id === id\)\);/g,
        'getTrack = jest.fn((id: number) => tracks.find(t => t.id === id));\n        (mockDbService as any).getTracksByIds = jest.fn((ids: number[]) => tracks.filter(t => ids.includes(t.id)));'
    );
}

fs.writeFileSync(file, code);
