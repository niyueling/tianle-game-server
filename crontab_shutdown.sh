#!/usr/bin/env bash#!/usr/bin/env bash

CRON='00 5 11 2 *'
SERVER_NAME='mahjong'
NODE_BIN="$(which node)"
PM2_BIN="$(which pm2)"
crontab -l > mycron
new_cron="$CRON $NODE_BIN $PM2_BIN stop all"
echo "$new_cron" >> mycron
crontab mycron
rm mycron

echo "$CRON stop $SERVER_NAME"








