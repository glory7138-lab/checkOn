const { pool } = require('../server/db');
async function run() {
    let conn = await pool.getConnection();
    const rows = await conn.query(`
        SELECT u.AREA_CODE, u.NAME, u.CODE_NO, u.IS_HIDDEN, COUNT(a.id) as att_cnt 
        FROM CWTB_USER u 
        LEFT JOIN faithon_attendance a ON u.CODE_NO = a.member_code 
        WHERE u.CODE_NO IN ('111701', '330211', '212251') 
        GROUP BY u.CODE_NO, u.AREA_CODE, u.NAME, u.IS_HIDDEN
    `);
    console.log('Hidden users status & attendance:', rows);
    conn.release();
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
