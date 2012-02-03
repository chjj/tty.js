#!/bin/bash

r=$(readlink "$0")
if [ -n "$r" ]; then
  cd $(dirname "$r")
else
  cd $(dirname "$0")
fi
unset r

NODE=$(which node 2>/dev/null)
if [ -z "$NODE" ]; then
  NODE="/usr/local/bin/node"
  if [ ! -f "$NODE" ]; then
    echo "Node not found."
    exit 1
  fi
fi

killall tty.js > /dev/null 2>&1 && sleep 2

case "$1" in
  production | --production)
    if [ $(id -u) -ne 0 ]; then
      echo "You probably want root privelages."
      exit 1
    fi
    export NODE_ENV=production
    (setsid "$NODE" ./server > /dev/null 2>&1 &)
  ;;
  * | dev | --dev)
    export NODE_ENV=development
    exec "$NODE" ./server
  ;;
esac
