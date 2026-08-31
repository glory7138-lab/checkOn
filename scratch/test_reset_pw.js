const { pool } = require('../server/db');

async function testResetPasswordAPI() {
    let conn = await pool.getConnection();

    // Reset password for an admin e.g. 김형석 (01077074222)
    const phone = '01077074222';
    const name = '김형석';

    const crypto = require('crypto');
    function hashPassword(password, salt) {
        return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const defaultHash = hashPassword('069100', salt);

    await conn.query(`
        INSERT INTO faithon_admin_passwords (phone, name, password_hash, salt, must_change_password)
        VALUES (?, ?, ?, ?, TRUE)
        ON DUPLICATE KEY UPDATE 
            password_hash = VALUES(password_hash),
            salt = VALUES(salt),
            must_change_password = TRUE
    `, [phone, name, defaultHash, salt]);

    const row = await conn.query("SELECT * FROM faithon_admin_passwords WHERE phone = ?", [phone]);
    console.log('Admin Password Reset Row:', row[0]);

    conn.release();
    process.exit(0);
}

testResetPasswordAPI().catch(e => { console.error(e); process.exit(1); });
