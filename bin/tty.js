#!/bin/bash

r=$(readlink "$0")
if [ -n "$r" ]; then
  cd $(dirname "$r")
else
  cd $(dirname "$0")
fi

node=$(which node 2>/dev/null)
if [ -z "$node" ]; then
  node="/usr/local/bin/node"
  if [ ! -f "$node" ]; then
    echo "Node not found."
    exit 1
  fi
fi

killall tty.js > /dev/null 2>&1 && sleep 2

case "$1" in
  production | --production)
    export NODE_ENV=production
    (setsid "$node" ../index.js > /dev/null 2>&1 &)
  ;;
  * | dev | --dev)
    export NODE_ENV=development
    exec "$node" ../index.js
  ;;
esac
