const db = require('../server/db');

async function inspectTables() {
    let conn;
    try {
        conn = await db.pool.getConnection();
        const tables = await conn.query('SHOW TABLES');
        console.log('Tables:', tables);

        const userCols = await conn.query('DESCRIBE CWTB_USER');
        console.log('CWTB_USER columns:', userCols);

        // Check other CWTB_ tables
        for (const t of tables) {
            const tableName = Object.values(t)[0];
            if (tableName.startsWith('CWTB') || tableName.startsWith('faithon') || tableName.includes('pos') || tableName.includes('jik')) {
                console.log(`\nTable ${tableName}:`);
                const cols = await conn.query(`DESCRIBE ${tableName}`);
                console.log(cols.map(c => c.Field));
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) conn.release();
        process.exit(0);
    }
}

inspectTables();
