const https = require('https');

const accountId = '115992252602062555';
const url = `https://livellosegreto.it/api/v1/accounts/${accountId}/statuses`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const statuses = JSON.parse(data);
            console.log(`Total statuses visible: ${statuses.length}`);
            statuses.forEach((s, i) => {
                // Strip HTML tags for readability
                const content = s.content.replace(/<[^>]*>/g, '');
                console.log(`${i + 1}. [${s.id}] (${s.created_at}) ${content.substring(0, 50)}...`);
            });
        } catch (e) {
            console.error('Error parsing JSON:', e);
            console.log('Raw data:', data.substring(0, 500));
        }
    });
}).on('error', (err) => {
    console.error('Error:', err.message);
});
