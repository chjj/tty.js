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

for arg in "$@"; do
  case "$arg" in
    -d | --daemonize | production | --production)
      daemonize=1
      break
    ;;
  esac
done

if [ -n "$daemonize" ]; then
  (setsid "$node" ../index.js $@ > /dev/null 2>&1 &)
else
  exec "$node" ../index.js $@
fi
