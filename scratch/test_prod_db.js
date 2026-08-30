const mariadb = require('mariadb');
require('dotenv').config();

const pool = mariadb.createPool({
    host: process.env.DB_HOST || 'jbchcw.com',
    port: process.env.DB_PORT || 3307,
    user: process.env.DB_USER || 'changwon',
    password: process.env.DB_PASSWORD || 'Changwon0691!',
    database: process.env.DB_NAME || 'jbchcwDB',
    connectionLimit: 1
});

async function test() {
    let conn;
    try {
        conn = await pool.getConnection();
        console.log("Connected to DB!");
        
        const rows = await conn.query("SELECT MAX(CAST(YEAR AS UNSIGNED)) as max_year FROM CWTB_USER WHERE DEL_YN = 'N'");
        console.log("Max year in CWTB_USER:", rows[0].max_year);
        
        const users = await conn.query("SELECT CODE_NO, NAME, PHONE, YEAR FROM CWTB_USER WHERE YEAR = ? LIMIT 5", [rows[0].max_year]);
        console.log("Sample users in max year:", users);
        
    } catch (err) {
        console.error("DB Error:", err);
    } finally {
        if (conn) conn.release();
        process.exit();
    }
}

test();
