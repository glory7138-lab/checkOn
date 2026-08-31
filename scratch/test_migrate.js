const { pool } = require('../server/db');
async function testMigrate() {
    let conn = await pool.getConnection();
    const exists = await conn.query("SELECT * FROM CWTB_USER WHERE YEAR = '2026' AND NAME = '김종증'");
    console.log('Exists 2026 김종증:', exists);
    const existsMin = await conn.query("SELECT * FROM CWTB_USER WHERE YEAR = '2026' AND NAME = '민주안'");
    console.log('Exists 2026 민주안:', existsMin);
    conn.release();
    process.exit(0);
}
testMigrate().catch(e => { console.error(e); process.exit(1); });
