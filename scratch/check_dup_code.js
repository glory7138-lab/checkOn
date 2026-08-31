const { pool } = require('../server/db');
async function run() {
    let conn = await pool.getConnection();
    const rows = await conn.query(`
        SELECT YEAR, CODE_NO, NAME, AREA_CODE, IS_HIDDEN 
        FROM CWTB_USER 
        WHERE CODE_NO = '212251' OR NAME IN ('문소흔', '최시애')
    `);
    console.log('212251 / 문소흔 / 최시애:', rows);
    conn.release();
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
