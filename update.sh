#!/usr/bin/env bash


git pull &&  npm run build && pm2 restart server
