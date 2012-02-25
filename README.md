# tty.js

A terminal in your browser using node.js and socket.io. Based on Fabrice
Bellard's vt100 for [jslinux](http://bellard.org/jslinux/).

## Screenshots

![](http://i.imgur.com/Zg1Jq.png)

![](http://i.imgur.com/HimZb.png)

## Features

- Tabs, Stacking Windows
- Screen/Tmux-like keys (optional)
- Support for xterm mouse events

## Install

``` bash
$ npm install tty.js
```

## Configuration

Configuration is stored in `~/.tty.js/config.json` or `~/.tty.js` as a single
JSON file. An example configuration file looks like:

``` json
{
  "auth": {
    "username": "hello",
    "password": "world"
  },
  "https": {
    "key": "./server.key",
    "cert": "./server.crt"
  },
  "port": 8080,
  "hostname": "127.0.0.1",
  "shell": "sh",
  "stylesheet": "./my_custom_stylesheet.css",
  "userStylesheet": "./user-stylesheet.css",
  "static": "./my_custom_static_directory/",
  "term": {
    "termName": "xterm",
    "scrollback": 1000,
    "visualBell": false,
    "popOnBell": false,
    "cursorBlink": false,
    "screenKeys": false,
    "colors": [
      "#2e3436",
      "#cc0000",
      "#4e9a06",
      "#c4a000",
      "#3465a4",
      "#75507b",
      "#06989a",
      "#d3d7cf"
      "#555753",
      "#ef2929",
      "#8ae234",
      "#fce94f",
      "#729fcf",
      "#ad7fa8",
      "#34e2e2",
      "#eeeeec",
      "#000000",
      "#f0f0f0"
    ]
  }
}
```

Usernames and passwords can be plaintext or sha1 hashes.

## Security

tty.js currently has https as an option. It also has express' default basic
auth middleware as an option, until it possibly gets something more robust.
It's ultimately up to you to make sure no one has access to your terminals
but you.

## CLI

- `tty.js --port 3000` - start and bind to port 3000.
- `tty.js --daemonize` - daemonize process.
- `tty.js --config ~/my-config.json` - specify config file.

## TERM

The main goal of tty.js is to eventually write a full xterm emulator.
This goal has almost been reached, but there are a few control sequences
not implemented fully. `TERM` should render everything fine when set to
`xterm`.

## Portability

tty.js should ultimately be able to work on any unix that implements unix98
tty's and `forkpty(3)`. tty.js builds on linux and osx, and it *should* build
on NetBSD, FreeBSD, and OpenBSD as well. If you have trouble building, please
post an issue.

## Todo

The distance to go before full xterm compatibility.

- VT52 codes for compatibility
- All vt400 rectangle sequences
- Remaining DEC private modes
- Miscellaneous sequences: cursor shape, window title
- Origin Mode, Insert Mode
- Proper Tab Setting

## License

Copyright (c) 2012, Christopher Jeffrey (MIT License)

[1]: http://invisible-island.net/xterm/ctlseqs/ctlseqs.html#Mouse%20Tracking
