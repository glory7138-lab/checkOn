const { pool } = require('../server/db');

async function checkAllFaithonTables() {
    let conn = await pool.getConnection();

    console.log('Connected to DB Host:', process.env.DB_HOST, 'Database:', process.env.DB_NAME);

    const tables = await conn.query("SHOW TABLES LIKE 'faithon_%'");
    console.log('\n--- FaithOn Project Custom Tables in jbchcwDB ---');
    for (const t of tables) {
        const tableName = Object.values(t)[0];
        const cnt = await conn.query(`SELECT COUNT(*) as c FROM ${tableName}`);
        console.log(`  Table '${tableName}': ${cnt[0].c} rows`);
    }

    const cwtbUser = await conn.query("SELECT COUNT(*) as c FROM CWTB_USER WHERE YEAR='2026' AND DEL_YN='N'");
    console.log(`\nReference Table 'CWTB_USER' (2026, DEL_YN='N'): ${cwtbUser[0].c} members`);

    conn.release();
    process.exit(0);
}

checkAllFaithonTables().catch(e => { console.error(e); process.exit(1); });
