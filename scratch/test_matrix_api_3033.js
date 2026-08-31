const http = require('http');

http.get('http://localhost:3033/api/statistics/member-attendance-matrix?year=2026&areaCode=11&startDate=2026-04-26&endDate=2026-06-07', (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
        try {
            const data = JSON.parse(raw);
            const ncs = (data.data.members || []).filter(m => m.is_newcomer);
            console.log('11구역 Newcomers returned by API:');
            ncs.forEach(nc => {
                console.log(`  Name: ${nc.name} (code: ${nc.code}), History:`, nc.history, `Total: ${nc.total_attend_count}`);
            });
        } catch (e) {
            console.error(e, raw);
        }
        process.exit(0);
    });
}).on('error', (e) => {
    console.error('HTTP error:', e.message);
    process.exit(1);
});
