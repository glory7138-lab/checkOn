const { pool } = require('../server/db');

async function testStats() {
    let conn = await pool.getConnection();
    const activeYear = '2026';
    const areaCode = '11';
    const fromDateStr = '2026-04-26';
    const toDateStr = '2026-06-07';

    // 정규 성도
    let memberListQuery = `
        SELECT u.CODE_NO, u.NAME, u.AREA_CODE, 0 as is_newcomer, NULL as guide_name
        FROM CWTB_USER u
        LEFT JOIN faithon_reserve r ON u.CODE_NO = r.member_code
        WHERE u.YEAR = ? AND u.DEL_YN = 'N' AND u.IS_HIDDEN = 'N' AND r.member_code IS NULL
    `;
    if (areaCode) memberListQuery += ` AND u.AREA_CODE = '${areaCode}'`;
    const regMembers = await conn.query(memberListQuery, [activeYear]);

    // 새참자
    let ncListQuery = `SELECT id, name as NAME, '새참자' as POSITION, phone as PHONE, COALESCE(area_code, temp_area) as AREA_CODE, 1 as is_newcomer, guide_name FROM faithon_newcomer`;
    if (areaCode) ncListQuery += ` WHERE (area_code = '${areaCode}' OR temp_area = '${areaCode}')`;
    const ncMembers = await conn.query(ncListQuery);

    console.log('ncMembers count:', ncMembers.length);
    console.log('ncMembers:', ncMembers);

    const allRoster = [];
    regMembers.forEach(m => allRoster.push({ ...m, code: m.CODE_NO }));
    ncMembers.forEach(m => allRoster.push({ ...m, code: `NC_${m.id}` }));

    let individualAttMap = {};
    const indQuery = `
        SELECT a.member_code, DATE_FORMAT(a.service_date, '%Y-%m-%d') as s_date, a.service_type
        FROM faithon_attendance a
        WHERE DATE_FORMAT(a.service_date, '%Y-%m-%d') >= ? 
          AND DATE_FORMAT(a.service_date, '%Y-%m-%d') <= ?
          AND a.is_attended = TRUE
    `;
    const indRows = await conn.query(indQuery, [fromDateStr, toDateStr]);
    console.log('indRows count:', indRows.length);
    indRows.forEach(r => {
        const key = `${r.member_code}_${r.s_date}`;
        individualAttMap[key] = true;
    });

    console.log('individualAttMap sample keys with NC_:', Object.keys(individualAttMap).filter(k => k.startsWith('NC_')));

    const dStart = new Date(fromDateStr);
    const dEnd = new Date(toDateStr);
    const allDates = [];
    const curr = new Date(dStart);
    while (curr <= dEnd) {
        const day = curr.getDay();
        const y = curr.getFullYear();
        const m = String(curr.getMonth() + 1).padStart(2, '0');
        const dt = String(curr.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${dt}`;
        if (day === 0 || day === 3) {
            allDates.push({ date: dateStr, dayName: day === 0 ? '주일' : '수요' });
        }
        curr.setDate(curr.getDate() + 1);
    }
    console.log('allDates:', allDates.map(d => d.date));

    const result = allRoster.filter(m => m.is_newcomer).map(m => {
        const history = {};
        allDates.forEach(d => {
            const att = !!individualAttMap[`${m.code}_${d.date}`];
            history[d.date] = att;
        });
        return { name: m.NAME, code: m.code, history };
    });

    console.log('Newcomers matrix result:');
    result.forEach(r => console.log(' ', r.name, r.code, r.history));

    conn.release();
    process.exit(0);
}

testStats().catch(e => { console.error(e); process.exit(1); });
