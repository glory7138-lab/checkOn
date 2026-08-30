const db = require('../server/db');

async function testAdmin() {
    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = '2026';

        console.log("--- 1. Testing Admin Query ---");
        const query1 = `
            SELECT DISTINCT 
                COALESCE(u.CODE_NO, CONCAT('ADM_', a.SEQ)) as code_no,
                a.NAME as name,
                COALESCE(u.PHONE, wp.phone, '-') as phone,
                COALESCE(pa.POSITION, u.POSITION, '관리자') as position,
                COALESCE(u.AREA_CODE, '관리부서') as area_code,
                a.SEQ as seq
            FROM CWTB_ADMIN a
            LEFT JOIN CWTB_USER u ON a.NAME = u.NAME AND u.YEAR = ? AND u.DEL_YN = 'N'
            LEFT JOIN CWTB_PA pa ON a.NAME = pa.NAME AND pa.YEAR = ?
            LEFT JOIN WEB_ADMIN_PHONES wp ON REPLACE(REPLACE(u.PHONE, '-', ''), ' ', '') = wp.phone OR a.NAME = wp.name
            ORDER BY a.SEQ ASC, a.NAME ASC
        `;
        const admins = await conn.query(query1, [activeYear, activeYear]);
        console.log("Admin list:", admins);

        console.log("\n--- 2. Testing Candidates Query ---");
        const query2 = `
            SELECT u.CODE_NO, u.NAME, 
                   COALESCE(pa.POSITION, u.POSITION, '성도') AS POSITION, 
                   u.AREA_CODE, u.PHONE
            FROM CWTB_USER u
            LEFT JOIN CWTB_PA pa ON u.NAME = pa.NAME AND pa.YEAR = ?
            LEFT JOIN CWTB_ADMIN a ON u.NAME = a.NAME
            WHERE u.YEAR = ? 
              AND u.DEL_YN = 'N' 
              AND u.IS_HIDDEN = 'N'
              AND a.NAME IS NULL
            ORDER BY CAST(u.AREA_CODE AS UNSIGNED) ASC, u.NAME ASC LIMIT 10
        `;
        const candidates = await conn.query(query2, [activeYear, activeYear]);
        console.log("Candidates count:", candidates.length);
        console.log("First 3 candidates:", candidates.slice(0, 3));

    } catch (e) {
        console.error("Error occurred:", e);
    } finally {
        if (conn) conn.release();
        process.exit(0);
    }
}

testAdmin();
