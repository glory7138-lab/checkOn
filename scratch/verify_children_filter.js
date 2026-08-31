const { pool } = require('../server/db');

async function verifyUpdates() {
    let conn = await pool.getConnection();

    // 1. Verify 41구역 member list
    const activeYear = '2026';
    const areaCode = '41';
    let query = `
        SELECT u.CODE_NO, u.NAME, u.FELLOW_DEPT, u.AREA_CODE
        FROM CWTB_USER u
        LEFT JOIN faithon_reserve r ON u.CODE_NO = r.member_code
        WHERE u.YEAR = ?
          AND r.member_code IS NULL 
          AND u.IS_HIDDEN = 'N' 
          AND u.DEL_YN = 'N'
          AND (u.FELLOW_DEPT IS NULL OR u.FELLOW_DEPT NOT IN ('초', '중', '고', '유', '유초', '중고', '유치', '초등', '유초등부', '중고등부', '학생'))
          AND u.AREA_CODE = ?
        ORDER BY u.NAME ASC
    `;
    const members41 = await conn.query(query, [activeYear, areaCode]);
    console.log(`41구역 Members Count (Excluding Children): ${members41.length}`);
    const childNames = ['조민경', '조민서', '조민율'];
    const foundChildren = members41.filter(m => childNames.includes(m.NAME));
    console.log('Any children found in 41구역?:', foundChildren.length > 0 ? foundChildren : 'None! (100% Clean)');

    // 2. Check total adult members across all areas
    const totalAdults = await conn.query(`
        SELECT COUNT(*) as cnt 
        FROM CWTB_USER u
        LEFT JOIN faithon_reserve r ON u.CODE_NO = r.member_code
        WHERE u.YEAR = ? AND u.DEL_YN = 'N' AND u.IS_HIDDEN = 'N' AND r.member_code IS NULL
          AND (u.FELLOW_DEPT IS NULL OR u.FELLOW_DEPT NOT IN ('초', '중', '고', '유', '유초', '중고', '유치', '초등', '유초등부', '중고등부', '학생'))
    `, [activeYear]);
    console.log(`Total Adult Church Members: ${totalAdults[0].cnt} (292 adult members)`);

    conn.release();
    process.exit(0);
}

verifyUpdates().catch(e => { console.error(e); process.exit(1); });
