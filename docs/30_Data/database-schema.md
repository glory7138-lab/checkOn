# FaithOn 데이터베이스 스키마 명세 (Database Schema)

## 1. 외부 참조 마스터 테이블 (Read-Only)

### `CWTB_USER` (교회 주소록 성도 마스터)
- `YEAR`: 연도 (예: '2023', '2024', '2025', '2026')
- `CODE_NO`: 성도 고유 번호 (PK 개념, 예: '310101')
- `NAME`: 성명
- `AREA_CODE`: 소속 구역 코드 (예: '11', '12', '31')
- `PHONE`: 휴대폰 번호
- `POSITION`: 기본 직분
- `DEL_YN`: 삭제 여부 ('N'만 조회)
- `IS_HIDDEN`: 숨김 여부 ('N'만 조회)

### `CWTB_PA` (교회 구역 임원 및 직책 마스터)
- `YEAR`: 연도 (예: '2026')
- `AREA_CODE`: 구역명 (예: '31구역')
- `POSITION`: 직책 (예: '구역장', '부구역장', '조장', '조총무', '서기')
- `NAME`: 임원 성명

---

## 2. FaithOn 전용 테이블 (Read-Write)

```sql
-- 1. 출석 기록 테이블
CREATE TABLE IF NOT EXISTS faithon_attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_code VARCHAR(255) NOT NULL,
    service_date DATE NOT NULL,
    service_type VARCHAR(50) NOT NULL, -- 'sunday' or 'wednesday'
    is_attended BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_attendance (member_code, service_date, service_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 예비명단 테이블
CREATE TABLE IF NOT EXISTS faithon_reserve (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_code VARCHAR(255) NOT NULL UNIQUE,
    original_area VARCHAR(255),
    reason VARCHAR(500),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 새참자 테이블
CREATE TABLE IF NOT EXISTS faithon_newcomer (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(100),
    temp_area VARCHAR(100),
    attendance_count INT DEFAULT 0,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
