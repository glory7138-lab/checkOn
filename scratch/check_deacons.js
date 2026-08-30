const db = require('../server/db');

async function checkDeacons() {
    let conn;
    try {
        conn = await db.pool.getConnection();
        const d2026 = await conn.query('SELECT * FROM CWTB_DEACON WHERE YEAR = 2026');
        console.log('2026 deacons count:', d2026.length);
        const dAll = await conn.query('SELECT YEAR, COUNT(*) as cnt FROM CWTB_DEACON GROUP BY YEAR');
        console.log('Deacon counts by year:', dAll);

        const d2024 = await conn.query('SELECT * FROM CWTB_DEACON_2024 LIMIT 5');
        console.log('CWTB_DEACON_2024 sample:', d2024);

        const d2025 = await conn.query('SELECT * FROM CWTB_DEACON_2025 LIMIT 5');
        console.log('CWTB_DEACON_2025 sample:', d2025);

        const pep2026 = await conn.query('SELECT * FROM CWTB_PEP WHERE YEAR = 2026 OR YEAR = 2025');
        console.log('PEP 2025/2026 count:', pep2026.length);
        const pastors = await conn.query("SELECT * FROM CWTB_PEP WHERE POSITION LIKE '%목사%' OR POSITION LIKE '%전도사%' OR POSITION LIKE '%집사%'");
        console.log('Pastors/Deacons in PEP:', pastors);

    } catch (e) {
        console.error(e);
    } finally {
        if (conn) conn.release();
        process.exit(0);
    }
}

checkDeacons();
