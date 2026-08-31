const express = require('express');
const path = require('path');
require('dotenv').config();
const db = require('./db'); // Initialize DB and get pool

// BigInt JSON 직렬화 지원 (MariaDB COUNT(*) 등 BigInt 반환 시 오류 방지)
BigInt.prototype.toJSON = function() {
    return Number(this);
};

const app = express();
const PORT = process.env.PORT || 3033;

// CORS 설정 (외부 모듈 의존성 없이 네이티브 처리)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json()); // Parse JSON bodies
app.use(express.static(path.join(__dirname, '../public')));

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
        const newcomers = await conn.query(`SELECT id, name, guide_name, phone, COALESCE(area_code, temp_area) as area_code FROM faithon_newcomer`);
        if (!newcomers || newcomers.length === 0) return;

        for (const nc of newcomers) {
            const cleanPhone = (nc.phone || '').replace(/[^0-9]/g, '');
            let matchedCode = null;

            // 주소록에 '동일 성명' 및 '동일 구역'으로 정식 등록되었을 때만 정확 매칭
            if (nc.name && nc.area_code) {
                const res = await conn.query(`
                    SELECT CODE_NO, NAME, PHONE, AREA_CODE FROM CWTB_USER 
                    WHERE YEAR = ? 
                      AND DEL_YN = 'N' 
                      AND NAME = ? 
                      AND AREA_CODE = ?
                    LIMIT 1
                `, [activeYear, nc.name.trim(), nc.area_code.trim()]);
                
                if (res && res.length > 0) {
                    matchedCode = res[0].CODE_NO;
                }
            }

            if (matchedCode) {
                console.log(`[Auto-Sync] 새참자 '${nc.name}'(${nc.area_code}구역)이 주소록(코드: ${matchedCode})에 정식 등록되어 새참자 테이블에서 자동 정리합니다.`);
                // 과거 새참자 출석 기록을 정식 CODE_NO로 이관
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
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
        return res.status(400).json({ success: false, error: '올바른 휴대폰 번호를 입력해주세요.' });
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

// 1-1. [관리자 전용] 구역별 출석체크 현황(체크 여부 및 출석률) 실시간 조회
app.get('/api/admin/area-attendance-status', async (req, res) => {
    const { date, type } = req.query; // date: '2026-08-30', type: 'sunday' or 'wednesday'
    if (!date || !type) {
        return res.status(400).json({ success: false, error: '날짜(date)와 예배 구분(type)이 필요합니다.' });
    }

    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = await getActiveYear(conn);

        // 1. 전체 구역 목록
        const areaRows = await conn.query(`
            SELECT DISTINCT AREA_CODE 
            FROM CWTB_USER 
            WHERE YEAR = ? AND AREA_CODE IS NOT NULL AND AREA_CODE != '' AND DEL_YN = 'N'
            ORDER BY CAST(AREA_CODE AS UNSIGNED) ASC, AREA_CODE ASC
        `, [activeYear]);
        const areaCodes = areaRows.map(r => r.AREA_CODE.trim()).filter(Boolean);

        // 2. 구역별 총원 (예비명단 제외 정규 성도 수)
        const totalRows = await conn.query(`
            SELECT u.AREA_CODE, COUNT(u.CODE_NO) as total_cnt
            FROM CWTB_USER u
            LEFT JOIN faithon_reserve r ON u.CODE_NO = r.member_code
            WHERE u.YEAR = ? AND u.DEL_YN = 'N' AND u.IS_HIDDEN = 'N' AND r.member_code IS NULL AND u.AREA_CODE IS NOT NULL
            GROUP BY u.AREA_CODE
        `, [activeYear]);
        const totalMap = {};
        totalRows.forEach(r => {
            totalMap[r.AREA_CODE.trim()] = Number(r.total_cnt || 0);
        });

        // 3. 구역별 새참자 수
        const ncRows = await conn.query(`
            SELECT COALESCE(area_code, temp_area) as area_code, COUNT(id) as nc_cnt
            FROM faithon_newcomer
            GROUP BY COALESCE(area_code, temp_area)
        `);
        const ncMap = {};
        ncRows.forEach(r => {
            if (r.area_code) ncMap[r.area_code.trim()] = Number(r.nc_cnt || 0);
        });

        // 4. 해당 날짜/예배 구역별 실제 출석 체크된 인원 수
        const attendRows = await conn.query(`
            SELECT u.AREA_CODE, COUNT(DISTINCT a.member_code) as attend_cnt
            FROM faithon_attendance a
            JOIN CWTB_USER u ON a.member_code = u.CODE_NO
            LEFT JOIN faithon_reserve r ON u.CODE_NO = r.member_code
            WHERE DATE_FORMAT(a.service_date, '%Y-%m-%d') = ? 
              AND a.service_type = ? 
              AND a.is_attended = TRUE
              AND u.YEAR = ?
              AND u.DEL_YN = 'N'
              AND r.member_code IS NULL
            GROUP BY u.AREA_CODE
        `, [date, type, activeYear]);
        const attendMap = {};
        attendRows.forEach(r => {
            attendMap[r.AREA_CODE.trim()] = Number(r.attend_cnt || 0);
        });

        // 4-1. 해당 날짜 새참자 출석 수
        const ncAttendRows = await conn.query(`
            SELECT COALESCE(nc.area_code, nc.temp_area) as area_code, COUNT(DISTINCT a.member_code) as nc_attend_cnt
            FROM faithon_attendance a
            JOIN faithon_newcomer nc ON a.member_code = CONCAT('NC_', nc.id)
            WHERE DATE_FORMAT(a.service_date, '%Y-%m-%d') = ?
              AND a.service_type = ?
              AND a.is_attended = TRUE
            GROUP BY COALESCE(nc.area_code, nc.temp_area)
        `, [date, type]);
        const ncAttendMap = {};
        ncAttendRows.forEach(r => {
            if (r.area_code) ncAttendMap[r.area_code.trim()] = Number(r.nc_attend_cnt || 0);
        });

        // 5. 구역장/부구역장 정보
        const leaderRows = await conn.query(`
            SELECT u.AREA_CODE, u.NAME, pa.POSITION, u.PHONE
            FROM CWTB_USER u
            JOIN CWTB_PA pa ON u.NAME = pa.NAME AND pa.YEAR = ?
            WHERE u.YEAR = ? AND u.DEL_YN = 'N' 
              AND (pa.POSITION LIKE '%구역장%' OR pa.POSITION LIKE '%부구역장%')
            ORDER BY CAST(u.AREA_CODE AS UNSIGNED) ASC, 
                     CASE WHEN pa.POSITION LIKE '%구역장%' AND pa.POSITION NOT LIKE '%부%' THEN 1 ELSE 2 END
        `, [activeYear, activeYear]);

        const leaderMap = {};
        leaderRows.forEach(r => {
            const a = r.AREA_CODE.trim();
            if (!leaderMap[a]) leaderMap[a] = [];
            leaderMap[a].push({ name: r.NAME, position: r.POSITION, phone: r.PHONE });
        });

        // 6. 종합 구역별 출석체크 현황 데이터 생성
        let totalCompletedAreas = 0;
        const list = areaCodes.map(area => {
            const regularTotal = totalMap[area] || 0;
            const ncTotal = ncMap[area] || 0;
            const grandTotal = regularTotal + ncTotal;

            const regularAttend = attendMap[area] || 0;
            const ncAttend = ncAttendMap[area] || 0;
            const grandAttend = regularAttend + ncAttend;

            // 출석체크 완료 여부: 해당 구역에 1명 이상 출석체크 기록이 있는 경우 '완료'
            const isCompleted = grandAttend > 0;
            if (isCompleted) totalCompletedAreas++;

            const rate = grandTotal > 0 ? Math.round((grandAttend / grandTotal) * 100) : 0;

            return {
                area_code: area,
                is_completed: isCompleted,
                total_members: regularTotal,
                newcomer_members: ncTotal,
                grand_total: grandTotal,
                attended_count: regularAttend,
                newcomer_attended_count: ncAttend,
                grand_attended_count: grandAttend,
                rate,
                leaders: leaderMap[area] || []
            };
        });

        res.json({
            success: true,
            data: {
                total_areas: areaCodes.length,
                completed_areas: totalCompletedAreas,
                pending_areas: areaCodes.length - totalCompletedAreas,
                completion_rate: areaCodes.length > 0 ? Math.round((totalCompletedAreas / areaCodes.length) * 100) : 0,
                list
            }
        });
    } catch (err) {
        console.error("Error fetching area attendance status:", err);
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

        // 2-1. 정규 성도 조회 (구역 임원 및 집사/목사/부목사/전도사 직분 연동, 예비명단 제외)
        let query = `
            SELECT u.CODE_NO, u.NAME, u.FELLOW_DEPT,
                   COALESCE(
                       pa.POSITION,
                       CASE 
                           WHEN pep.POSITION IN ('담임목사', '목사', '부목사', '전도사', '집사') THEN pep.POSITION
                           WHEN d.NAME IS NOT NULL THEN '집사'
                           ELSE NULL 
                       END,
                       u.POSITION,
                       '성도'
                   ) AS POSITION, 
                   u.AREA_CODE, u.PHONE, u.PIC,
                   FALSE as is_newcomer
            FROM CWTB_USER u
            LEFT JOIN CWTB_PA pa ON u.NAME = pa.NAME AND pa.YEAR = ?
            LEFT JOIN (
                SELECT NAME, POSITION 
                FROM CWTB_PEP 
                WHERE (YEAR = ? OR YEAR = '2025') 
                  AND POSITION IN ('담임목사', '목사', '부목사', '전도사', '집사')
                GROUP BY NAME
            ) pep ON u.NAME = pep.NAME
            LEFT JOIN (
                SELECT DISTINCT NAME FROM CWTB_DEACON WHERE NAME IS NOT NULL
            ) d ON u.NAME = d.NAME
            LEFT JOIN faithon_reserve r ON u.CODE_NO = r.member_code
            WHERE u.YEAR = ?
              AND r.member_code IS NULL 
              AND u.IS_HIDDEN = 'N' 
              AND u.DEL_YN = 'N'
        `;
        const params = [activeYear, activeYear, activeYear];
        
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
                WHEN pep.POSITION = '담임목사' THEN 6
                WHEN pep.POSITION = '목사' THEN 7
                WHEN pep.POSITION = '부목사' THEN 8
                WHEN pep.POSITION = '전도사' THEN 9
                WHEN pep.POSITION = '집사' OR d.NAME IS NOT NULL THEN 10
                ELSE 11
            END,
            u.NAME ASC
        `;
        
        const regularMembers = await conn.query(query, params);

        // 2-2. 해당 구역 새참자 목록 조회하여 함께 포함
        let ncQuery = `SELECT id, name, guide_name, phone, COALESCE(area_code, temp_area) as area_code, memo, registered_at FROM faithon_newcomer`;
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
            guide_name: nc.guide_name,
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
            SELECT nc.id, nc.name, nc.guide_name, nc.phone, COALESCE(nc.area_code, nc.temp_area) as area_code, nc.memo, nc.registered_at,
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

// 새참자 등록 (중복 방지 & 주소록 존재 여부 검사 & 인도자 필수)
app.post('/api/newcomers', async (req, res) => {
    const { name, guide_name, phone, area_code, memo, created_by } = req.body;
    if (!name || !guide_name || !area_code) {
        return res.status(400).json({ success: false, error: '이름, 인도자, 배정 구역은 필수 항목입니다.' });
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
            INSERT INTO faithon_newcomer (name, guide_name, phone, area_code, memo, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [name.trim(), guide_name.trim(), phone ? phone.trim() : null, area_code.trim(), memo ? memo.trim() : null, created_by || null]);

        res.json({ success: true, id: insertRes.insertId, message: `'${name}' 새참자가 ${area_code}구역에 등록되었습니다.` });
    } catch (err) {
        console.error("Error creating newcomer:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 새참자 수정 (이름 변경 시에도 고유 ID(NC_id) 기반으로 과거 출석 기록 100% 소급 유지)
app.put('/api/newcomers/:id', async (req, res) => {
    const id = req.params.id;
    const { name, guide_name, phone, area_code, memo } = req.body;
    if (!name || !guide_name || !area_code) {
        return res.status(400).json({ success: false, error: '이름, 인도자, 배정 구역은 필수 항목입니다.' });
    }

    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = await getActiveYear(conn);

        // 1. 본인을 제외하고 해당 구역에 동일한 이름의 새참자가 있는지 중복 검사
        const dup = await conn.query(`
            SELECT id FROM faithon_newcomer 
            WHERE name = ? AND (area_code = ? OR temp_area = ?) AND id != ?
        `, [name.trim(), area_code.trim(), area_code.trim(), id]);

        if (dup && dup.length > 0) {
            return res.status(400).json({ success: false, error: `이미 ${area_code}구역에 동일한 이름의 다른 새참자(${name})가 존재합니다.` });
        }

        // 2. 새참자 정보 업데이트 (이름이 변경되어도 ID 기반으로 과거 출석 기록 자동 보존)
        await conn.query(`
            UPDATE faithon_newcomer
            SET name = ?, guide_name = ?, phone = ?, area_code = ?, memo = ?
            WHERE id = ?
        `, [name.trim(), guide_name.trim(), phone ? phone.trim() : null, area_code.trim(), memo ? memo.trim() : null, id]);

        // 3. 수정된 이름이 주소록(CWTB_USER)에 이미 존재하는지 즉시 확인 및 자동 정리/이관
        await syncNewcomersWithAddressBook(conn, activeYear);

        res.json({ 
            success: true, 
            message: `'${name}' 새참자 정보가 수정되었으며, 이전 출석 기록이 모두 소급 유지됩니다.` 
        });
    } catch (err) {
        console.error("Error updating newcomer:", err);
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

// 예비명단 조회 (정규 성도 및 새참자 모두 지원)
app.get('/api/reserve', async (req, res) => {
    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = await getActiveYear(conn);

        const rows = await conn.query(`
            SELECT r.id, r.member_code, r.original_area, r.reason, r.added_at,
                   COALESCE(u.NAME, nc.name) as name, 
                   COALESCE(u.PHONE, nc.phone) as phone, 
                   COALESCE(u.POSITION, '새참자') as position,
                   CASE WHEN r.member_code LIKE 'NC_%' THEN 1 ELSE 0 END as is_newcomer
            FROM faithon_reserve r
            LEFT JOIN CWTB_USER u ON r.member_code = u.CODE_NO AND u.YEAR = ?
            LEFT JOIN faithon_newcomer nc ON r.member_code = CONCAT('NC_', nc.id)
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

// ==========================================
// 교회학교 (유초등부, 중고등부) 출석(인원수) API Routes
// ==========================================

// 1. 특정 일자의 교회학교 부서별 출석 인원 조회
app.get('/api/admin/school-attendance', async (req, res) => {
    const { date } = req.query; // e.g. '2026-08-30'
    if (!date) {
        return res.status(400).json({ success: false, error: '날짜(date) 파라미터가 필요합니다.' });
    }

    let conn;
    try {
        conn = await db.pool.getConnection();
        const rows = await conn.query(`
            SELECT dept_code, dept_name, service_date, attend_count 
            FROM faithon_school_attendance 
            WHERE service_date = ?
        `, [date]);

        const depts = [
            { dept_code: 'elementary', dept_name: '유초등부', count: 0 },
            { dept_code: 'youth', dept_name: '중고등부', count: 0 }
        ];

        rows.forEach(r => {
            const found = depts.find(d => d.dept_code === r.dept_code);
            if (found) {
                found.count = Number(r.attend_count || 0);
            }
        });

        res.json({ success: true, data: depts });
    } catch (err) {
        console.error("Error fetching school attendance:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 2. 교회학교 부서별 출석 인원수 저장/업데이트 (+ / - 버튼 또는 직접 입력)
app.post('/api/admin/school-attendance', async (req, res) => {
    const { date, dept_code, dept_name, count } = req.body;
    if (!date || !dept_code) {
        return res.status(400).json({ success: false, error: '날짜와 부서 코드가 필요합니다.' });
    }

    const safeCount = Math.max(0, parseInt(count, 10) || 0);
    const safeDeptName = dept_name || (dept_code === 'elementary' ? '유초등부' : '중고등부');

    let conn;
    try {
        conn = await db.pool.getConnection();
        await conn.query(`
            INSERT INTO faithon_school_attendance (dept_code, dept_name, service_date, attend_count)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE attend_count = ?, dept_name = ?
        `, [dept_code, safeDeptName, date, safeCount, safeCount, safeDeptName]);

        res.json({ success: true, message: '교회학교 출석 인원이 저장되었습니다.', count: safeCount });
    } catch (err) {
        console.error("Error saving school attendance:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// ==========================================
// 관리자(Admin) 권한 설정 전용 API Routes
// ==========================================

// 현재 관리자 목록 조회
app.get('/api/admin/users', async (req, res) => {
    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = await getActiveYear(conn);

        // CWTB_ADMIN 및 WEB_ADMIN_PHONES에 등록된 관리자 목록과 주소록 정보 조인
        const query = `
            SELECT DISTINCT 
                COALESCE(u.CODE_NO, CONCAT('ADM_', a.SEQ)) as code_no,
                a.NAME as name,
                COALESCE(u.PHONE, wp.phone, '-') as phone,
                COALESCE(
                    pa.POSITION,
                    pep.POSITION,
                    u.POSITION,
                    '관리자'
                ) as position,
                COALESCE(u.AREA_CODE, '관리부서') as area_code,
                a.SEQ as seq
            FROM CWTB_ADMIN a
            LEFT JOIN CWTB_USER u ON a.NAME = u.NAME AND u.YEAR = ? AND u.DEL_YN = 'N'
            LEFT JOIN CWTB_PA pa ON a.NAME = pa.NAME AND pa.YEAR = ?
            LEFT JOIN (
                SELECT NAME, POSITION FROM CWTB_PEP WHERE (YEAR = ? OR YEAR = '2025') AND POSITION IN ('담임목사', '목사', '부목사', '전도사', '집사') GROUP BY NAME
            ) pep ON a.NAME = pep.NAME
            LEFT JOIN WEB_ADMIN_PHONES wp ON REPLACE(REPLACE(u.PHONE, '-', ''), ' ', '') = wp.phone OR a.NAME = wp.name
            ORDER BY a.SEQ ASC, a.NAME ASC
        `;
        const admins = await conn.query(query, [activeYear, activeYear, activeYear]);
        res.json({ success: true, data: admins });
    } catch (err) {
        console.error("Error fetching admin list:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 관리자 후보 성도 검색 (현재 관리자가 아닌 성도)
app.get('/api/admin/candidates', async (req, res) => {
    const { query: searchQuery, areaCode } = req.query;
    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = await getActiveYear(conn);

        let sql = `
            SELECT u.CODE_NO, u.NAME, 
                   COALESCE(
                       pa.POSITION,
                       CASE 
                           WHEN pep.POSITION IN ('담임목사', '목사', '부목사', '전도사', '집사') THEN pep.POSITION
                           WHEN d.NAME IS NOT NULL THEN '집사'
                           ELSE NULL 
                       END,
                       u.POSITION,
                       '성도'
                   ) AS POSITION, 
                   u.AREA_CODE, u.PHONE
            FROM CWTB_USER u
            LEFT JOIN CWTB_PA pa ON u.NAME = pa.NAME AND pa.YEAR = ?
            LEFT JOIN (
                SELECT NAME, POSITION 
                FROM CWTB_PEP 
                WHERE (YEAR = ? OR YEAR = '2025') 
                  AND POSITION IN ('담임목사', '목사', '부목사', '전도사', '집사')
                GROUP BY NAME
            ) pep ON u.NAME = pep.NAME
            LEFT JOIN (
                SELECT DISTINCT NAME FROM CWTB_DEACON WHERE NAME IS NOT NULL
            ) d ON u.NAME = d.NAME
            LEFT JOIN CWTB_ADMIN a ON u.NAME = a.NAME
            WHERE u.YEAR = ? 
              AND u.DEL_YN = 'N' 
              AND u.IS_HIDDEN = 'N'
              AND a.NAME IS NULL
        `;
        const params = [activeYear, activeYear, activeYear];

        if (areaCode) {
            sql += ` AND u.AREA_CODE = ?`;
            params.push(areaCode);
        }

        if (searchQuery) {
            sql += ` AND (u.NAME LIKE ? OR u.PHONE LIKE ? OR u.AREA_CODE LIKE ?)`;
            const qStr = `%${searchQuery.trim()}%`;
            params.push(qStr, qStr, qStr);
        }

        sql += ` ORDER BY CAST(u.AREA_CODE AS UNSIGNED) ASC, u.NAME ASC`;

        const candidates = await conn.query(sql, params);
        res.json({ success: true, data: candidates });
    } catch (err) {
        console.error("Error fetching admin candidates:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 관리자 지정 (CWTB_ADMIN 및 WEB_ADMIN_PHONES 추가)
app.post('/api/admin/assign', async (req, res) => {
    const { name, phone } = req.body;
    if (!name) {
        return res.status(400).json({ success: false, error: '성도 이름이 필요합니다.' });
    }

    let conn;
    try {
        conn = await db.pool.getConnection();

        // 1. 이미 CWTB_ADMIN에 존재하는지 확인
        const existing = await conn.query(`SELECT SEQ FROM CWTB_ADMIN WHERE NAME = ? LIMIT 1`, [name.trim()]);
        if (existing && existing.length > 0) {
            return res.status(400).json({ success: false, error: `'${name}' 성도는 이미 관리자로 등록되어 있습니다.` });
        }

        // 2. 최대 SEQ 구하기
        const seqRow = await conn.query(`SELECT COALESCE(MAX(SEQ), 0) + 1 as next_seq FROM CWTB_ADMIN`);
        const nextSeq = seqRow[0]?.next_seq || 1;

        // 3. CWTB_ADMIN 추가
        await conn.query(`INSERT INTO CWTB_ADMIN (SEQ, NAME) VALUES (?, ?)`, [nextSeq, name.trim()]);

        // 4. WEB_ADMIN_PHONES 추가 (전화번호가 있는 경우)
        if (phone) {
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            if (cleanPhone) {
                await conn.query(`
                    INSERT INTO WEB_ADMIN_PHONES (phone, name) 
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE name = ?
                `, [cleanPhone, name.trim(), name.trim()]);
            }
        }

        res.json({ success: true, message: `'${name}' 성도를 총괄 관리자로 지정했습니다.` });
    } catch (err) {
        console.error("Error assigning admin:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 관리자 권한 해제 (CWTB_ADMIN 및 WEB_ADMIN_PHONES 삭제)
app.delete('/api/admin/revoke/:name', async (req, res) => {
    const name = req.params.name;
    if (!name) {
        return res.status(400).json({ success: false, error: '성도 이름이 필요합니다.' });
    }

    let conn;
    try {
        conn = await db.pool.getConnection();

        // CWTB_ADMIN 삭제
        await conn.query(`DELETE FROM CWTB_ADMIN WHERE NAME = ?`, [name.trim()]);

        // WEB_ADMIN_PHONES 삭제
        await conn.query(`DELETE FROM WEB_ADMIN_PHONES WHERE name = ?`, [name.trim()]);

        res.json({ success: true, message: `'${name}' 성도의 관리자 권한을 해제했습니다.` });
    } catch (err) {
        console.error("Error revoking admin:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 출석 조회 (정규 성도 및 새참자 모두 포함)
app.get('/api/attendance', async (req, res) => {
    const { date, type, areaCode } = req.query;
    let conn;
    try {
        conn = await db.pool.getConnection();
        const query = `
            SELECT DISTINCT a.member_code 
            FROM faithon_attendance a
            LEFT JOIN CWTB_USER u ON a.member_code = u.CODE_NO
            LEFT JOIN faithon_newcomer nc ON a.member_code = CONCAT('NC_', nc.id)
            WHERE a.service_date = ? 
              AND a.service_type = ? 
              AND a.is_attended = TRUE
              AND (
                  ? IS NULL 
                  OR u.AREA_CODE = ? 
                  OR nc.area_code = ? 
                  OR nc.temp_area = ?
              )
        `;
        const rows = await conn.query(query, [date, type, areaCode || null, areaCode, areaCode, areaCode]);
        const attendedCodes = rows.map(r => r.member_code);
        res.json({ success: true, data: attendedCodes });
    } catch (err) {
        console.error("Error fetching attendance:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 3-1. 실시간 즉시 출석 체크 토글 (체크 클릭 즉시 저장)
app.post('/api/attendance/toggle', async (req, res) => {
    const { date, type, member_code, is_attended } = req.body;
    if (!date || !type || !member_code) {
        return res.status(400).json({ success: false, error: '필수 항목이 누락되었습니다.' });
    }
    let conn;
    try {
        conn = await db.pool.getConnection();
        await conn.query(`
            INSERT INTO faithon_attendance (member_code, service_date, service_type, is_attended)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE is_attended = ?
        `, [member_code, date, type, !!is_attended, !!is_attended]);

        res.json({ success: true, message: '출석 상태가 실시간 저장되었습니다.' });
    } catch (err) {
        console.error("Error toggling attendance:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 3-2. 출석 체크 일괄 저장/업데이트 (기존 호환 유지)
app.post('/api/attendance', async (req, res) => {
    const { date, type, members } = req.body;
    let conn;
    try {
        conn = await db.pool.getConnection();
        await conn.beginTransaction();

        for (const m of members) {
            await conn.query(`
                INSERT INTO faithon_attendance (member_code, service_date, service_type, is_attended)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE is_attended = ?
            `, [m.member_code, date, type, !!m.is_attended, !!m.is_attended]);
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

// ==========================================
// 대시보드 통계 전용 API Route (최근 4주 / 월별 / 기간별 실데이터 집계)
// ==========================================
app.get('/api/dashboard/stats', async (req, res) => {
    const { areaCode, month, startDate, endDate } = req.query;
    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = await getActiveYear(conn);

        // 1. 활성 성도 수 및 새참자 수 집계
        let memQuery = `
            SELECT COUNT(*) as cnt 
            FROM CWTB_USER u
            LEFT JOIN faithon_reserve r ON u.CODE_NO = r.member_code
            WHERE u.YEAR = ? AND u.DEL_YN = 'N' AND u.IS_HIDDEN = 'N' AND r.member_code IS NULL
        `;
        const memParams = [activeYear];
        if (areaCode) {
            memQuery += ` AND u.AREA_CODE = ?`;
            memParams.push(areaCode);
        }
        const memRows = await conn.query(memQuery, memParams);
        const regularMemberCount = Number(memRows[0]?.cnt || 0);

        // 새참자 수
        let ncQuery = `SELECT COUNT(*) as cnt FROM faithon_newcomer`;
        const ncParams = [];
        if (areaCode) {
            ncQuery += ` WHERE (area_code = ? OR temp_area = ?)`;
            ncParams.push(areaCode, areaCode);
        }
        const ncRows = await conn.query(ncQuery, ncParams);
        const newcomerCount = Number(ncRows[0]?.cnt || 0);

        // 예비명단 수
        let resQuery = `SELECT COUNT(*) as cnt FROM faithon_reserve`;
        const resParams = [];
        if (areaCode) {
            resQuery += ` WHERE original_area = ?`;
            resParams.push(areaCode);
        }
        const resRows = await conn.query(resQuery, resParams);
        const reserveCount = Number(resRows[0]?.cnt || 0);

        // 2. 조회 기간(Date Range) 설정
        let fromDateStr = startDate;
        let toDateStr = endDate;

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        if (month) {
            const [mY, mM] = month.split('-');
            fromDateStr = `${mY}-${mM.padStart(2, '0')}-01`;
            const lastDay = new Date(parseInt(mY), parseInt(mM), 0).getDate();
            toDateStr = `${mY}-${mM.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            if (toDateStr > todayStr && month === `${yyyy}-${mm}`) {
                toDateStr = todayStr;
            }
        } else if (!fromDateStr || !toDateStr) {
            // 기본값: 오늘 기준 최근 4주(28일)
            const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
            const fY = fourWeeksAgo.getFullYear();
            const fM = String(fourWeeksAgo.getMonth() + 1).padStart(2, '0');
            const fD = String(fourWeeksAgo.getDate()).padStart(2, '0');
            fromDateStr = `${fY}-${fM}-${fD}`;
            toDateStr = todayStr;
        }

        // 3. 해당 기간 내 주일/수요 출석 집계 (정규 성도 및 새참자 구분 집계)
        let attQuery = `
            SELECT DATE_FORMAT(a.service_date, '%Y-%m-%d') as service_date, 
                   a.service_type, 
                   COUNT(DISTINCT a.member_code) as total_attend_cnt,
                   SUM(CASE WHEN a.member_code NOT LIKE 'NC_%' THEN 1 ELSE 0 END) as regular_attend_cnt,
                   SUM(CASE WHEN a.member_code LIKE 'NC_%' THEN 1 ELSE 0 END) as newcomer_attend_cnt
            FROM faithon_attendance a
            LEFT JOIN CWTB_USER u ON a.member_code = u.CODE_NO AND u.YEAR = ?
            LEFT JOIN faithon_newcomer nc ON a.member_code = CONCAT('NC_', nc.id)
            WHERE DATE_FORMAT(a.service_date, '%Y-%m-%d') >= ? 
              AND DATE_FORMAT(a.service_date, '%Y-%m-%d') <= ?
              AND a.is_attended = TRUE
              AND (
                  ? IS NULL 
                  OR u.AREA_CODE = ? 
                  OR nc.area_code = ? 
                  OR nc.temp_area = ?
              )
            GROUP BY DATE_FORMAT(a.service_date, '%Y-%m-%d'), a.service_type
            ORDER BY service_date ASC
        `;
        const attParams = [activeYear, fromDateStr, toDateStr, areaCode || null, areaCode, areaCode, areaCode];
        const attRows = await conn.query(attQuery, attParams);

        // 4. 주간 트렌드 날짜 생성
        const sundayMap = {};
        const wednesdayMap = {};
        const sundayRegMap = {};
        const sundayNcMap = {};
        const wednesdayRegMap = {};
        const wednesdayNcMap = {};

        attRows.forEach(r => {
            const d = r.service_date;
            const cnt = Number(r.total_attend_cnt || 0);
            const regCnt = Number(r.regular_attend_cnt || 0);
            const ncCnt = Number(r.newcomer_attend_cnt || 0);
            if (r.service_type === 'sunday') {
                sundayMap[d] = cnt;
                sundayRegMap[d] = regCnt;
                sundayNcMap[d] = ncCnt;
            }
            if (r.service_type === 'wednesday') {
                wednesdayMap[d] = cnt;
                wednesdayRegMap[d] = regCnt;
                wednesdayNcMap[d] = ncCnt;
            }
        });

        // 날짜 순회
        const dStart = new Date(fromDateStr);
        const dEnd = new Date(toDateStr);
        const allDates = [];
        const curr = new Date(dStart);

        while (curr <= dEnd && curr <= now) {
            const day = curr.getDay();
            const y = curr.getFullYear();
            const m = String(curr.getMonth() + 1).padStart(2, '0');
            const dt = String(curr.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${dt}`;

            if (day === 0 || day === 3) {
                allDates.push({
                    date: dateStr,
                    dayName: day === 0 ? '주일' : '수요',
                    label: `${curr.getMonth() + 1}월 ${curr.getDate()}일(${day === 0 ? '주일' : '수요'})`,
                    sundayAttend: day === 0 ? (sundayMap[dateStr] || 0) : null,
                    sundayRegular: day === 0 ? (sundayRegMap[dateStr] || 0) : null,
                    sundayNewcomer: day === 0 ? (sundayNcMap[dateStr] || 0) : null,
                    wednesdayAttend: day === 3 ? (wednesdayMap[dateStr] || 0) : null,
                    wednesdayRegular: day === 3 ? (wednesdayRegMap[dateStr] || 0) : null,
                    wednesdayNewcomer: day === 3 ? (wednesdayNcMap[dateStr] || 0) : null
                });
            }
            curr.setDate(curr.getDate() + 1);
        }

        // 5. 금주(가장 최근) 주일 및 수요 출석
        const sundaysOnly = allDates.filter(d => d.dayName === '주일');
        const wednesdaysOnly = allDates.filter(d => d.dayName === '수요');

        const latestSundayObj = sundaysOnly.length > 0 ? sundaysOnly[sundaysOnly.length - 1] : null;
        const prevSundayObj = sundaysOnly.length > 1 ? sundaysOnly[sundaysOnly.length - 2] : null;

        const latestWednesdayObj = wednesdaysOnly.length > 0 ? wednesdaysOnly[wednesdaysOnly.length - 1] : null;
        const prevWednesdayObj = wednesdaysOnly.length > 1 ? wednesdaysOnly[wednesdaysOnly.length - 2] : null;

        const latestSundayCount = latestSundayObj ? Number(latestSundayObj.sundayAttend || 0) : 0;
        const prevSundayCount = prevSundayObj ? Number(prevSundayObj.sundayAttend || 0) : 0;
        const sundayDiff = prevSundayCount > 0 ? (((latestSundayCount - prevSundayCount) / prevSundayCount) * 100).toFixed(1) : 0;

        const latestWednesdayCount = latestWednesdayObj ? Number(latestWednesdayObj.wednesdayAttend || 0) : 0;
        const prevWednesdayCount = prevWednesdayObj ? Number(prevWednesdayObj.wednesdayAttend || 0) : 0;
        const wednesdayDiff = prevWednesdayCount > 0 ? (((latestWednesdayCount - prevWednesdayCount) / prevWednesdayCount) * 100).toFixed(1) : 0;

        // 6. 최근 주일 기존 성도 vs 새참자 출석 분리 집계
        let regularAttended = 0;
        let newcomerAttended = 0;

        if (latestSundayObj) {
            const splitQuery = `
                SELECT 
                    SUM(CASE WHEN a.member_code NOT LIKE 'NC_%' THEN 1 ELSE 0 END) as reg_cnt,
                    SUM(CASE WHEN a.member_code LIKE 'NC_%' THEN 1 ELSE 0 END) as nc_cnt
                FROM faithon_attendance a
                LEFT JOIN CWTB_USER u ON a.member_code = u.CODE_NO AND u.YEAR = ?
                LEFT JOIN faithon_newcomer nc ON a.member_code = CONCAT('NC_', nc.id)
                WHERE DATE_FORMAT(a.service_date, '%Y-%m-%d') = ?
                  AND a.service_type = 'sunday'
                  AND a.is_attended = TRUE
                  AND (
                      ? IS NULL 
                      OR u.AREA_CODE = ? 
                      OR nc.area_code = ? 
                      OR nc.temp_area = ?
                  )
            `;
            const splitRows = await conn.query(splitQuery, [activeYear, latestSundayObj.date, areaCode || null, areaCode, areaCode, areaCode]);
            regularAttended = Number(splitRows[0]?.reg_cnt || 0);
            newcomerAttended = Number(splitRows[0]?.nc_cnt || 0);
        }

        const totalEligible = regularMemberCount + newcomerCount;
        const unattendedCount = Math.max(0, totalEligible - (regularAttended + newcomerAttended));

        // 7. 구역 인원별 출석 매트릭스 & 개인별 출석률 집계 (11구역부터 순차적으로 구역별 성도 + 새참자 순차 배치)
        let memberListQuery = `
            SELECT u.CODE_NO, u.NAME, 
                   COALESCE(
                       pa.POSITION,
                       CASE 
                           WHEN pep.POSITION IN ('담임목사', '목사', '부목사', '전도사', '집사') THEN pep.POSITION
                           WHEN d.NAME IS NOT NULL THEN '집사'
                           ELSE NULL 
                       END,
                       u.POSITION,
                       '성도'
                   ) AS POSITION, 
                   u.PHONE, u.AREA_CODE, u.FELLOW_DEPT, 0 as is_newcomer, NULL as guide_name
            FROM CWTB_USER u
            LEFT JOIN CWTB_PA pa ON u.NAME = pa.NAME AND pa.YEAR = ?
            LEFT JOIN (
                SELECT NAME, POSITION 
                FROM CWTB_PEP 
                WHERE (YEAR = ? OR YEAR = '2025') 
                  AND POSITION IN ('담임목사', '목사', '부목사', '전도사', '집사')
                GROUP BY NAME
            ) pep ON u.NAME = pep.NAME
            LEFT JOIN (
                SELECT DISTINCT NAME FROM CWTB_DEACON WHERE NAME IS NOT NULL
            ) d ON u.NAME = d.NAME
            LEFT JOIN faithon_reserve r ON u.CODE_NO = r.member_code
            WHERE u.YEAR = ? AND u.DEL_YN = 'N' AND u.IS_HIDDEN = 'N' AND r.member_code IS NULL
        `;
        const memberListParams = [activeYear, activeYear, activeYear];
        if (areaCode) {
            memberListQuery += ` AND u.AREA_CODE = ?`;
            memberListParams.push(areaCode);
        }

        memberListQuery += ` ORDER BY 
            CAST(u.AREA_CODE AS UNSIGNED) ASC,
            u.AREA_CODE ASC,
            CASE 
                WHEN pa.POSITION LIKE '%구역장%' AND pa.POSITION NOT LIKE '%부%' THEN 1
                WHEN pa.POSITION LIKE '%부구역장%' THEN 2
                WHEN pa.POSITION LIKE '%조장%' THEN 3
                WHEN pa.POSITION LIKE '%조총무%' THEN 4
                WHEN pa.POSITION LIKE '%서기%' THEN 5
                WHEN pep.POSITION = '담임목사' THEN 6
                WHEN pep.POSITION = '목사' THEN 7
                WHEN pep.POSITION = '부목사' THEN 8
                WHEN pep.POSITION = '전도사' THEN 9
                WHEN pep.POSITION = '집사' OR d.NAME IS NOT NULL THEN 10
                ELSE 11
            END,
            u.NAME ASC
        `;

        const regMembers = await conn.query(memberListQuery, memberListParams);

        // 새참자 목록
        let ncListQuery = `SELECT id, name as NAME, '새참자' as POSITION, phone as PHONE, COALESCE(area_code, temp_area) as AREA_CODE, 1 as is_newcomer, guide_name FROM faithon_newcomer`;
        const ncListParams = [];
        if (areaCode) {
            ncListQuery += ` WHERE (area_code = ? OR temp_area = ?)`;
            ncListParams.push(areaCode, areaCode);
        }
        ncListQuery += ` ORDER BY CAST(COALESCE(area_code, temp_area) AS UNSIGNED) ASC, name ASC`;
        const ncMembers = await conn.query(ncListQuery, ncListParams);

        // 11구역, 12구역 ... 순서대로 각 구역별 정규 성도(임원 우선) -> 새참자 순차 조합
        const areaSet = new Set();
        regMembers.forEach(m => { if (m.AREA_CODE) areaSet.add(m.AREA_CODE.trim()); });
        ncMembers.forEach(m => { if (m.AREA_CODE) areaSet.add(m.AREA_CODE.trim()); });

        const sortedAreas = Array.from(areaSet).sort((a, b) => {
            const numA = parseInt(a, 10);
            const numB = parseInt(b, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });

        const allRoster = [];
        sortedAreas.forEach(area => {
            const areaRegs = regMembers.filter(m => (m.AREA_CODE || '').trim() === area);
            const areaNcs = ncMembers.filter(m => (m.AREA_CODE || '').trim() === area);
            areaRegs.forEach(m => allRoster.push({ ...m, code: m.CODE_NO }));
            areaNcs.forEach(m => allRoster.push({ ...m, code: `NC_${m.id}` }));
        });

        // 해당 기간 내 모든 주일 및 수요 출석 레코드 가져오기
        let individualAttMap = {};
        const indQuery = `
            SELECT a.member_code, DATE_FORMAT(a.service_date, '%Y-%m-%d') as s_date, a.service_type
            FROM faithon_attendance a
            WHERE DATE_FORMAT(a.service_date, '%Y-%m-%d') >= ? 
              AND DATE_FORMAT(a.service_date, '%Y-%m-%d') <= ?
              AND a.is_attended = TRUE
        `;
        const indRows = await conn.query(indQuery, [fromDateStr, toDateStr]);
        indRows.forEach(r => {
            const key = `${r.member_code}_${r.s_date}`;
            individualAttMap[key] = true;
        });

        const memberAttendanceList = allRoster.map(m => {
            const history = {};
            let sundayAttendCnt = 0;
            let wednesdayAttendCnt = 0;
            let totalAttendCnt = 0;

            allDates.forEach(d => {
                const attended = !!individualAttMap[`${m.code}_${d.date}`];
                history[d.date] = attended;
                if (attended) {
                    totalAttendCnt++;
                    if (d.dayName === '주일') sundayAttendCnt++;
                    if (d.dayName === '수요') wednesdayAttendCnt++;
                }
            });

            return {
                code: m.code,
                name: m.NAME,
                position: (m.POSITION || '성도').trim(),
                area: m.AREA_CODE,
                fellow_dept: m.FELLOW_DEPT || '',
                is_newcomer: !!m.is_newcomer,
                guide_name: m.guide_name,
                history,
                sunday_attend_count: sundayAttendCnt,
                wednesday_attend_count: wednesdayAttendCnt,
                total_attend_count: totalAttendCnt
            };
        });

        // 4. 교회학교 (유초등부, 중고등부) 해당 기간 내 주별 출석 데이터 조회
        const schoolRows = await conn.query(`
            SELECT dept_code, dept_name, DATE_FORMAT(service_date, '%Y-%m-%d') as s_date, attend_count
            FROM faithon_school_attendance
            WHERE DATE_FORMAT(service_date, '%Y-%m-%d') >= ?
              AND DATE_FORMAT(service_date, '%Y-%m-%d') <= ?
        `, [fromDateStr, toDateStr]);

        const schoolAttendanceMap = {
            elementary: {},
            youth: {}
        };
        schoolRows.forEach(r => {
            if (schoolAttendanceMap[r.dept_code]) {
                schoolAttendanceMap[r.dept_code][r.s_date] = Number(r.attend_count || 0);
            }
        });

        res.json({
            success: true,
            data: {
                metrics: {
                    latest_sunday_attend: latestSundayCount,
                    sunday_diff: sundayDiff,
                    latest_wednesday_attend: latestWednesdayCount,
                    wednesday_diff: wednesdayDiff,
                    newcomer_count: newcomerCount,
                    reserve_count: reserveCount,
                    total_members: totalEligible,
                    regular_attended: regularAttended,
                    newcomer_attended: newcomerAttended,
                    unattended_count: unattendedCount
                },
                trend: {
                    labels: allDates.map(d => d.label),
                    sundays: allDates.map(d => d.sundayAttend),
                    wednesdays: allDates.map(d => d.wednesdayAttend),
                    sundays_regular: allDates.map(d => d.sundayRegular),
                    sundays_newcomer: allDates.map(d => d.sundayNewcomer),
                    wednesdays_regular: allDates.map(d => d.wednesdayRegular),
                    wednesdays_newcomer: allDates.map(d => d.wednesdayNewcomer)
                },
                member_matrix: {
                    sessions: allDates.map(d => ({
                        date: d.date,
                        label: d.label,
                        dayName: d.dayName,
                        service_type: d.dayName === '주일' ? 'sunday' : 'wednesday'
                    })),
                    members: memberAttendanceList
                },
                school_attendance: schoolAttendanceMap,
                range: {
                    from: fromDateStr,
                    to: toDateStr
                }
            }
        });
    } catch (err) {
        console.error("Dashboard stats error:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});
// ==========================================
// 관리자 설정 & 권한 부여 / 해제 API Routes
// ==========================================

// 1. 등록된 총괄 관리자 목록 조회
app.get('/api/admin/users', async (req, res) => {
    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = await getActiveYear(conn);

        const rows = await conn.query(`
            SELECT DISTINCT 
                u.CODE_NO,
                COALESCE(u.NAME, a.NAME, p.name) AS name,
                COALESCE(u.PHONE, p.phone) AS phone,
                COALESCE(u.AREA_CODE, '11') AS area_code,
                COALESCE(
                    pa.POSITION,
                    CASE 
                        WHEN pep.POSITION IN ('담임목사', '목사', '부목사', '전도사', '집사') THEN pep.POSITION
                        WHEN d.NAME IS NOT NULL THEN '집사'
                        ELSE NULL 
                    END,
                    u.POSITION,
                    '관리자'
                ) AS position
            FROM CWTB_ADMIN a
            LEFT JOIN WEB_ADMIN_PHONES p ON a.NAME = p.name
            LEFT JOIN CWTB_USER u ON (a.NAME = u.NAME OR p.name = u.NAME) AND u.YEAR = ? AND u.DEL_YN = 'N'
            LEFT JOIN CWTB_PA pa ON u.NAME = pa.NAME AND pa.YEAR = ?
            LEFT JOIN (
                SELECT NAME, POSITION 
                FROM CWTB_PEP 
                WHERE (YEAR = ? OR YEAR = '2025') 
                  AND POSITION IN ('담임목사', '목사', '부목사', '전도사', '집사')
                GROUP BY NAME
            ) pep ON u.NAME = pep.NAME
            LEFT JOIN (
                SELECT DISTINCT NAME FROM CWTB_DEACON WHERE NAME IS NOT NULL
            ) d ON u.NAME = d.NAME
            ORDER BY name ASC
        `, [activeYear, activeYear, activeYear]);

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("GET /api/admin/users error:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 2. 관리자 후보 성도 검색 (기존 관리자 제외)
app.get('/api/admin/candidates', async (req, res) => {
    const { query, areaCode } = req.query;
    let conn;
    try {
        conn = await db.pool.getConnection();
        const activeYear = await getActiveYear(conn);

        let sql = `
            SELECT 
                u.CODE_NO,
                u.NAME,
                u.PHONE,
                u.AREA_CODE,
                COALESCE(
                    pa.POSITION,
                    CASE 
                        WHEN pep.POSITION IN ('담임목사', '목사', '부목사', '전도사', '집사') THEN pep.POSITION
                        WHEN d.NAME IS NOT NULL THEN '집사'
                        ELSE NULL 
                    END,
                    u.POSITION,
                    '성도'
                ) AS POSITION
            FROM CWTB_USER u
            LEFT JOIN CWTB_PA pa ON u.NAME = pa.NAME AND pa.YEAR = ?
            LEFT JOIN (
                SELECT NAME, POSITION 
                FROM CWTB_PEP 
                WHERE (YEAR = ? OR YEAR = '2025') 
                  AND POSITION IN ('담임목사', '목사', '부목사', '전도사', '집사')
                GROUP BY NAME
            ) pep ON u.NAME = pep.NAME
            LEFT JOIN (
                SELECT DISTINCT NAME FROM CWTB_DEACON WHERE NAME IS NOT NULL
            ) d ON u.NAME = d.NAME
            LEFT JOIN CWTB_ADMIN a ON u.NAME = a.NAME
            LEFT JOIN WEB_ADMIN_PHONES wp ON REPLACE(REPLACE(u.PHONE, '-', ''), ' ', '') = REPLACE(REPLACE(wp.phone, '-', ''), ' ', '')
            LEFT JOIN faithon_reserve r ON u.CODE_NO = r.member_code
            WHERE u.YEAR = ? 
              AND u.DEL_YN = 'N' 
              AND u.IS_HIDDEN = 'N'
              AND r.member_code IS NULL
              AND a.NAME IS NULL
              AND wp.phone IS NULL
        `;
        const params = [activeYear, activeYear, activeYear];

        if (areaCode) {
            sql += ` AND u.AREA_CODE = ?`;
            params.push(areaCode);
        }

        if (query && query.trim()) {
            const cleanQ = query.trim();
            const numQ = cleanQ.replace(/[^0-9]/g, '');
            if (numQ.length >= 2) {
                sql += ` AND (u.NAME LIKE ? OR REPLACE(REPLACE(u.PHONE, '-', ''), ' ', '') LIKE ?)`;
                params.push(`%${cleanQ}%`, `%${numQ}%`);
            } else {
                sql += ` AND u.NAME LIKE ?`;
                params.push(`%${cleanQ}%`);
            }
        }

        sql += ` ORDER BY CAST(u.AREA_CODE AS UNSIGNED) ASC, u.NAME ASC`;

        const rows = await conn.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("GET /api/admin/candidates error:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 3. 성도 관리자 지정
app.post('/api/admin/assign', async (req, res) => {
    const { name, phone } = req.body;
    if (!name) {
        return res.status(400).json({ success: false, error: '성도 이름을 입력해주세요.' });
    }
    let conn;
    try {
        conn = await db.pool.getConnection();
        await conn.beginTransaction();

        // CWTB_ADMIN에 등록
        const existing = await conn.query('SELECT * FROM CWTB_ADMIN WHERE NAME = ?', [name]);
        if (!existing || existing.length === 0) {
            const maxSeqRows = await conn.query('SELECT COALESCE(MAX(SEQ), 0) + 1 AS nextSeq FROM CWTB_ADMIN');
            const nextSeq = maxSeqRows[0]?.nextSeq || 1;
            await conn.query('INSERT INTO CWTB_ADMIN (SEQ, NAME) VALUES (?, ?)', [nextSeq, name]);
        }

        // WEB_ADMIN_PHONES에 전화번호 등록
        if (phone) {
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            if (cleanPhone) {
                await conn.query(`
                    INSERT INTO WEB_ADMIN_PHONES (phone, name) 
                    VALUES (?, ?) 
                    ON DUPLICATE KEY UPDATE name = ?
                `, [cleanPhone, name, name]);
            }
        }

        await conn.commit();
        res.json({ success: true, message: `${name} 성도님이 관리자로 지정되었습니다.` });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error("POST /api/admin/assign error:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 4. 성도 관리자 권한 해제
app.delete('/api/admin/revoke/:name', async (req, res) => {
    const { name } = req.params;
    if (!name) {
        return res.status(400).json({ success: false, error: '성도 이름을 지정해주세요.' });
    }
    let conn;
    try {
        conn = await db.pool.getConnection();
        await conn.beginTransaction();

        await conn.query('DELETE FROM CWTB_ADMIN WHERE NAME = ?', [name]);
        await conn.query('DELETE FROM WEB_ADMIN_PHONES WHERE name = ?', [name]);

        await conn.commit();
        res.json({ success: true, message: `${name} 님의 관리자 권한이 해제되었습니다.` });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error("DELETE /api/admin/revoke error:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

app.listen(PORT, () => {
    console.log(`[FaithOn] Server running at http://localhost:${PORT}`);
});
