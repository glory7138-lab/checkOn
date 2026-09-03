#!/bin/bash

# 사용자 로컬 경로 우선 추가 (Node.js 경로)
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

# 프로젝트 디렉터리로 이동
cd "$(dirname "$0")"

# node_modules가 없으면 패키지 설치
if [ ! -d "node_modules" ]; then
    echo "📦 패키지 설치 중 (npm install)..."
    npm install
fi

export PORT=4000

# 브라우저 자동 실행
echo "🌐 브라우저 열기: http://localhost:$PORT"
open "http://localhost:$PORT"

# 기존에 4000번 포트를 쓰고 있는 프로세스가 있다면 종료
PID=$(lsof -ti :$PORT)
if [ -n "$PID" ]; then
    echo "⚠️  기존 $PORT 포트 프로세스(PID: $PID) 종료 중..."
    kill -9 $PID 2>/dev/null
fi

echo "🚀 서버 실행 중..."
node server/server.js
