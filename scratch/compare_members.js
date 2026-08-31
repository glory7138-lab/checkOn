const fs = require('fs');
const { pool } = require('../server/db');

async function compare() {
    const excelMembers = JSON.parse(fs.readFileSync('scratch_excel_members.json', 'utf8'));
    let conn = await pool.getConnection();
    const dbUsers = await conn.query("SELECT CODE_NO, NAME, AREA_CODE FROM CWTB_USER WHERE YEAR = '2026' AND DEL_YN = 'N'");
    console.log('DB Users (2026) count:', dbUsers.length);
    
    const matched = [];
    const unmatched = [];
    
    const dbMapAreaName = {};
    const dbMapName = {};
    dbUsers.forEach(u => {
        const area = (u.AREA_CODE || '').trim();
        const name = (u.NAME || '').trim();
        const k = area + '_' + name;
        if (!dbMapAreaName[k]) dbMapAreaName[k] = [];
        dbMapAreaName[k].push(u);

        if (!dbMapName[name]) dbMapName[name] = [];
        dbMapName[name].push(u);
    });

    excelMembers.forEach(em => {
        const k = em.area + '_' + em.name;
        if (dbMapAreaName[k] && dbMapAreaName[k].length === 1) {
            matched.push({ excel: em, db: dbMapAreaName[k][0] });
        } else if (dbMapAreaName[k] && dbMapAreaName[k].length > 1) {
            console.log('Multiple match for area+name:', k, dbMapAreaName[k]);
            matched.push({ excel: em, db: dbMapAreaName[k][0] });
        } else {
            unmatched.push(em);
        }
    });

    console.log('Matched count:', matched.length);
    console.log('Unmatched count:', unmatched.length);
    if (unmatched.length > 0) {
        console.log('Unmatched items:', unmatched);
        unmatched.forEach(um => {
            console.log('Lookup by name only for', um.name, ':', dbMapName[um.name]);
        });
    }

    conn.release();
    process.exit(0);
}
compare().catch(e => { console.error(e); process.exit(1); });
