const fs = require('fs');
const { pool } = require('../server/db');

async function checkHidden() {
    const data = JSON.parse(fs.readFileSync('scratch_parsed_attendance.json', 'utf8'));
    let conn = await pool.getConnection();

    // Query all CWTB_USER for 2026 including IS_HIDDEN
    const all2026 = await conn.query("SELECT CODE_NO, NAME, AREA_CODE, IS_HIDDEN, DEL_YN FROM CWTB_USER WHERE YEAR = '2026'");
    console.log('Total 2026 users in DB:', all2026.length);

    const hiddenUsers = all2026.filter(u => u.IS_HIDDEN === 'Y');
    console.log('Hidden 2026 users count:', hiddenUsers.length);
    console.log('Hidden users list:', hiddenUsers.map(u => `${u.AREA_CODE}구역 ${u.NAME} (${u.CODE_NO})`));

    // Check which hidden users are in Excel
    const excelNames = new Set(data.filter(x => x.type === 'address').map(x => `${x.area_code}_${x.name}`));
    const hiddenInExcel = [];
    hiddenUsers.forEach(hu => {
        const k = hu.AREA_CODE.trim() + '_' + hu.NAME.trim();
        if (excelNames.has(k)) {
            hiddenInExcel.push(hu);
        }
    });

    console.log(`Hidden users found in Excel attendance (${hiddenInExcel.length}명):`);
    hiddenInExcel.forEach(u => {
        console.log(`  - [${u.AREA_CODE}구역] ${u.NAME} (${u.CODE_NO})`);
    });

    conn.release();
    process.exit(0);
}

checkHidden().catch(e => { console.error(e); process.exit(1); });
