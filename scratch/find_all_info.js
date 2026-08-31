const { pool } = require('../server/db');
async function findKimArea() {
    let conn = await pool.getConnection();
    const r2 = await conn.query("SELECT * FROM CWTB_USER WHERE NAME = '김종증'");
    console.log('김종증 all rows:', r2);
    const r3 = await conn.query("SELECT * FROM CWTB_USER WHERE NAME = '황보혜'");
    console.log('황보혜 all rows:', r3);
    conn.release();
    process.exit(0);
}
findKimArea().catch(e => { console.error(e); process.exit(1); });
