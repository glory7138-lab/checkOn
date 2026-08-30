const mariadb = require('mariadb');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10
});

async function initializeTables() {
    let conn;
    try {
        conn = await pool.getConnection();
        
        // 1. 출석 기록 테이블
        await conn.query(`
            CREATE TABLE IF NOT EXISTS faithon_attendance (
                id INT AUTO_INCREMENT PRIMARY KEY,
                member_code VARCHAR(255) NOT NULL,
                service_date DATE NOT NULL,
                service_type VARCHAR(50) NOT NULL, -- 'sunday' or 'wednesday'
                is_attended BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_attendance (member_code, service_date, service_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 2. 예비명단 테이블
        await conn.query(`
            CREATE TABLE IF NOT EXISTS faithon_reserve (
                id INT AUTO_INCREMENT PRIMARY KEY,
                member_code VARCHAR(255) NOT NULL UNIQUE,
                original_area VARCHAR(255),
                reason VARCHAR(500),
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 3. 새참자 테이블
        await conn.query(`
            CREATE TABLE IF NOT EXISTS faithon_newcomer (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                guide_name VARCHAR(100) NULL,
                phone VARCHAR(100),
                area_code VARCHAR(100) NOT NULL,
                memo VARCHAR(255),
                created_by VARCHAR(100),
                registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_newcomer (name, area_code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 혹시 기존 테이블에 신규 컬럼이 없으면 자동 추가
        try {
            await conn.query(`ALTER TABLE faithon_newcomer ADD COLUMN guide_name VARCHAR(100) NULL AFTER name`);
        } catch (e) {}
        try {
            await conn.query(`ALTER TABLE faithon_newcomer ADD COLUMN area_code VARCHAR(100) NULL AFTER phone`);
        } catch (e) {}
        try {
            await conn.query(`ALTER TABLE faithon_newcomer ADD COLUMN memo VARCHAR(255) NULL AFTER area_code`);
        } catch (e) {}
        try {
            await conn.query(`ALTER TABLE faithon_newcomer ADD COLUMN created_by VARCHAR(100) NULL AFTER memo`);
        } catch (e) {}
        try {
            await conn.query(`ALTER TABLE faithon_newcomer ADD UNIQUE KEY unique_newcomer (name, area_code)`);
        } catch (e) {}

        console.log("[FaithOn DB] Initialized custom tables successfully.");
    } catch (err) {
        console.error("[FaithOn DB] Error initializing tables:", err);
    } finally {
        if (conn) conn.release();
    }
}

// 애플리케이션 시작 시 테이블 생성 시도
initializeTables();

module.exports = {
    pool
};
