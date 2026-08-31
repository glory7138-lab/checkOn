const { pool } = require('../server/db');

async function inspectCwtbUserCols() {
    let conn = await pool.getConnection();

    console.log('--- Columns in CWTB_USER ---');
    const cols = await conn.query("SHOW COLUMNS FROM CWTB_USER");
    cols.forEach(c => console.log(`  ${c.Field} (${c.Type})`));

    console.log('\n--- Sample Leader records in CWTB_USER ---');
    const sample = await conn.query(`
        SELECT u.CODE_NO, u.NAME, u.PHONE, u.AREA_CODE, u.POSITION, pa.POSITION as PA_POSITION,
               u.BAPTISM, u.BAP_DATE, u.BIRTH, u.PASS, u.PWD
        FROM CWTB_USER u
        LEFT JOIN CWTB_PA pa ON u.NAME = pa.NAME AND pa.YEAR = '2026'
        WHERE u.YEAR = '2026' AND u.DEL_YN = 'N'
          AND (pa.POSITION LIKE '%구역장%' OR pa.POSITION LIKE '%조장%')
        LIMIT 10
    `).catch(async () => {
        // In case some columns don't exist
        return await conn.query(`
            SELECT u.CODE_NO, u.NAME, u.PHONE, u.AREA_CODE, u.POSITION, pa.POSITION as PA_POSITION
            FROM CWTB_USER u
            LEFT JOIN CWTB_PA pa ON u.NAME = pa.NAME AND pa.YEAR = '2026'
            WHERE u.YEAR = '2026' AND u.DEL_YN = 'N'
              AND (pa.POSITION LIKE '%구역장%' OR pa.POSITION LIKE '%조장%')
            LIMIT 10
        `);
    });
    console.log('Sample leaders:', sample);

    console.log('\n--- Tables in DB related to admin/password/custom ---');
    const tables = await conn.query("SHOW TABLES");
    console.log('Tables:', tables.map(t => Object.values(t)[0]));

    conn.release();
    process.exit(0);
}

inspectCwtbUserCols().catch(e => { console.error(e); process.exit(1); });
