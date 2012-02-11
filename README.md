# tty.js

__Update__: tty.js now includes experimental support for
[xterm mouse csi codes][1]. This feature is slightly unstable right now. If
you have problems with it, switch your `TERM` to `linux`.

A terminal in your browser using node.js and socket.io. Based on Fabrice
Bellard's vt100 for [jslinux](http://bellard.org/jslinux/).

__WARNING__: tty.js is *not* secure. Make sure nobody has access to your
terminal but you. tty.js is also unstable right now.

### bash

![tty.js can run bash well](http://i.imgur.com/D5x3k.png)

### vim

![possible to run vim](http://i.imgur.com/K0dXe.png)

## TERM

The main goal of tty.js is to eventually write a full xterm emulator.

`TERM` is now set to `xterm` by default, if you experience any compatibility
issues, try setting it to `linux`.

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
