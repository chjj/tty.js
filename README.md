# tty.js

A terminal in your browser using node.js and socket.io. Based on Fabrice
Bellard's vt100 for [jslinux](http://bellard.org/jslinux/).

### bash

![tty.js can run bash well](http://i.imgur.com/D5x3k.png)

### vim

![possible to run vim](http://i.imgur.com/K0dXe.png)

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
  "port": 8080
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

`TERM` is now set to `xterm` by default, if you experience any compatibility
issues, try setting it to `linux`.

tty.js now includes experimental support for
[xterm mouse csi codes][1]. This feature is slightly unstable right now. If
you have problems with it, switch your `TERM` to `linux`.

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
