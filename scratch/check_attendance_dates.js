const { pool } = require('../server/db');

async function checkAttendance() {
    let conn = await pool.getConnection();
    const rows = await conn.query("SELECT member_code, service_date FROM faithon_attendance WHERE member_code LIKE 'NC_%' AND service_date LIKE '2026-05-03%'");
    console.log('NC attendance on 2026-05-03:', rows);

    const nc2 = await conn.query("SELECT * FROM faithon_attendance WHERE member_code = 'NC_2'");
    console.log('All attendance for NC_2 (조미경):', nc2);

    const nc3 = await conn.query("SELECT * FROM faithon_attendance WHERE member_code = 'NC_3'");
    console.log('All attendance for NC_3 (차경은):', nc3);

    // Let's also check what /api/statistics/member-attendance-matrix returns for 11구역!
    const fromDateStr = '2026-04-26';
    const toDateStr = '2026-06-07';
    const indQuery = `
        SELECT a.member_code, DATE_FORMAT(a.service_date, '%Y-%m-%d') as s_date, a.service_type
        FROM faithon_attendance a
        WHERE DATE_FORMAT(a.service_date, '%Y-%m-%d') >= ? 
          AND DATE_FORMAT(a.service_date, '%Y-%m-%d') <= ?
          AND a.is_attended = TRUE
          AND a.member_code LIKE 'NC_%'
    `;
    const indRows = await conn.query(indQuery, [fromDateStr, toDateStr]);
    console.log(`indRows between ${fromDateStr} and ${toDateStr}:`, indRows);

    conn.release();
    process.exit(0);
}

checkAttendance().catch(e => { console.error(e); process.exit(1); });
