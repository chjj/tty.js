#!/bin/bash

f=$0
while test -L "$f"; do
  f=$(readlink "$f")
done
dir="$(dirname "$f")/.."

node=$(which node 2>/dev/null)
if test -z "$node"; then
  node="/usr/local/bin/node"
  if test ! -f "$node"; then
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
    -h | --help)
      exec man "$dir/man/tty.js.1"
    ;;
  esac
done

if test -n "$daemonize"; then
  (setsid "$node" "$dir/index.js" $@ > /dev/null 2>&1 &)
else
  exec "$node" "$dir/index.js" $@
fi
