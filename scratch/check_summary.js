const { pool } = require('../server/db');
async function run() {
    let conn = await pool.getConnection();
    const rows = await conn.query(`
        SELECT DATE_FORMAT(service_date, '%Y-%m-%d') as sdate, COUNT(*) as cnt 
        FROM faithon_attendance 
        WHERE service_type = 'sunday'
        GROUP BY DATE_FORMAT(service_date, '%Y-%m-%d')
        ORDER BY sdate
    `);
    console.log('Attendance counts per Sunday:');
    rows.forEach(r => console.log(`  ${r.sdate}: ${r.cnt}명`));
    conn.release();
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
