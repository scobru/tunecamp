const { createDatabase } = require('./dist/server/database.js');
const { runStartupMaintenance } = require('./dist/server/maintenance.js');
const path = require('path');

const config = {
    musicDir: './music',
    dbPath: 'tunecamp.db'
};

const dbService = createDatabase(config.dbPath);

async function test() {
    try {
        await runStartupMaintenance(dbService, config);
        console.log("Maintenance finished successfully!");
    } catch (e) {
        console.error("Maintenance failed:", e);
    } finally {
        dbService.db.close();
    }
}

test();
