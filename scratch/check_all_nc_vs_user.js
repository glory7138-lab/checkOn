const { pool } = require('../server/db');

async function checkNewcomersInCWTB() {
    let conn = await pool.getConnection();

    // 1. Fill empty guide_name with self name
    await conn.query(`UPDATE faithon_newcomer SET guide_name = name WHERE guide_name IS NULL OR guide_name = ''`);
    console.log('Filled empty guide_name with newcomer self name.');

    // 2. Fetch all newcomers
    const newcomers = await conn.query('SELECT id, name, guide_name, area_code, registered_code, is_registered_member FROM faithon_newcomer ORDER BY CAST(area_code AS UNSIGNED), id');

    console.log('\n--- Checking 31 Newcomers against CWTB_USER (2026, DEL_YN=N) ---');
    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const nc of newcomers) {
        // Query CWTB_USER by name and area_code
        const matchExact = await conn.query(`
            SELECT CODE_NO, NAME, AREA_CODE, POSITION, IS_HIDDEN 
            FROM CWTB_USER 
            WHERE YEAR = '2026' AND DEL_YN = 'N' AND (NAME = ? OR NAME LIKE ?)
        `, [nc.name.trim(), `%${nc.name.trim()}%`]);

        if (matchExact.length > 0) {
            console.log(`[ID ${nc.id}] [${nc.area_code}구역] ${nc.name} (인도: ${nc.guide_name}) => 주소록 일치 발견!:`, matchExact.map(u => `${u.CODE_NO} [${u.AREA_CODE}구역] ${u.NAME} (${u.POSITION || '성도'}, 숨김: ${u.IS_HIDDEN})`));
            matchedCount++;
        } else {
            console.log(`[ID ${nc.id}] [${nc.area_code}구역] ${nc.name} (인도: ${nc.guide_name}) => 주소록에 없음 (순수 새참자)`);
            unmatchedCount++;
        }
    }

    console.log(`\n총 새참자: ${newcomers.length}명 (주소록에 이름이 있는 분: ${matchedCount}명, 주소록에 전혀 없는 순수 새참자: ${unmatchedCount}명)`);
    conn.release();
    process.exit(0);
}

checkNewcomersInCWTB().catch(e => { console.error(e); process.exit(1); });
