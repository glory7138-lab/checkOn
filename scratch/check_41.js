const { pool } = require('../server/db');
async function findKim() {
    let conn = await pool.getConnection();
    const rows = await conn.query(`
        SELECT YEAR, CODE_NO, NAME, AREA_CODE, DEL_YN, IS_HIDDEN 
        FROM CWTB_USER 
        WHERE YEAR = '2026' AND AREA_CODE = '41'
        ORDER BY CODE_NO
    `);
    console.log('2026 Area 41 members:', rows);
    conn.release();
    process.exit(0);
}
findKim().catch(e => { console.error(e); process.exit(1); });
