const { pool } = require('../server/db');

async function test() {
    let conn = await pool.getConnection();
    const rows = await conn.query("SELECT member_code, COUNT(*) as cnt, MIN(service_date) as min_d, MAX(service_date) as max_d FROM faithon_attendance WHERE member_code LIKE 'NC_%' GROUP BY member_code");
    console.log('NC attendance records in faithon_attendance:', rows);
    const ncRows = await conn.query('SELECT id, name, guide_name, area_code FROM faithon_newcomer');
    console.log('faithon_newcomer all:', ncRows);
    conn.release();
    process.exit(0);
}

test().catch(e => { console.error(e); process.exit(1); });
