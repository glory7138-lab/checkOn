const { pool } = require('../server/db');

async function inspectAdminTables() {
    let conn = await pool.getConnection();

    console.log('--- CWTB_ADMIN ---');
    try {
        const adminCols = await conn.query("SHOW COLUMNS FROM CWTB_ADMIN");
        console.log('CWTB_ADMIN cols:', adminCols.map(c => `${c.Field} (${c.Type})`));
        const admins = await conn.query("SELECT * FROM CWTB_ADMIN");
        console.log('CWTB_ADMIN rows:', admins);
    } catch (e) { console.error('CWTB_ADMIN error:', e.message); }

    console.log('\n--- WEB_ADMIN_PHONES ---');
    try {
        const phoneCols = await conn.query("SHOW COLUMNS FROM WEB_ADMIN_PHONES");
        console.log('WEB_ADMIN_PHONES cols:', phoneCols.map(c => `${c.Field} (${c.Type})`));
        const phones = await conn.query("SELECT * FROM WEB_ADMIN_PHONES");
        console.log('WEB_ADMIN_PHONES rows:', phones);
    } catch (e) { console.error('WEB_ADMIN_PHONES error:', e.message); }

    console.log('\n--- WEB_ADMIN ---');
    try {
        const webAdminCols = await conn.query("SHOW COLUMNS FROM WEB_ADMIN");
        console.log('WEB_ADMIN cols:', webAdminCols.map(c => `${c.Field} (${c.Type})`));
        const webAdmins = await conn.query("SELECT * FROM WEB_ADMIN");
        console.log('WEB_ADMIN rows:', webAdmins);
    } catch (e) { console.error('WEB_ADMIN error:', e.message); }

    conn.release();
    process.exit(0);
}

inspectAdminTables().catch(e => { console.error(e); process.exit(1); });
