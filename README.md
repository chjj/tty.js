# tty.js

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

tty.js is rough around the edges right now. Terminal compatibility issues
may be slightly noticeable. `$TERM` is best set to `linux` or `vt100`.

## Portability

tty.js should ultimately be able to work on any unix that implements unix98
tty's and `forkpty(3)`. tty.js builds on linux and osx, and it *should* build
on NetBSD, FreeBSD, and OpenBSD as well. If you have trouble building, please
post an issue.

## License

Copyright (c) 2012, Christopher Jeffrey (MIT License)
