const { createDatabase } = require('./src/server/database.js');
const { createActivityPubService } = require('./src/server/activitypub.js');
const path = require('path');

async function runSync() {
    const dbPath = path.join(process.cwd(), "tunecamp.db");
    const database = createDatabase(dbPath);

    // Mock config
    const config = {
        publicUrl: 'https://tunecamp.scobrudot.dev',
        siteName: 'TuneCamp'
    };

    // Mock federation (we only need the service for syncAllContent which uses database)
    // Actually syncAllContent calls broadcastRelease/Post which use ctx.sendActivity
    // So we DO need a real federation context or to mock it heavily.

    console.log("This script might be too complex to run standalone due to Fedify dependencies.");
    console.log("It's better to trigger it via the API if the server is running.");
}

runSync();
