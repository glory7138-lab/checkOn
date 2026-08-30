# FaithOn 작업 기록 (Worklog)

## [2026-08-30] 초기 구축, 디자인 시스템, MariaDB 연동 및 실데이터 연동 완료
- **디자인 시스템 구축**:
  - 삼성전자 CI 블루 테마(화이트/라이트 그레이 + 딥블루 포인트) 적용
  - 반응형 레이아웃 및 모바일/PC 최적화
  - FaithOn 브랜드 로고 생성 및 로그인 화면 탑재
- **화면 구성**:
  - `login.html`: 휴대폰 번호 인증 및 권한 확인
  - `attend.html`: 출석체크 (출석유형 주일/수요 분리, 최근 4주 제한, 임원순 정렬)
  - `index.html`: 출석 통계 대시보드 (Chart.js 반응형 크기 고정 및 트렌드 차트)
  - `reserve.html`: 예비명단 관리 UI
  - `newcomer.html`: 새참자 관리 UI
- **MariaDB 연동 & 최신 데이터 무결성 보장**:
  - 주소록 원본(`CWTB_USER`, `CWTB_PA`) Read-Only 보호
  - 다년도 데이터 중 최신 활성 연도(`MAX(YEAR)`) 동적 연동 적용
  - `faithon_attendance`, `faithon_reserve`, `faithon_newcomer` 전용 테이블 자동 생성
- **SOT / Docs 체계화**:
  - `llms.txt`, `docs/00_SOT/`, `docs/10_Architecture/`, `docs/20_Domain/`, `docs/30_Data/` 문서화 완료
