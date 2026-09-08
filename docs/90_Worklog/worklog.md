# FaithOn 작업 기록 (Worklog)

## [2026-09-09] 어머니회(조) 출석체크 및 관리자 시스템 신규 구축, 시놀로지 NAS 도커 stop 오류 개선
- **어머니회(조) 전용 출석 시스템 신규 개발**:
  - `login.html`: 구역 출석체크 vs 어머니회(조) 출석체크 세그먼트 전환 기능 추가
  - `mother_attend.html`: 로즈/버건디 프리미엄 테마 적용, 오전모임/조모임/월례회 3개 모임 탭, 날짜별 출석 체크, 조 통계 차트
  - `admin_mother.html`: 통계, 출석체크현황(엑셀 다운로드 지원), 관리자 메뉴(모임 일정 등록기, 조별 임원 명부)
  - `rokmc775` 관리자 계정 연동 (아이디 로그인 지원, 초기 비밀번호 069100)
  - `faithon_mother_schedules`, `faithon_mother_attendance` 테이블 신설 및 구역 출석과 100% 물리 격리
- **시놀로지 NAS Docker 컨테이너 stop 타임아웃 오류 완벽 개선**:
  - `server/server.js`: `SIGTERM` / `SIGINT` Graceful Shutdown 핸들러 추가 (HTTP 서버 및 DB pool 정상 해제)
  - `Dockerfile`: Alpine용 초경량 init 프로세스 `tini` 탑재 (`ENTRYPOINT ["/sbin/tini", "--"]`)
  - `docker-compose.yml`: `init: true`, `stop_grace_period: 10s` 추가
  - `.dockerignore`: 불필요한 빌드 부산물(tar, sql, scratch) 제외로 이미지 경량화

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
