#!/bin/bash

# ==========================================
# FaithOn 출석체크 웹 애플리케이션 서비스 종료 스크립트
# ==========================================

echo "🛑 [FaithOn] 서버 종료 중..."

# 4000 포트를 점유하고 있는 프로세스 검색 및 종료
PID=$(lsof -ti:4000)

if [ -n "$PID" ]; then
    kill -9 $PID 2>/dev/null
    echo "✅ 4000번 포트의 서버 프로세스(PID: $PID)가 정상적으로 종료되었습니다."
else
    # node server/server.js 이름으로 실행 중인 프로세스 정리
    PKILLED=$(pkill -f "node server/server.js" 2>&1)
    if [ $? -eq 0 ]; then
        echo "✅ 백그라운드 node 서버 프로세스가 종료되었습니다."
    else
        echo "ℹ️ 현재 실행 중인 FaithOn 서버 프로세스가 없습니다."
    fi
fi

echo "🏁 완료되었습니다."
