const { pool } = require('../server/db');
async function unhide() {
    let conn = await pool.getConnection();
    await conn.query("UPDATE CWTB_USER SET IS_HIDDEN = 'N' WHERE YEAR = '2026' AND CODE_NO IN ('111701', '330211', '212251')");
    const res = await conn.query("SELECT CODE_NO, NAME, AREA_CODE, IS_HIDDEN FROM CWTB_USER WHERE YEAR = '2026' AND CODE_NO IN ('111701', '330211', '212251')");
    console.log('Updated users:', res);
    conn.release();
    process.exit(0);
}
unhide().catch(e => { console.error(e); process.exit(1); });
