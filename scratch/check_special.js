const fs = require('fs');
const { pool } = require('../server/db');

async function checkSpecial() {
    let conn = await pool.getConnection();
    const rows = await conn.query(`
        SELECT YEAR, CODE_NO, NAME, AREA_CODE, DEL_YN, IS_HIDDEN 
        FROM CWTB_USER 
        WHERE CODE_NO IN ('122241', '210401', '411851')
           OR NAME IN ('민주안', '김종증', '황보혜')
    `);
    console.log('Rows:', rows);
    conn.release();
    process.exit(0);
}
checkSpecial().catch(e => { console.error(e); process.exit(1); });
