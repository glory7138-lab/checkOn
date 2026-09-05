const mariadb = require('mariadb');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

let dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10
};

if (process.env.DATABASE_URL) {
    try {
        const url = new URL(process.env.DATABASE_URL);
        dbConfig = {
            host: url.hostname,
            port: url.port || 3306,
            user: url.username,
            password: decodeURIComponent(url.password),
            database: url.pathname.substring(1),
            connectionLimit: 10
        };
    } catch (e) {
        console.error("[FaithOn DB] Failed to parse DATABASE_URL:", e.message);
    }
}

const pool = mariadb.createPool(dbConfig);

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
                registered_code VARCHAR(255) NULL,
                is_registered_member BOOLEAN DEFAULT FALSE,
                is_hidden BOOLEAN DEFAULT FALSE,
                registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            await conn.query(`ALTER TABLE faithon_newcomer ADD COLUMN registered_code VARCHAR(255) NULL AFTER created_by`);
        } catch (e) {}
        try {
            await conn.query(`ALTER TABLE faithon_newcomer ADD COLUMN is_registered_member BOOLEAN DEFAULT FALSE AFTER registered_code`);
        } catch (e) {}
        try {
            await conn.query(`ALTER TABLE faithon_newcomer ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE AFTER is_registered_member`);
        } catch (e) {}
        try {
            await conn.query(`ALTER TABLE faithon_newcomer DROP INDEX unique_newcomer`);
        } catch (e) {}

        // 4. 교회학교 출석(인원수) 테이블 (유초등부, 중고등부 등)
        await conn.query(`
            CREATE TABLE IF NOT EXISTS faithon_school_attendance (
                id INT AUTO_INCREMENT PRIMARY KEY,
                dept_code VARCHAR(50) NOT NULL, -- 'elementary'(유초등부), 'youth'(중고등부)
                dept_name VARCHAR(100) NOT NULL,
                service_date DATE NOT NULL,
                attend_count INT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_school_att (dept_code, service_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 5. 관리자 비밀번호 및 최초 변경 여부 관리 테이블
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

        // 6. 대집회 마스터 테이블
        await conn.query(`
            CREATE TABLE IF NOT EXISTS faithon_special_gatherings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(150) NOT NULL,
                instructor VARCHAR(100) DEFAULT '',
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                selected_dates LONGTEXT NOT NULL, -- JSON array of dates e.g. ["2026-09-07", ...]
                is_active BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 7. 대집회 출석 기록 테이블 (완전 분리)
        await conn.query(`
            CREATE TABLE IF NOT EXISTS faithon_special_attendance (
                id INT AUTO_INCREMENT PRIMARY KEY,
                gathering_id INT NOT NULL,
                service_date DATE NOT NULL,
                member_code VARCHAR(255) NOT NULL,
                member_type VARCHAR(50) DEFAULT 'REGULAR', -- 'REGULAR'(기존성도/정규새참자) or 'SPECIAL_NEW'(대집회전용새참자)
                is_attended BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_special_att (gathering_id, service_date, member_code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 8. 대집회 전용 새참자 테이블 (기존 명부와 완전 분리)
        await conn.query(`
            CREATE TABLE IF NOT EXISTS faithon_special_newcomers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                gathering_id INT NOT NULL,
                area_code VARCHAR(100) NOT NULL,
                name VARCHAR(100) NOT NULL,
                guide_name VARCHAR(100) NULL,
                phone VARCHAR(100) NULL,
                memo VARCHAR(255) NULL,
                created_by VARCHAR(100) NULL,
                registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

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
