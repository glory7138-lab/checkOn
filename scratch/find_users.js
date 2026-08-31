const { pool } = require('../server/db');
async function find() {
    let conn = await pool.getConnection();
    const rows = await conn.query(`
        SELECT YEAR, CODE_NO, NAME, AREA_CODE, DEL_YN, IS_HIDDEN 
        FROM CWTB_USER 
        WHERE NAME LIKE '%이지영%' 
           OR NAME LIKE '%민주안%' 
           OR NAME LIKE '%김한의%' 
           OR NAME LIKE '%김종%' 
           OR NAME LIKE '%황보혜%'
        ORDER BY NAME, YEAR DESC
    `);
    console.log('Results in CWTB_USER (all years):', rows);
    conn.release();
    process.exit(0);
}
find().catch(e => { console.error(e); process.exit(1); });
