const { pool } = require('../server/db');

async function testUnauthorizedLogin() {
    let conn = await pool.getConnection();

    // Check a regular church member (not leader, not admin)
    // For example, in 41구역 regular member: 410111 백종애 (010-8534-6485)
    const mem = await conn.query(`
        SELECT u.CODE_NO, u.NAME, u.PHONE, u.AREA_CODE, u.POSITION, pa.POSITION as PA_POSITION
        FROM CWTB_USER u
        LEFT JOIN CWTB_PA pa ON u.NAME = pa.NAME AND pa.YEAR = '2026'
        LEFT JOIN CWTB_ADMIN a ON u.NAME = a.NAME
        LEFT JOIN WEB_ADMIN_PHONES wp ON REPLACE(REPLACE(u.PHONE, '-', ''), ' ', '') = wp.phone
        WHERE u.YEAR = '2026' AND u.DEL_YN = 'N' 
          AND pa.POSITION IS NULL AND a.NAME IS NULL AND wp.phone IS NULL
        LIMIT 3
    `);

    console.log('Sample Regular Members (Should get unauthorized message):', mem);

    conn.release();
    process.exit(0);
}

testUnauthorizedLogin().catch(e => { console.error(e); process.exit(1); });
