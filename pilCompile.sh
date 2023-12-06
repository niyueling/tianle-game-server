#!/usr/bin/env bash
ssh root@lanxi "source ~/.bashrc && cd /root/mahjong_server && git pull &&  npm run build "
echo "DONT FORGET SETTLE CRONTAB  0 9 d m * "

