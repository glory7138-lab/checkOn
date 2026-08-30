const db = require('../server/db');

async function testPositionQuery() {
    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = '2026';

        const sql = `
            SELECT u.CODE_NO, u.NAME, u.AREA_CODE,
                   pa.POSITION as pa_pos,
                   pep.POSITION as pep_pos,
                   COALESCE(
                       pa.POSITION,
                       CASE 
                           WHEN pep.POSITION IN ('담임목사', '목사', '부목사', '전도사', '집사') THEN pep.POSITION
                           WHEN d.NAME IS NOT NULL THEN '집사'
                           ELSE NULL 
                       END,
                       u.POSITION,
                       '성도'
                   ) AS final_pos
            FROM CWTB_USER u
            LEFT JOIN CWTB_PA pa ON u.NAME = pa.NAME AND pa.YEAR = ?
            LEFT JOIN (
                SELECT NAME, POSITION 
                FROM CWTB_PEP 
                WHERE (YEAR = ? OR YEAR = '2025') 
                  AND POSITION IN ('담임목사', '목사', '부목사', '전도사', '집사')
                GROUP BY NAME
            ) pep ON u.NAME = pep.NAME
            LEFT JOIN (
                SELECT DISTINCT NAME FROM CWTB_DEACON WHERE NAME IS NOT NULL
            ) d ON u.NAME = d.NAME
            WHERE u.YEAR = ? AND u.DEL_YN = 'N' AND u.IS_HIDDEN = 'N'
              AND (pa.POSITION IS NOT NULL OR pep.POSITION IS NOT NULL OR d.NAME IS NOT NULL)
            ORDER BY CAST(u.AREA_CODE AS UNSIGNED) ASC, u.NAME ASC
        `;

        const rows = await conn.query(sql, [activeYear, activeYear, activeYear]);
        console.log(`Found ${rows.length} members with officer/clergy positions:`);
        console.table(rows.map(r => ({
            name: r.NAME,
            area: r.AREA_CODE,
            pa: r.pa_pos,
            pep: r.pep_pos,
            final: r.final_pos
        })));

    } catch (e) {
        console.error(e);
    } finally {
        if (conn) conn.release();
        process.exit(0);
    }
}

testPositionQuery();
