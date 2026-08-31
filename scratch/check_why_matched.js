const { pool } = require('../server/db');

async function checkWhyMatched() {
    let conn = await pool.getConnection();
    const newcomers = [
        { row: 309, area: '11', name: '최경숙', guide: '윤나영' },
        { row: 310, area: '11', name: '서금자', guide: '조미경' },
        { row: 313, area: '11', name: '손정미', guide: '손기성' },
        { row: 314, area: '11', name: '최경숙', guide: '김선희' },
        { row: 315, area: '12', name: '조수자', guide: '송경애' },
        { row: 316, area: '12', name: '조수자', guide: '송세영' },
        { row: 317, area: '12', name: '양애란', guide: '송기영' },
        { row: 318, area: '21', name: '김재홍', guide: '신현금' },
        { row: 319, area: '21', name: '박점숙', guide: '노정희' },
        { row: 320, area: '22', name: '배미숙', guide: '박지혜' },
        { row: 321, area: '22', name: '배미숙', guide: '김창명' },
        { row: 323, area: '22', name: '배미숙', guide: '이경옥' },
        { row: 324, area: '22', name: '박미옥', guide: '이순자' },
        { row: 325, area: '22', name: '박미옥', guide: '정니영' },
        { row: 328, area: '32', name: '이미화', guide: '정양선' },
        { row: 330, area: '32', name: '윤영희', guide: '최명희' },
        { row: 331, area: '32', name: '오은경', guide: '이예인' },
        { row: 333, area: '32', name: '하진', guide: '목서진' },
        { row: 334, area: '32', name: '손경희', guide: '정화옥' },
        { row: 335, area: '41', name: '백종애', guide: '김예솔' },
        { row: 337, area: '42', name: '박성찬', guide: '김성수' },
        { row: 339, area: '43', name: '서영석', guide: '김광홍' }
    ];

    for (const nc of newcomers) {
        const u = await conn.query("SELECT CODE_NO, NAME, AREA_CODE, POSITION, PHONE FROM CWTB_USER WHERE YEAR = '2026' AND NAME = ? AND DEL_YN = 'N'", [nc.name]);
        console.log(`Newcomer '${nc.name}' (${nc.area}구역, 인도: ${nc.guide}) -> DB in CWTB_USER:`, u);
    }
    conn.release();
    process.exit(0);
}
checkWhyMatched().catch(e => { console.error(e); process.exit(1); });
