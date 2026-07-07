const fs = require('fs');
let file = fs.readFileSync('src/server/modules/network/__tests__/rss.service.test.ts', 'utf8');
file = file.replace(
    /transaction: jest\.fn\(\(fn\) => fn\(\)\),\n            transaction: jest\.fn\(\(fn\) => fn\(\)\),/g,
    `transaction: jest.fn((fn) => fn()),`
);
fs.writeFileSync('src/server/modules/network/__tests__/rss.service.test.ts', file);
