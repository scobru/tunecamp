// Native fetch is available in Node.js 18+

const BASE_URL = 'http://localhost:3000/api';

async function testPlaylistCreation() {
    console.log('Testing Playlist Creation as Anonymous User...');
    try {
        const response = await fetch(`${BASE_URL}/playlists`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Hacked Playlist', description: 'Should not exist' })
        });

        console.log(`Status: ${response.status}`);
        if (response.status === 401) {
            console.log('✅ PASS: Unauthorized creation blocked (401)');
        } else {
            console.log('❌ FAIL: Unexpected status code');
            const data = await response.json();
            console.log('Response:', data);
        }
    } catch (e) {
        console.error('Error connecting to server:', e.message);
    }
}

async function testTrackAdd() {
    console.log('\nTesting Track Addition as Anonymous User...');
    // Try to add to a hypothetical playlist ID 1
    try {
        const response = await fetch(`${BASE_URL}/playlists/1/tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackId: 1 })
        });

        console.log(`Status: ${response.status}`);
        if (response.status === 401) {
            console.log('✅ PASS: Unauthorized track addition blocked (401)');
        } else {
            // 404 is also "acceptable" if playlist 1 doesn't exist, but we expect 401 first
            if (response.status === 404) {
                console.log('⚠️ WARN: Got 404. Did it bypass auth? We want 401.');
            } else {
                console.log('❌ FAIL: Unexpected status code');
                const data = await response.json();
                console.log('Response:', data);
            }
        }
    } catch (e) {
        console.error('Error connecting to server:', e.message);
    }
}

async function run() {
    await testPlaylistCreation();
    await testTrackAdd();
}

run();
