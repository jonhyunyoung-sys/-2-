#!/bin/bash
# Move to the app folder
cd "$(dirname "$0")" || exit 1

echo "============================================="
echo "🎮 Gimkit Web 게임 서버를 시작합니다!"
echo "============================================="
echo ""
echo "🔗 메인 포털       : http://localhost:3000"
echo "🔗 클래식 퀴즈 배틀 : http://localhost:3000/join?gc=311866"
echo "🔗 Don't Look Down  : http://localhost:3000/dld?gc=311866"
echo "🔗 호스트 대시보드   : http://localhost:3000/host.html"
echo ""
echo "💡 브라우저가 잠시 후 자동으로 열립니다."
echo "💡 서버를 종료하려면 이 터미널 창을 닫거나 Ctrl+C를 누르세요."
echo "============================================="
echo ""

# Open browser tabs after server startup
(sleep 2 && open "http://localhost:3000") &

# Start Node server
npm start
