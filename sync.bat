@echo off
cd /d "%~dp0"
node sync.js >> sync.log 2>&1
