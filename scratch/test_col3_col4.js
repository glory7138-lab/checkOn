const { pool } = require('../server/db');

async function testGuides() {
    let conn = await pool.getConnection();
    
    // Check some of the Col 4 names in CWTB_USER:
    const col4_names = ['최경숙', '서금자', '이지영1', '이지영', '손정미', '조수자', '양애란', '김재홍', '박점숙', '배미숙', '박미옥', '이미화', '백종애', '박성찬', '서영석'];
    console.log('--- Checking Col 4 names (Guides / Regular members) in CWTB_USER ---');
    for (const name of col4_names) {
        const u = await conn.query("SELECT CODE_NO, NAME, AREA_CODE, POSITION FROM CWTB_USER WHERE YEAR = '2026' AND NAME LIKE ? AND DEL_YN = 'N'", [`%${name}%`]);
        console.log(`Col 4 name '${name}':`, u.map(x => `${x.AREA_CODE}구역 ${x.NAME} (${x.POSITION || '성도'})`));
    }

    // Check some of the Col 3 names (Newcomers):
    const col3_names = ['윤나영', '조미경', '차경은', '차미나', '손기성', '김선희', '송경애', '송세영', '송기영', '신현금', '노정희', '박지혜', '김창명', '김태형', '이경옥', '이순자', '정니영', '정양선', '목서진', '김예솔', '김성수', '김광홍'];
    console.log('\n--- Checking Col 3 names (Actual Newcomers) in CWTB_USER ---');
    for (const name of col3_names) {
        const u = await conn.query("SELECT CODE_NO, NAME, AREA_CODE, POSITION FROM CWTB_USER WHERE YEAR = '2026' AND NAME LIKE ? AND DEL_YN = 'N'", [`%${name}%`]);
        console.log(`Col 3 name '${name}':`, u.map(x => `${x.AREA_CODE}구역 ${x.NAME} (${x.POSITION || '성도'})`));
    }

    conn.release();
    process.exit(0);
}

testGuides().catch(e => { console.error(e); process.exit(1); });
