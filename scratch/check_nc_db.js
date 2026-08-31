const { pool } = require('../server/db');

async function checkNC() {
    let conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM faithon_newcomer');
    console.log(`Total in faithon_newcomer: ${rows.length}`);
    rows.forEach(r => console.log(`  ID ${r.id}: [${r.area_code}구역] ${r.name} (인도: ${r.guide_name})`));
    conn.release();
    process.exit(0);
}
checkNC().catch(e => { console.error(e); process.exit(1); });
