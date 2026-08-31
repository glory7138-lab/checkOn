const { pool } = require('../server/db');

async function testDashboardMetrics() {
    let conn = await pool.getConnection();
    const activeYear = '2026';
    const fromDateStr = '2025-12-05';
    const toDateStr = '2026-08-31';

    let attQuery = `
        SELECT DATE_FORMAT(a.service_date, '%Y-%m-%d') as service_date, 
               a.service_type, 
               COUNT(DISTINCT a.member_code) as total_attend_cnt,
               SUM(CASE WHEN a.member_code NOT LIKE 'NC_%' THEN 1 ELSE 0 END) as regular_attend_cnt,
               SUM(CASE WHEN a.member_code LIKE 'NC_%' THEN 1 ELSE 0 END) as newcomer_attend_cnt
        FROM faithon_attendance a
        LEFT JOIN CWTB_USER u ON a.member_code = u.CODE_NO AND u.YEAR = ?
        LEFT JOIN faithon_newcomer nc ON a.member_code = CONCAT('NC_', nc.id)
        WHERE DATE_FORMAT(a.service_date, '%Y-%m-%d') >= ? 
          AND DATE_FORMAT(a.service_date, '%Y-%m-%d') <= ?
          AND a.is_attended = TRUE
        GROUP BY DATE_FORMAT(a.service_date, '%Y-%m-%d'), a.service_type
        ORDER BY service_date ASC
    `;
    const attRows = await conn.query(attQuery, [activeYear, fromDateStr, toDateStr]);

    const sundayMap = {};
    const sundayRegMap = {};
    const sundayNcMap = {};
    attRows.forEach(r => {
        if (r.service_type === 'sunday') {
            sundayMap[r.service_date] = Number(r.total_attend_cnt || 0);
            sundayRegMap[r.service_date] = Number(r.regular_attend_cnt || 0);
            sundayNcMap[r.service_date] = Number(r.newcomer_attend_cnt || 0);
        }
    });

    const dStart = new Date(fromDateStr);
    const dEnd = new Date(toDateStr);
    const now = new Date();
    const allDates = [];
    const curr = new Date(dStart);

    while (curr <= dEnd && curr <= now) {
        const day = curr.getDay();
        const y = curr.getFullYear();
        const m = String(curr.getMonth() + 1).padStart(2, '0');
        const dt = String(curr.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${dt}`;

        if (day === 0 || day === 3) {
            allDates.push({
                date: dateStr,
                dayName: day === 0 ? '주일' : '수요',
                sundayAttend: day === 0 ? (sundayMap[dateStr] || 0) : null
            });
        }
        curr.setDate(curr.getDate() + 1);
    }

    const sundaysOnly = allDates.filter(d => d.dayName === '주일');
    const sundaysWithData = sundaysOnly.filter(d => (d.sundayAttend || 0) > 0);
    const latestSundayObj = sundaysWithData.length > 0 ? sundaysWithData[sundaysWithData.length - 1] : null;
    const prevSundayObj = sundaysWithData.length > 1 ? sundaysWithData[sundaysWithData.length - 2] : null;

    console.log('Latest Sunday with data:', latestSundayObj);
    console.log('Previous Sunday with data:', prevSundayObj);
    const sundayDiff = prevSundayObj ? (((latestSundayObj.sundayAttend - prevSundayObj.sundayAttend) / prevSundayObj.sundayAttend) * 100).toFixed(1) : 0;
    console.log(`Latest count: ${latestSundayObj?.sundayAttend}명 (Diff: ${sundayDiff > 0 ? '+' : ''}${sundayDiff}%)`);

    conn.release();
    process.exit(0);
}

testDashboardMetrics().catch(e => { console.error(e); process.exit(1); });
