const db = require('../server/db');

async function checkDeaconAndPep() {
    let conn;
    try {
        conn = await db.pool.getConnection();
        const deacons = await conn.query('SELECT * FROM CWTB_DEACON LIMIT 10');
        console.log('CWTB_DEACON sample:', deacons);

        const deaconsCount = await conn.query('SELECT COUNT(*) as cnt FROM CWTB_DEACON WHERE YEAR = 2026 OR YEAR = 2025');
        console.log('CWTB_DEACON count:', deaconsCount);

        const pep = await conn.query('SELECT * FROM CWTB_PEP LIMIT 20');
        console.log('CWTB_PEP sample:', pep);

        const pepPositions = await conn.query('SELECT DISTINCT POSITION FROM CWTB_PEP');
        console.log('CWTB_PEP positions:', pepPositions);

        const depts = await conn.query('SELECT * FROM CWTB_DEPT LIMIT 10');
        console.log('CWTB_DEPT sample:', depts);

    } catch (e) {
        console.error(e);
    } finally {
        if (conn) conn.release();
        process.exit(0);
    }
}

checkDeaconAndPep();
