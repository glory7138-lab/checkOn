const db = require('../server/db');

async function checkPositions() {
    let conn;
    try {
        conn = await db.pool.getConnection();
        const pos1 = await conn.query('SELECT DISTINCT POSITION FROM CWTB_USER WHERE YEAR = 2026');
        console.log('CWTB_USER positions:', pos1);

        const pos2 = await conn.query('SELECT DISTINCT POSITION FROM CWTB_PA WHERE YEAR = 2026');
        console.log('CWTB_PA positions:', pos2);

        const sample = await conn.query(`
            SELECT u.NAME, u.POSITION as user_pos, pa.POSITION as pa_pos 
            FROM CWTB_USER u 
            LEFT JOIN CWTB_PA pa ON u.NAME = pa.NAME AND pa.YEAR = 2026 
            WHERE u.YEAR = 2026 
              AND (u.POSITION NOT IN ('성도', '') OR pa.POSITION IS NOT NULL)
            LIMIT 25
        `);
        console.log('Sample data with positions:', sample);
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) conn.release();
        process.exit(0);
    }
}

checkPositions();
