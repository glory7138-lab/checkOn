const { pool } = require('../server/db');
async function verify() {
    let conn = await pool.getConnection();
    const attTotal = await conn.query('SELECT COUNT(*) as total FROM faithon_attendance');
    const ncTotal = await conn.query('SELECT COUNT(*) as total FROM faithon_newcomer');
    const hiddenUsers = await conn.query("SELECT CODE_NO, NAME, AREA_CODE, IS_HIDDEN FROM CWTB_USER WHERE CODE_NO IN ('111701', '330211', '212251') AND YEAR = '2026'");
    console.log('faithon_attendance total rows:', attTotal[0].total);
    console.log('faithon_newcomer total rows:', ncTotal[0].total);
    console.log('Hidden users in 2026:', hiddenUsers);
    conn.release();
    process.exit(0);
}
verify().catch(e => { console.error(e); process.exit(1); });
