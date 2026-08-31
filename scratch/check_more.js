const { pool } = require('../server/db');
async function checkMore() {
    let conn = await pool.getConnection();
    const r2025 = await conn.query("SELECT CODE_NO, NAME, AREA_CODE FROM CWTB_USER WHERE YEAR = '2025' AND (NAME LIKE '%김종%' OR NAME LIKE '%황보혜%' OR NAME LIKE '%민주안%')");
    console.log('2025 users:', r2025);
    const r2026 = await conn.query("SELECT CODE_NO, NAME, AREA_CODE FROM CWTB_USER WHERE YEAR = '2026' AND (NAME LIKE '%김종%' OR NAME LIKE '%황보혜%' OR NAME LIKE '%민주안%')");
    console.log('2026 users:', r2026);
    conn.release();
    process.exit(0);
}
checkMore().catch(e => { console.error(e); process.exit(1); });
