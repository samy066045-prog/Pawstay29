@echo off
cd /d %~dp0
if not exist node_modules call npm install
node --no-warnings server.js
pause
