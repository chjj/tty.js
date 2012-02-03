# tty.js

A terminal in your browser using node.js and socket.io. Based on Fabrice
Bellard's vt100 for [jslinux](http://bellard.org/jslinux/).

__WARNING__: tty.js is *not* secure. Make sure nobody has access to your
terminal but you. tty.js is also unstable right now, terminal compatibility
issues will be noticeable.

### bash

![tty.js can run bash well](http://i.imgur.com/D5x3k.png)

### vim

![possible to run vim](http://i.imgur.com/K0dXe.png)

## TERM

The main goal of tty.js is to eventually write a full xterm emulator.

Unfortunately, tty.js is rough around the edges right now. `$TERM` is
set to vt100 by default, if you want color once you enter the shell you can try:

``` bash
$ TERM=xterm-color exec bash
# or
$ TERM=screen exec bash
```

screen is probably the safest TERM name to use, but you will still have
compatibility issues.

Running screen directly seems to have good effects too. Beware though, there
will be terminal compatibility issues abound.

## License

Copyright (c) 2012, Christopher Jeffrey (MIT License)
