const fs = require('fs');
const { pool } = require('../server/db');

async function checkSync0823() {
    const data = JSON.parse(fs.readFileSync('scratch_parsed_0823.json', 'utf8'));
    let conn = await pool.getConnection();
    
    // Get all CWTB_USER for 2026
    const users2026 = await conn.query("SELECT CODE_NO, NAME, AREA_CODE, IS_HIDDEN FROM CWTB_USER WHERE YEAR = '2026' AND DEL_YN = 'N'");
    const userMap = {};
    users2026.forEach(u => {
        userMap[u.AREA_CODE.trim() + '_' + u.NAME.trim()] = u.CODE_NO;
    });
    
    // Check manual aliases
    const aliases = {
        '11_이지영': '110411', // 이지영1
        '43_이지영': '432351', // 이지영2
        '31_김한의(군)': '310441', // 김한의
        '41_황보혜': userMap['41_황보혜'] || '411851',
        '41_김종증': userMap['41_김종증'] || '412001',
        '12_민주안': '122241'
    };

    let matchedAddress = 0;
    let unmatchedAddress = [];
    
    data.forEach(item => {
        if (item.type === 'address') {
            const k = item.area_code + '_' + item.name;
            if (userMap[k] || aliases[k]) {
                matchedAddress++;
            } else {
                unmatchedAddress.push(item);
            }
        }
    });

    console.log(`Addressbook matched: ${matchedAddress}/${data.filter(x => x.type === 'address').length}`);
    if (unmatchedAddress.length > 0) {
        console.log('Unmatched addressbook items:', unmatchedAddress);
    }
    
    conn.release();
    process.exit(0);
}
checkSync0823().catch(e => { console.error(e); process.exit(1); });
