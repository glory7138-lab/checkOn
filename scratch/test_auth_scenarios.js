const { pool } = require('../server/db');
const crypto = require('crypto');

function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

async function testAuthScenarios() {
    let conn = await pool.getConnection();

    console.log('=== 1. Testing Leader Salvation Date Auth ===');
    // Sample Leader: 11구역 구역장 임준석 (010-2748-9335, SAL_Y=2003, SAL_M=01, SAL_D=11 -> 20030111)
    const leader = await conn.query(`
        SELECT u.CODE_NO, u.NAME, u.PHONE, u.SAL_Y, u.SAL_M, u.SAL_D
        FROM CWTB_USER u
        WHERE u.YEAR = '2026' AND u.DEL_YN = 'N' AND u.NAME = '임준석'
    `);
    const leaderUser = leader[0];
    const expY = String(leaderUser.SAL_Y).padStart(4, '0');
    const expM = String(leaderUser.SAL_M).padStart(2, '0');
    const expD = String(leaderUser.SAL_D).padStart(2, '0');
    const expectedLeaderDate = `${expY}${expM}${expD}`;
    console.log(`Leader ${leaderUser.NAME} Phone: ${leaderUser.PHONE}, Expected Salvation Date: ${expectedLeaderDate}`);

    console.log('\n=== 2. Testing 41구역 Adult Fellowship Filter ===');
    const members41 = await conn.query(`
        SELECT u.CODE_NO, u.NAME, u.FELLOW_DEPT, u.AREA_CODE
        FROM CWTB_USER u
        LEFT JOIN faithon_reserve r ON u.CODE_NO = r.member_code
        WHERE u.YEAR = '2026'
          AND r.member_code IS NULL 
          AND u.IS_HIDDEN = 'N' 
          AND u.DEL_YN = 'N'
          AND u.FELLOW_DEPT IN ('봉', '어', '청', '은', '봉사회', '어머니회', '청년회', '은장회')
          AND u.AREA_CODE = '41'
    `);
    console.log(`41구역 Total Members in Query: ${members41.length}`);
    const bad41 = members41.filter(m => ['조민율', '조민서', '조민경'].includes(m.NAME));
    console.log('Are children included in 41구역?:', bad41.length > 0 ? 'YES (Error)' : 'NO (Perfect - 100% Excluded)');

    console.log('\n=== 3. Testing Admin Password Table ===');
    const adminRows = await conn.query("SELECT * FROM faithon_admin_passwords");
    console.log(`Admin passwords initialized in DB: ${adminRows.length} rows`);

    conn.release();
    process.exit(0);
}

testAuthScenarios().catch(e => { console.error(e); process.exit(1); });
