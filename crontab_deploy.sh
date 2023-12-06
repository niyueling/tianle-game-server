#!/usr/bin/env bash
IP=`grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+' ecosystem.config.js`


echo "connecting to $IP"

ssh "root@$IP" <<'ENDSSH'
source ~/.bashrc

PROJECT_ROOT='/root/mahjong/source'
#     分 时 日 月
CRON='00 6 14 12 *'
SERVER_NAME='mahjong'
NODE_BIN="$(which node)"
PM2_BIN="$(which pm2)"

cd $PROJECT_ROOT
git pull
npm run build

crontab -l > mycron
new_cron="$CRON $NODE_BIN $PM2_BIN restart $SERVER_NAME"
echo "$new_cron" >> mycron
crontab mycron
rm mycron


echo "$CRON restart $SERVER_NAME"
ENDSSH


