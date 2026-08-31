const { pool } = require('../server/db');

async function initTable() {
    let conn = await pool.getConnection();

    await conn.query(`
        CREATE TABLE IF NOT EXISTS faithon_admin_passwords (
            phone VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            salt VARCHAR(100) NOT NULL,
            must_change_password BOOLEAN DEFAULT TRUE,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('faithon_admin_passwords table created successfully.');
    conn.release();
    process.exit(0);
}

initTable().catch(e => { console.error(e); process.exit(1); });
