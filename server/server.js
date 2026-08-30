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

// Helper: 주소록(CWTB_USER)에 정식 등록된 새참자를 faithon_newcomer에서 자동 삭제/정리
async function syncNewcomersWithAddressBook(conn, activeYear) {
    try {
        const newcomers = await conn.query(`SELECT id, name, phone, COALESCE(area_code, temp_area) as area_code FROM faithon_newcomer`);
        if (!newcomers || newcomers.length === 0) return;

        for (const nc of newcomers) {
            const cleanPhone = (nc.phone || '').replace(/[^0-9]/g, '');
            let matchedCode = null;

            if (cleanPhone.length >= 10) {
                const res = await conn.query(`
                    SELECT CODE_NO FROM CWTB_USER 
                    WHERE YEAR = ? 
                      AND DEL_YN = 'N' 
                      AND REPLACE(REPLACE(PHONE, '-', ''), ' ', '') = ?
                    LIMIT 1
                `, [activeYear, cleanPhone]);
                if (res && res.length > 0) matchedCode = res[0].CODE_NO;
            }

            if (!matchedCode && nc.name && nc.area_code) {
                const res = await conn.query(`
                    SELECT CODE_NO FROM CWTB_USER 
                    WHERE YEAR = ? 
                      AND DEL_YN = 'N' 
                      AND NAME = ? 
                      AND AREA_CODE = ?
                    LIMIT 1
                `, [activeYear, nc.name.trim(), nc.area_code.trim()]);
                if (res && res.length > 0) matchedCode = res[0].CODE_NO;
            }

            if (matchedCode) {
                console.log(`[Auto-Sync] 새참자 '${nc.name}'(${nc.area_code}구역)이 주소록(코드: ${matchedCode})에 정식 등록되어 새참자 테이블에서 자동 정리합니다.`);
                // 과거 새참자 출석 기록을 정식 코드_NO로 이관
                await conn.query(`
                    UPDATE faithon_attendance 
                    SET member_code = ? 
                    WHERE member_code = ?
                `, [matchedCode, `NC_${nc.id}`]).catch(() => {});

                // 새참자 테이블에서 삭제
                await conn.query(`DELETE FROM faithon_newcomer WHERE id = ?`, [nc.id]);
            }
        }
    } catch (e) {
        console.error("syncNewcomersWithAddressBook error:", e);
    }
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

        // 2. 관리자 권한 확인 (WEB_ADMIN_PHONES, CWTB_ADMIN 테이블 대조)
        let isAdmin = false;
        try {
            const phoneCheck = await conn.query(`
                SELECT * FROM WEB_ADMIN_PHONES 
                WHERE REPLACE(REPLACE(phone, '-', ''), ' ', '') = ?
                LIMIT 1
            `, [cleanPhone]);
            if (phoneCheck && phoneCheck.length > 0) isAdmin = true;

            const adminCheck = await conn.query(`
                SELECT * FROM CWTB_ADMIN 
                WHERE NAME = ?
                LIMIT 1
            `, [user.NAME]);
            if (adminCheck && adminCheck.length > 0) isAdmin = true;
        } catch (e) {
            console.error("Admin check query error:", e);
        }

        if (effectivePosition.includes('관리자') || effectivePosition.includes('봉사부장') || effectivePosition.includes('사목사') || effectivePosition.includes('목사') || effectivePosition.includes('전도사')) {
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

// 2. 최신 활성 연도 구역별 성도 목록 조회 (직분순 및 이름순 정렬 + 해당 구역 새참자 포함)
app.get('/api/members', async (req, res) => {
    const areaCode = req.query.areaCode;
    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = await getActiveYear(conn);
        
        // 주소록에 등록된 새참자 자동 동기화
        await syncNewcomersWithAddressBook(conn, activeYear);

        // 2-1. 정규 성도 조회 (예비명단 제외)
        let query = `
            SELECT u.CODE_NO, u.NAME, 
                   COALESCE(pa.POSITION, u.POSITION, '성도') AS POSITION, 
                   u.AREA_CODE, u.PHONE, u.PIC,
                   FALSE as is_newcomer
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
        
        const regularMembers = await conn.query(query, params);

        // 2-2. 해당 구역 새참자 목록 조회하여 함께 포함
        let ncQuery = `SELECT id, name, phone, COALESCE(area_code, temp_area) as area_code, memo, registered_at FROM faithon_newcomer`;
        const ncParams = [];
        if (areaCode) {
            ncQuery += ` WHERE (area_code = ? OR temp_area = ?)`;
            ncParams.push(areaCode, areaCode);
        }
        ncQuery += ` ORDER BY name ASC`;
        const newcomers = await conn.query(ncQuery, ncParams);

        const newcomerMembers = newcomers.map(nc => ({
            CODE_NO: `NC_${nc.id}`,
            NAME: nc.name,
            POSITION: '새참자',
            AREA_CODE: nc.area_code,
            PHONE: nc.phone,
            PIC: null,
            is_newcomer: true,
            newcomer_id: nc.id
        }));

        // 정규 성도 뒤에 새참자 병합
        const allMembers = [...regularMembers, ...newcomerMembers];

        res.json({ 
            success: true, 
            data: allMembers, 
            regular_count: regularMembers.length,
            newcomer_count: newcomerMembers.length,
            active_year: activeYear 
        });
    } catch (err) {
        console.error("Error fetching members:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// ==========================================
// 새참자(Newcomer) 전용 API Routes
// ==========================================

// 새참자 목록 조회
app.get('/api/newcomers', async (req, res) => {
    const areaCode = req.query.areaCode;
    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = await getActiveYear(conn);
        await syncNewcomersWithAddressBook(conn, activeYear);

        let query = `
            SELECT nc.id, nc.name, nc.phone, COALESCE(nc.area_code, nc.temp_area) as area_code, nc.memo, nc.registered_at,
                   (SELECT COUNT(*) FROM faithon_attendance a WHERE a.member_code = CONCAT('NC_', nc.id) AND a.is_attended = TRUE) as attendance_count
            FROM faithon_newcomer nc
        `;
        const params = [];
        if (areaCode) {
            query += ` WHERE (nc.area_code = ? OR nc.temp_area = ?)`;
            params.push(areaCode, areaCode);
        }
        query += ` ORDER BY nc.registered_at DESC, nc.name ASC`;

        const newcomers = await conn.query(query, params);
        res.json({ success: true, data: newcomers });
    } catch (err) {
        console.error("Error fetching newcomers:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 새참자 등록 (중복 방지 & 주소록 존재 여부 검사)
app.post('/api/newcomers', async (req, res) => {
    const { name, phone, area_code, memo, created_by } = req.body;
    if (!name || !area_code) {
        return res.status(400).json({ success: false, error: '이름과 구역은 필수 항목입니다.' });
    }

    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = await getActiveYear(conn);

        // 1. 해당 구역 내 동일 이름 중복 등록 여부 확인
        const dup = await conn.query(`
            SELECT id FROM faithon_newcomer 
            WHERE name = ? AND (area_code = ? OR temp_area = ?)
        `, [name.trim(), area_code.trim(), area_code.trim()]);

        if (dup && dup.length > 0) {
            return res.status(400).json({ success: false, error: `이미 ${area_code}구역에 등록된 동일한 이름의 새참자(${name})가 존재합니다.` });
        }

        // 2. 이미 주소록(CWTB_USER)에 등록된 성도인지 확인
        const inUser = await conn.query(`
            SELECT CODE_NO FROM CWTB_USER 
            WHERE YEAR = ? AND DEL_YN = 'N' AND NAME = ? AND AREA_CODE = ?
        `, [activeYear, name.trim(), area_code.trim()]);

        if (inUser && inUser.length > 0) {
            return res.status(400).json({ success: false, error: `'${name}' 성도는 이미 ${activeYear}년도 주소록(${area_code}구역)에 정식 등록되어 있습니다.` });
        }

        // 3. 새참자 등록
        const insertRes = await conn.query(`
            INSERT INTO faithon_newcomer (name, phone, area_code, memo, created_by)
            VALUES (?, ?, ?, ?, ?)
        `, [name.trim(), phone ? phone.trim() : null, area_code.trim(), memo ? memo.trim() : null, created_by || null]);

        res.json({ success: true, id: insertRes.insertId, message: `'${name}' 새참자가 ${area_code}구역에 등록되었습니다.` });
    } catch (err) {
        console.error("Error creating newcomer:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 새참자 수정
app.put('/api/newcomers/:id', async (req, res) => {
    const id = req.params.id;
    const { name, phone, area_code, memo } = req.body;
    let conn;
    try {
        conn = await db.pool.getConnection();
        await conn.query(`
            UPDATE faithon_newcomer
            SET name = ?, phone = ?, area_code = ?, memo = ?
            WHERE id = ?
        `, [name.trim(), phone ? phone.trim() : null, area_code.trim(), memo ? memo.trim() : null, id]);

        res.json({ success: true, message: '새참자 정보가 수정되었습니다.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 새참자 삭제 (해당 구역장이 삭제)
app.delete('/api/newcomers/:id', async (req, res) => {
    const id = req.params.id;
    let conn;
    try {
        conn = await db.pool.getConnection();
        await conn.query(`DELETE FROM faithon_newcomer WHERE id = ?`, [id]);
        res.json({ success: true, message: '새참자가 삭제되었습니다.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// ==========================================
// 예비명단(Reserve) 전용 API Routes
// ==========================================

// 예비명단 조회
app.get('/api/reserve', async (req, res) => {
    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = await getActiveYear(conn);

        const rows = await conn.query(`
            SELECT r.id, r.member_code, r.original_area, r.reason, r.added_at,
                   u.NAME as name, u.PHONE as phone, u.POSITION as position
            FROM faithon_reserve r
            LEFT JOIN CWTB_USER u ON r.member_code = u.CODE_NO AND u.YEAR = ?
            ORDER BY r.added_at DESC
        `, [activeYear]);

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("Error fetching reserve list:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 예비명단 추가 (관리자 전용)
app.post('/api/reserve', async (req, res) => {
    const { member_code, original_area, reason } = req.body;
    if (!member_code) {
        return res.status(400).json({ success: false, error: '성도 고유 코드가 필요합니다.' });
    }

    let conn;
    try {
        conn = await db.pool.getConnection();
        await conn.query(`
            INSERT INTO faithon_reserve (member_code, original_area, reason)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE original_area = ?, reason = ?
        `, [member_code, original_area || null, reason || null, original_area || null, reason || null]);

        res.json({ success: true, message: '예비명단으로 이동되었습니다.' });
    } catch (err) {
        console.error("Error adding to reserve:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 예비명단에서 구역으로 복귀 (관리자 전용)
app.delete('/api/reserve/:member_code', async (req, res) => {
    const member_code = req.params.member_code;
    let conn;
    try {
        conn = await db.pool.getConnection();
        await conn.query(`DELETE FROM faithon_reserve WHERE member_code = ?`, [member_code]);
        res.json({ success: true, message: '구역으로 복귀되었습니다.' });
    } catch (err) {
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
