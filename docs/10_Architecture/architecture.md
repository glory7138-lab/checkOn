# FaithOn 아키텍처 및 시스템 구성 (Architecture)

## 1. 아키텍처 개요 (Architecture Overview)

```mermaid
graph TD
    Client[Web Client: Mobile/PC]
    Express[Express.js App :3047]
    MariaDB[(MariaDB: jbchcwDB)]

    subgraph "Frontend Layer (public/)"
        Login[login.html]
        Attend[attend.html]
        Dashboard[index.html]
        Reserve[reserve.html]
        Newcomer[newcomer.html]
        CSS[style.css : Enterprise Theme]
    end

    subgraph "Backend API Layer (server/server.js)"
        AuthAPI["POST /api/auth/login"]
        AreasAPI["GET /api/areas"]
        MembersAPI["GET /api/members"]
        AttendAPI["GET/POST /api/attendance"]
        StatsAPI["GET /api/stats"]
    end

    subgraph "Database Tables"
        RO_User[("CWTB_USER (Read-Only)")]
        RO_PA[("CWTB_PA (Read-Only)")]
        RO_Admin[("CWTB_ADMIN (Read-Only)")]
        DB_Attend[("faithon_attendance (RW)")]
        DB_Reserve[("faithon_reserve (RW)")]
        DB_Newcomer[("faithon_newcomer (RW)")]
    end

    Client --> Frontend Layer
    Frontend Layer --> Backend API Layer
    AuthAPI --> RO_User
    AuthAPI --> RO_PA
    AuthAPI --> RO_Admin
    AreasAPI --> RO_User
    MembersAPI --> RO_User
    MembersAPI --> RO_PA
    MembersAPI --> DB_Reserve
    AttendAPI --> DB_Attend
```

---

## 2. 주요 API 엔드포인트 명세

| Method | Endpoint | Description | Query / Body Parameters |
|---|---|---|---|
| `POST` | `/api/auth/login` | 휴대폰 번호 기반 로그인 & 권한 식별 | `{ phone: "010-0000-0000" }` |
| `GET` | `/api/areas` | 최신 활성 연도 기준 전체 구역 목록 | 없음 |
| `GET` | `/api/members` | 구역별 성도 목록 (임원순 정렬 & 예비명단 제외) | `?areaCode=31` |
| `GET` | `/api/attendance` | 특정 날짜/유형/구역의 출석 완료자 목록 | `?areaCode=31&date=2026-08-30&type=sunday` |
| `POST` | `/api/attendance` | 출석 체크 일괄 저장 (ON DUPLICATE KEY UPDATE) | `{ date, type, members: [...] }` |

---

## 3. 세션 및 상태 관리
- 인증된 사용자 객체는 브라우저 `localStorage.getItem('faithon_user')`에 보관됩니다.
- 각 페이지 로드시 유효성을 검사하여 비인증 사용자를 `/login.html`로 리다이렉트합니다.
