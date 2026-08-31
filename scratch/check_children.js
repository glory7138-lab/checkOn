const { pool } = require('../server/db');

async function checkChildren() {
    let conn = await pool.getConnection();

    console.log('--- 41구역 all members in CWTB_USER (2026, DEL_YN=N) ---');
    const rows41 = await conn.query(`
        SELECT u.CODE_NO, u.NAME, u.AREA_CODE, u.POSITION, u.FELLOW_DEPT, u.SERVICE_DEPT, u.IS_HIDDEN
        FROM CWTB_USER u
        WHERE u.YEAR = '2026' AND u.DEL_YN = 'N' AND u.AREA_CODE = '41'
    `);
    rows41.forEach(r => {
        console.log(`  ${r.CODE_NO} | ${r.NAME} | 직분: ${r.POSITION} | 회별: ${r.FELLOW_DEPT} | 봉사: ${r.SERVICE_DEPT} | 숨김: ${r.IS_HIDDEN}`);
    });

    console.log('\n--- Checking all FELLOW_DEPT in CWTB_USER (2026, DEL_YN=N) ---');
    const depts = await conn.query(`
        SELECT DISTINCT FELLOW_DEPT, COUNT(*) as cnt
        FROM CWTB_USER
        WHERE YEAR = '2026' AND DEL_YN = 'N'
        GROUP BY FELLOW_DEPT
    `);
    console.log('FELLOW_DEPT values:', depts);

    console.log('\n--- Checking members where FELLOW_DEPT is not 봉/어/청/은/학생 or is 기타/유초등부/중고등부/어린이 ---');
    const others = await conn.query(`
        SELECT CODE_NO, NAME, AREA_CODE, POSITION, FELLOW_DEPT, SERVICE_DEPT, IS_HIDDEN
        FROM CWTB_USER
        WHERE YEAR = '2026' AND DEL_YN = 'N' AND (
            FELLOW_DEPT NOT IN ('봉', '어', '청', '은', '봉사회', '어머니회', '청년회', '은장회')
            OR FELLOW_DEPT IS NULL 
            OR FELLOW_DEPT = ''
            OR FELLOW_DEPT LIKE '%기타%'
            OR FELLOW_DEPT LIKE '%유초%'
            OR FELLOW_DEPT LIKE '%중고%'
            OR FELLOW_DEPT LIKE '%어린이%'
            OR FELLOW_DEPT LIKE '%학생%'
        )
    `);
    others.forEach(r => {
        console.log(`  ${r.CODE_NO} | [${r.AREA_CODE}구역] ${r.NAME} | 직분: ${r.POSITION} | 회별: ${r.FELLOW_DEPT} | 숨김: ${r.IS_HIDDEN}`);
    });

    conn.release();
    process.exit(0);
}

checkChildren().catch(e => { console.error(e); process.exit(1); });
