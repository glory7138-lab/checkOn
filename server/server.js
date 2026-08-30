const express = require('express');
const path = require('path');
const db = require('./db'); // Initialize DB and get pool

const app = express();
const PORT = process.env.PORT || 3047;

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json()); // Parse JSON bodies

// Helper: 현시점 최신 활성 연도(Active Year) 동적 조회
async function getActiveYear(conn) {
    if (process.env.ACTIVE_YEAR) return process.env.ACTIVE_YEAR;
    try {
        const rows = await conn.query("SELECT MAX(CAST(YEAR AS UNSIGNED)) as max_year FROM CWTB_USER WHERE DEL_YN = 'N'");
        if (rows && rows.length > 0 && rows[0].max_year) {
            return String(rows[0].max_year);
        }
    } catch (e) {
        console.error("getActiveYear error:", e);
    }
    return '2026';
}

// ==========================================
// API Routes
// ==========================================

// 0. 로그인 (휴대폰 번호 기반 & 권한 식별)
app.post('/api/auth/login', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ success: false, error: '휴대폰 번호를 입력해주세요.' });
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
        return res.status(400).json({ success: false, error: '올바른 휴대폰 번호를 입력해주세요.' });
    }

    // 마스터 최고 관리자 번호
    if (cleanPhone === '01077074222') {
        return res.json({
            success: true,
            user: {
                name: '최고 관리자',
                phone: cleanPhone,
                role: 'admin',
                scope_type: 'all',
                scope_code: null,
                position: '총괄관리자'
            }
        });
    }

    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = await getActiveYear(conn);

        // 1. CWTB_USER에서 최신 활성 연도 성도 번호 매칭 (DEL_YN = 'N')
        const users = await conn.query(`
            SELECT u.CODE_NO, u.NAME, u.PHONE, u.AREA_CODE, u.POSITION, u.FELLOW_DEPT, u.SERVICE_DEPT,
                   pa.POSITION as PA_POSITION, pa.AREA_CODE as PA_AREA_CODE
            FROM CWTB_USER u
            LEFT JOIN CWTB_PA pa ON u.NAME = pa.NAME AND pa.YEAR = ?
            WHERE REPLACE(REPLACE(u.PHONE, '-', ''), ' ', '') = ?
              AND u.YEAR = ?
              AND u.DEL_YN = 'N'
            LIMIT 1
        `, [activeYear, cleanPhone, activeYear]);

        if (!users || users.length === 0) {
            return res.status(401).json({ success: false, error: `${activeYear}년도 주소록에 등록되지 않은 휴대폰 번호입니다.` });
        }

        const user = users[0];
        const effectivePosition = (user.PA_POSITION || user.POSITION || '성도').trim();
        const effectiveArea = (user.PA_AREA_CODE ? user.PA_AREA_CODE.replace(/[^0-9]/g, '') : (user.AREA_CODE ? user.AREA_CODE.trim() : '11'));

        // 2. 관리자 권한 확인 (CWTB_ADMIN 테이블 혹은 직분이 관리자/부장/총무/목사/전도사 등)
        let isAdmin = false;
        try {
            const adminCheck = await conn.query(`
                SELECT * FROM CWTB_ADMIN WHERE REPLACE(REPLACE(PHONE, '-', ''), ' ', '') = ? LIMIT 1
            `, [cleanPhone]);
            if (adminCheck && adminCheck.length > 0) isAdmin = true;
        } catch (e) {}

        if (effectivePosition.includes('관리자') || effectivePosition.includes('봉사부장') || effectivePosition.includes('총무') || effectivePosition.includes('사목사') || effectivePosition.includes('목사') || effectivePosition.includes('전도사')) {
            isAdmin = true;
        }

        let role = 'member';
        let scope_type = 'area';
        let scope_code = effectiveArea;

        if (isAdmin) {
            role = 'admin';
            scope_type = 'all';
            scope_code = null;
        } else if (effectivePosition.includes('구역장') || effectivePosition.includes('조장') || effectivePosition.includes('부구역장') || effectivePosition.includes('조총무') || effectivePosition.includes('서기')) {
            role = 'leader';
            scope_type = 'area';
            scope_code = effectiveArea;
        }

        res.json({
            success: true,
            user: {
                code_no: user.CODE_NO,
                name: user.NAME,
                phone: user.PHONE,
                position: effectivePosition,
                area_code: effectiveArea,
                role,
                scope_type,
                scope_code,
                active_year: activeYear
            }
        });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 1. 전체 구역 목록 조회 (최신 활성 연도 기준)
app.get('/api/areas', async (req, res) => {
    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = await getActiveYear(conn);
        const rows = await conn.query(`
            SELECT DISTINCT AREA_CODE 
            FROM CWTB_USER 
            WHERE YEAR = ?
              AND AREA_CODE IS NOT NULL 
              AND AREA_CODE != '' 
              AND DEL_YN = 'N'
            ORDER BY CAST(AREA_CODE AS UNSIGNED) ASC, AREA_CODE ASC
        `, [activeYear]);
        const areas = rows.map(r => r.AREA_CODE.trim()).filter(Boolean);
        res.json({ success: true, data: areas, active_year: activeYear });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 2. 최신 활성 연도 구역별 성도 목록 조회 (직분순 및 이름순 정렬, 예비명단 제외)
app.get('/api/members', async (req, res) => {
    const areaCode = req.query.areaCode;
    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = await getActiveYear(conn);
        
        let query = `
            SELECT u.CODE_NO, u.NAME, 
                   COALESCE(pa.POSITION, u.POSITION, '성도') AS POSITION, 
                   u.AREA_CODE, u.PHONE, u.PIC
            FROM CWTB_USER u
            LEFT JOIN CWTB_PA pa ON u.NAME = pa.NAME AND pa.YEAR = ?
            LEFT JOIN faithon_reserve r ON u.CODE_NO = r.member_code
            WHERE u.YEAR = ?
              AND r.member_code IS NULL 
              AND u.IS_HIDDEN = 'N' 
              AND u.DEL_YN = 'N'
        `;
        const params = [activeYear, activeYear];
        
        if (areaCode) {
            query += ` AND u.AREA_CODE = ?`;
            params.push(areaCode);
        }
        
        // 직분(구역장 > 부구역장 > 조장 > 조총무 > 서기 > 성도) 및 성명 순 정렬
        query += ` ORDER BY 
            CASE 
                WHEN pa.POSITION LIKE '%구역장%' AND pa.POSITION NOT LIKE '%부%' THEN 1
                WHEN pa.POSITION LIKE '%부구역장%' THEN 2
                WHEN pa.POSITION LIKE '%조장%' THEN 3
                WHEN pa.POSITION LIKE '%조총무%' THEN 4
                WHEN pa.POSITION LIKE '%서기%' THEN 5
                ELSE 6
            END,
            u.NAME ASC
        `;
        
        const members = await conn.query(query, params);
        res.json({ success: true, data: members, active_year: activeYear });
    } catch (err) {
        console.error("Error fetching members:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

app.get('/api/attendance', async (req, res) => {
    const { date, type, areaCode } = req.query;
    let conn;
    try {
        conn = await db.pool.getConnection();
        const query = `
            SELECT a.member_code 
            FROM faithon_attendance a
            JOIN CWTB_USER u ON a.member_code = u.CODE_NO
            WHERE a.service_date = ? 
              AND a.service_type = ? 
              AND a.is_attended = TRUE
              AND u.AREA_CODE = ?
        `;
        const rows = await conn.query(query, [date, type, areaCode]);
        const attendedCodes = rows.map(r => r.member_code);
        res.json({ success: true, data: attendedCodes });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 3. 출석 체크 저장/업데이트
app.post('/api/attendance', async (req, res) => {
    const { date, type, members } = req.body;
    // members: [{ member_code: '...', is_attended: true/false }]
    let conn;
    try {
        conn = await db.pool.getConnection();
        await conn.beginTransaction();

        for (const m of members) {
            await conn.query(`
                INSERT INTO faithon_attendance (member_code, service_date, service_type, is_attended)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE is_attended = ?
            `, [m.member_code, date, type, m.is_attended, m.is_attended]);
        }

        await conn.commit();
        res.json({ success: true, message: '출석이 성공적으로 저장되었습니다.' });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error("Error saving attendance:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

app.listen(PORT, () => {
    console.log(`[FaithOn] Server running at http://localhost:${PORT}`);
});
