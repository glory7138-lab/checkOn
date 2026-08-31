const fs = require('fs');
const { pool } = require('../server/db');

async function migrate0823() {
    const data = JSON.parse(fs.readFileSync('scratch_parsed_0823.json', 'utf8'));
    let conn = await pool.getConnection();

    try {
        console.log('=== Step 1: Cleaning DB tables ===');
        await conn.query(`DELETE FROM faithon_attendance`);
        await conn.query(`DELETE FROM faithon_newcomer`);
        await conn.query(`ALTER TABLE faithon_newcomer AUTO_INCREMENT = 1`);
        console.log('faithon_attendance & faithon_newcomer cleared.');

        // Step 1-2: Ensure unhidden users in 2026 CWTB_USER
        await conn.query("UPDATE CWTB_USER SET IS_HIDDEN = 'N' WHERE YEAR = '2026' AND CODE_NO IN ('111701', '330211', '212251')");
        await conn.query("UPDATE CWTB_USER SET AREA_CODE = '22' WHERE YEAR = '2026' AND NAME = '황보혜'");

        // Load all 2026 CWTB_USER to build map
        const users2026 = await conn.query("SELECT CODE_NO, NAME, AREA_CODE FROM CWTB_USER WHERE YEAR = '2026' AND DEL_YN = 'N'");
        const userMap = {};
        users2026.forEach(u => {
            userMap[u.AREA_CODE.trim() + '_' + u.NAME.trim()] = u.CODE_NO;
        });

        const aliases = {
            '11_이지영': '110411', // 이지영1
            '43_이지영': '432351', // 이지영2
            '31_김한의(군)': '310441', // 김한의
            '22_황보혜': userMap['22_황보혜'] || '411851',
            '41_황보혜': userMap['41_황보혜'] || '411851',
            '41_김종증': userMap['41_김종증'] || '412001',
            '12_민주안': '122241'
        };

        console.log('=== Step 2: Registering 31 Newcomers ===');
        const newcomerItems = data.filter(x => x.type === 'newcomer');
        const newcomerMap = {}; // row -> NC_id

        for (const nc of newcomerItems) {
            const res = await conn.query(`
                INSERT INTO faithon_newcomer (name, guide_name, area_code, memo, created_by, registered_at)
                VALUES (?, ?, ?, ?, ?, '2026-05-01 00:00:00')
            `, [nc.name, nc.guide_name || null, nc.area_code, '엑셀 출석부(20260823) 등록', '관리자']);
            
            const insertId = Number(res.insertId);
            newcomerMap[nc.row] = `NC_${insertId}`;
            console.log(`Registered newcomer: Row ${nc.row} [${nc.area_code}구역] ${nc.name} (인도: ${nc.guide_name}) -> NC_${insertId}`);
        }

        console.log('=== Step 3: Inserting Attendance Records (2025-12-07 ~ 2026-08-23) ===');
        let totalAttCount = 0;
        let unmappedCount = 0;

        for (const item of data) {
            let memberCode = null;
            if (item.type === 'address') {
                const k = item.area_code + '_' + item.name;
                memberCode = userMap[k] || aliases[k];
            } else {
                memberCode = newcomerMap[item.row];
            }

            if (!memberCode) {
                console.error(`Cannot find memberCode for row ${item.row} (${item.area_code} ${item.name})`);
                unmappedCount++;
                continue;
            }

            for (const dateStr of item.attended_dates) {
                await conn.query(`
                    INSERT INTO faithon_attendance (member_code, service_date, service_type, is_attended)
                    VALUES (?, ?, 'sunday', 1)
                    ON DUPLICATE KEY UPDATE is_attended = 1
                `, [memberCode, dateStr]);
                totalAttCount++;
            }
        }

        console.log(`\nSuccessfully inserted ${totalAttCount} attendance records (Unmapped: ${unmappedCount}).`);

        console.log('\n=== Step 4: Verification ===');
        const summary = await conn.query(`
            SELECT DATE_FORMAT(service_date, '%Y-%m-%d') as sdate, COUNT(*) as cnt 
            FROM faithon_attendance 
            WHERE service_type = 'sunday'
            GROUP BY DATE_FORMAT(service_date, '%Y-%m-%d')
            ORDER BY sdate
        `);
        console.log('Attendance count by Sunday in DB:');
        summary.forEach(s => {
            console.log(`  ${s.sdate}: ${s.cnt}명`);
        });

        const totalInDB = await conn.query(`SELECT COUNT(*) as total FROM faithon_attendance`);
        const totalNC = await conn.query(`SELECT COUNT(*) as total FROM faithon_newcomer`);
        console.log(`\nTotal DB attendance records: ${totalInDB[0].total}`);
        console.log(`Total DB registered newcomers: ${totalNC[0].total}`);

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

migrate0823();
