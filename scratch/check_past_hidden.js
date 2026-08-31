const fs = require('fs');
const { pool } = require('../server/db');

async function checkPastHidden() {
    const data = JSON.parse(fs.readFileSync('scratch_parsed_attendance.json', 'utf8'));
    let conn = await pool.getConnection();

    const allUsers = await conn.query("SELECT YEAR, CODE_NO, NAME, AREA_CODE, IS_HIDDEN, DEL_YN FROM CWTB_USER WHERE IS_HIDDEN = 'Y' OR DEL_YN = 'Y'");
    console.log('Total hidden or deleted across all years:', allUsers.length);

    const excelNames = new Set(data.filter(x => x.type === 'address').map(x => `${x.area_code}_${x.name}`));
    
    allUsers.forEach(u => {
        const k = u.AREA_CODE.trim() + '_' + u.NAME.trim();
        if (excelNames.has(k)) {
            console.log(`Matched hidden/deleted in Excel: Year=${u.YEAR}, [${u.AREA_CODE}구역] ${u.NAME} (${u.CODE_NO}), IS_HIDDEN=${u.IS_HIDDEN}, DEL_YN=${u.DEL_YN}`);
        }
    });

    conn.release();
    process.exit(0);
}

checkPastHidden().catch(e => { console.error(e); process.exit(1); });
