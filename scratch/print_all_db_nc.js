const { pool } = require('../server/db');

async function test() {
    let conn = await pool.getConnection();
    const rows = await conn.query('SELECT id, name, guide_name, area_code, registered_code, is_registered_member FROM faithon_newcomer ORDER BY id');
    console.log(`--- Current faithon_newcomer (Total: ${rows.length}) ---`);
    rows.forEach(r => {
        const regStr = r.is_registered_member ? `성도등재(${r.registered_code})` : '새참자';
        console.log(`  ID ${r.id}: [${r.area_code}구역] 새참자: ${r.name} | 인도자: ${r.guide_name} (${regStr})`);
    });
    conn.release();
    process.exit(0);
}

test().catch(e => { console.error(e); process.exit(1); });
