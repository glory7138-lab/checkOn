const { pool } = require('../server/db');

async function inspectSalvationDate() {
    let conn = await pool.getConnection();

    const sample = await conn.query(`
        SELECT u.CODE_NO, u.NAME, u.PHONE, u.AREA_CODE, u.SAL_Y, u.SAL_M, u.SAL_D, u.SALVATION_DATE, pa.POSITION as PA_POSITION
        FROM CWTB_USER u
        LEFT JOIN CWTB_PA pa ON u.NAME = pa.NAME AND pa.YEAR = '2026'
        WHERE u.YEAR = '2026' AND u.DEL_YN = 'N'
          AND (pa.POSITION LIKE '%구역장%' OR pa.POSITION LIKE '%조장%')
        LIMIT 10
    `);
    console.log('Leader Salvation Date format sample:');
    sample.forEach(s => {
        console.log(`  [${s.AREA_CODE}구역 ${s.PA_POSITION}] ${s.NAME} | SAL_Y=${s.SAL_Y}, SAL_M=${s.SAL_M}, SAL_D=${s.SAL_D}, SALVATION_DATE=${s.SALVATION_DATE}`);
    });

    conn.release();
    process.exit(0);
}

inspectSalvationDate().catch(e => { console.error(e); process.exit(1); });
