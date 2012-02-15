/**
 * tty.js - an xterm emulator
 * Christopher Jeffrey (https://github.com/chjj/tty.js)
 *
 * Originally forked from (with the author's permission):
 *
 * Fabrice Bellard's javascript vt100 for jslinux:
 * http://bellard.org/jslinux/
 * Copyright (c) 2011 Fabrice Bellard
 * (Redistribution or commercial use is prohibited
 *  without the author's permission.)
 *
 * The original design remains. The terminal itself
 * has been extended to include xterm CSI codes, among
 * other features.
*/

;(function() {

/**
 * Terminal Emulation References:
 *   http://vt100.net/
 *   http://invisible-island.net/xterm/ctlseqs/ctlseqs.txt
 *   http://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 *   http://invisible-island.net/vttest/
 *   http://www.inwap.com/pdp10/ansicode.txt
 *   http://linux.die.net/man/4/console_codes
 *   http://linux.die.net/man/7/urxvt
 */

'use strict';

/**
 * States
 */

var normal = 0
  , escaped = 1
  , csi = 2
  , osc = 3
  , charset = 4;

/**
 * Terminal
 */

var Terminal = function(cols, rows, handler) {
  this.cols = cols;
  this.rows = rows;
  this.handler = handler;
  this.currentHeight = this.rows;
  this.totalHeight = 1000;
  this.ybase = 0;
  this.ydisp = 0;
  this.x = 0;
  this.y = 0;
  this.cursorState = 0;
  this.cursorHidden = false;
  this.convertEol = false;
  this.state = 0;
  this.outputQueue = '';
  this.scrollTop = 0;
  this.scrollBottom = this.rows - 1;

  this.applicationKeypad = false;
  this.originMode = false;
  this.insertMode = false;
  this.wraparoundMode = false;
  this.mouseEvents;
  this.tabs = [];
  this.charset = null;
  this.normal = null;

  this.bgColors = [
    '#2e3436',
    '#cc0000',
    '#4e9a06',
    '#c4a000',
    '#3465a4',
    '#75507b',
    '#06989a',
    '#d3d7cf'
  ];

  this.fgColors = [
    '#555753',
    '#ef2929',
    '#8ae234',
    '#fce94f',
    '#729fcf',
    '#ad7fa8',
    '#34e2e2',
    '#eeeeec'
  ];

  this.defAttr = (7 << 3) | 0;
  this.curAttr = this.defAttr;
  this.isMac = ~navigator.userAgent.indexOf('Mac');
  this.keyState = 0;
  this.keyStr = '';

  this.params = [];
  this.currentParam = 0;

  var i = this.rows - 1;
  this.lines = [ this.blankLine() ];
  while (i--) {
    this.lines.push(this.lines[0].slice());
  }
};

/**
 * Focused Terminal
 */

Terminal.focus = null;

Terminal.prototype.focus = function() {
  if (Terminal.focus) Terminal.focus.cursorHidden = true;
  this.cursorHidden = false;
  Terminal.focus = this;
};

/**
 * Global Events for key handling
 */

Terminal.bindKeys = function() {
  if (Terminal.focus) return;

  // We could put an "if (Term.focus)" check
  // here, but it shouldn't be necessary.
  document.addEventListener('keydown', function(key) {
    return Terminal.focus.keyDownHandler(key);
  }, true);

  document.addEventListener('keypress', function(key) {
    return Terminal.focus.keyPressHandler(key);
  }, true);
};

/**
 * Open Terminal
 */

Terminal.prototype.open = function() {
  var self = this
    , i = 0
    , div;

  this.element = document.createElement('div');
  this.element.className = 'terminal';
  this.children = [];

  for (; i < this.rows; i++) {
    div = document.createElement('div');
    div.className = 'term';
    this.element.appendChild(div);
    this.children.push(div);
  }

  document.body.appendChild(this.element);

  this.refresh(0, this.rows - 1);

  Terminal.bindKeys();
  Terminal.focus = this;

  setInterval(function() {
    self.cursorBlink();
  }, 500);

  this.element.addEventListener('click', function() {
    self.focus();
  }, false);

  this.element.addEventListener('paste', function(ev) {
    if (ev.clipboardData) {
      self.queueChars(ev.clipboardData.getData('text/plain'));
    } else if (window.clipboardData) {
      // does ie9 do this?
      self.queueChars(window.clipboardData.getData('Text'));
    }
  }, false);

  this.bindMouse();
};

// XTerm mouse events
// http://invisible-island.net/xterm/ctlseqs/ctlseqs.html#Mouse%20Tracking
// To better understand these
// the xterm code is very helpful:
// Relevant files:
//   button.c, charproc.c, misc.c
// Relevant functions in xterm/button.c:
//   BtnCode, EmitButtonCode, EditorButton, SendMousePosition
Terminal.prototype.bindMouse = function() {
  var el = this.element
    , self = this
    , pressed;

  // mouseup, mousedown, mousewheel
  // left click: ^[[M 3<^[[M#3<
  // mousewheel up: ^[[M`3>
  function click(ev) {
    if (!self.mouseEvents) return;

    var el = ev.target
      , button
      , pos;

    //if (el === self.element) return;

    // get the xterm-style button
    button = getButton(ev);

    // get mouse coordinates
    pos = getCoords(ev);
    if (!pos) return;

    sendEvent(button, pos);

    pressed = ev.type === 'mousedown'
      ? button
      : false;

    if (ev.preventDefault) ev.preventDefault();
    ev.returnValue = false;
    if (ev.stopPropagation) ev.stopPropagation();
    ev.cancelBubble = true;
  }

  // motion example of a left click:
  // ^[[M 3<^[[M@4<^[[M@5<^[[M@6<^[[M@7<^[[M#7<
  function move(ev) {
    if (!self.mouseEvents) return;
    if (!pressed) return;

    var button = pressed
      , pos;

    pos = getCoords(ev);
    if (!pos) return;

    // buttons marked as motions
    // are incremented by 32
    button += 32;

    sendEvent(button, pos);
  }

  // send a mouse event:
  // ^[[M Cb Cx Cy
  function sendEvent(button, pos) {
    self.queueChars('\x1b[M' + String.fromCharCode(button, pos.x, pos.y));
  }

  function getButton(ev) {
    var button
      , shift
      , meta
      , ctrl
      , mod;

    // two low bits:
    // 0 = left
    // 1 = middle
    // 2 = right
    // 3 = release
    // wheel up/down:
    // 1, and 2 - with 64 added
    switch (ev.type) {
      case 'mousedown':
        button = ev.button != null
          ? +ev.button
          : ev.which != null
            ? ev.which - 1
            : null;

        if (~navigator.userAgent.indexOf('MSIE')) {
          button = button === 1 ? 0 : button === 4 ? 1 : button;
        }
        break;
      case 'mouseup':
        button = 3;
        break;
      case 'DOMMouseScroll':
        button = ev.detail < 0
          ? 64
          : 65;
        break;
      case 'mousewheel':
        button = ev.wheelDeltaY > 0
          ? 64
          : 65;
        break;
    }

    // next three bits are the modifiers:
    // 4 = shift, 8 = meta, 16 = control
    shift = ev.shiftKey ? 4 : 0;
    meta = ev.metaKey ? 8 : 0;
    ctrl = ev.ctrlKey ? 16 : 0;
    mod = shift | meta | ctrl;

    // increment to SP
    button = (32 + (mod << 2)) + button;

    return button;
  }

  // mouse coordinates measured in cols/rows
  function getCoords(ev) {
    var x, y, w, h, el;

    // ignore browsers without pageX for now
    if (ev.pageX == null) return;

    x = ev.pageX;
    y = ev.pageY;
    el = self.element;

    while (el !== document.body) {
      x -= el.offsetLeft;
      y -= el.offsetTop;
      el = el.parentNode;
    }

    // convert to cols/rows
    w = self.element.clientWidth;
    h = self.element.clientHeight;
    x = ((x / w) * self.cols) | 0;
    y = ((y / h) * self.rows) | 0;

    // be sure to avoid sending
    // bad positions to the program
    if (x < 0 || x > self.cols) return;
    if (y < 0 || y > self.rows) return;

    // xterm sends raw bytes and
    // starts at 32 (SP) for each.
    x += 32;
    y += 32;

    return { x: x, y: y };
  }

  el.addEventListener('mousedown', click, false);
  el.addEventListener('mouseup', click, false);

  if ('onmousewheel' in window) {
    el.addEventListener('mousewheel', click, false);
  } else {
    el.addEventListener('DOMMouseScroll', click, false);
  }

  el.addEventListener('mousemove', move, false);

  // allow mousewheel scrolling in
  // the shell for example
  function wheel(ev) {
    if (self.mouseEvents) return;
    if (self.applicationKeypad) return;
    if (ev.type === 'DOMMouseScroll') {
      self.scrollDisp(ev.detail < 0 ? -5 : 5);
    } else {
      self.scrollDisp(ev.wheelDeltaY > 0 ? -5 : 5);
    }
  }

  if ('onmousewheel' in window) {
    el.addEventListener('mousewheel', wheel, false);
  } else {
    el.addEventListener('DOMMouseScroll', wheel, false);
  }
};

Terminal.prototype.refresh = function(start, end) {
  var element
    , x
    , y
    , i
    , line
    , out
    , ch
    , width
    , data
    , defAttr
    , fgColor
    , bgColor
    , row;

  for (y = start; y <= end; y++) {
    row = y + this.ydisp;
    if (row >= this.currentHeight) {
      row -= this.currentHeight;
    }

    line = this.lines[row];
    out = '';
    width = this.cols;

    if (y === this.y
        && this.cursorState
        && this.ydisp === this.ybase
        && !this.cursorHidden) {
      x = this.x;
    } else {
      x = -1;
    }

    defAttr = this.defAttr;

    for (i = 0; i < width; i++) {
      ch = line[i];
      data = ch >> 16;
      ch &= 0xffff;
      if (i === x) {
        data = -1;
      }

      if (data !== defAttr) {
        if (defAttr !== this.defAttr)
          out += '</span>';
        if (data !== this.defAttr) {
          if (data === -1) {
            out += '<span class="termReverse">';
          } else {
            out += '<span style="';
            fgColor = (data >> 3) & 7;
            bgColor = data & 7;
            if (fgColor !== 7) {
              out += 'color:'
                + this.fgColors[fgColor]
                + ';';
            }
            if (bgColor !== 0) {
              out += 'background-color:'
                + this.bgColors[bgColor]
                + ';';
            }
            if ((data >> 8) & 1) {
              out += 'font-weight:bold;';
            }
            if ((data >> 8) & 4) {
              out += 'text-decoration:underline;';
            }
            out += '">';
          }
        }
      }

      switch (ch) {
        case 32:
          out += '&nbsp;';
          break;
        case 38:
          out += '&amp;';
          break;
        case 60:
          out += '&lt;';
          break;
        case 62:
          out += '&gt;';
          break;
        default:
          if (ch < 32) {
            out += '&nbsp;';
          } else {
            out += String.fromCharCode(ch);
          }
          break;
      }

      defAttr = data;
    }

    if (defAttr !== this.defAttr) {
      out += '</span>';
    }

    element = this.children[y];
    element.innerHTML = out;
  }
};

Terminal.prototype.cursorBlink = function() {
  this.cursorState ^= 1;
  this.refresh(this.y, this.y);
};

Terminal.prototype.showCursor = function() {
  if (!this.cursorState) {
    this.cursorState = 1;
    this.refresh(this.y, this.y);
  }
};

Terminal.prototype.scroll = function() {
  var line, x, ch, row;

  if (this.currentHeight < this.totalHeight) {
    this.currentHeight++;
  }

  if (++this.ybase === this.currentHeight) {
    this.ybase = 0;
  }

  this.ydisp = this.ybase;
  ch = 32 | (this.defAttr << 16);

  line = [];
  for (x = 0; x < this.cols; x++) {
    line[x] = ch;
  }

  row = this.ybase + this.rows - 1;

  if (row >= this.currentHeight) {
    row -= this.currentHeight;
  }

  var b = this.scrollBottom + this.ybase;
  if (row > b) {
    var j = this.rows - 1 - this.scrollBottom;
    this.lines.splice(this.rows - 1 + this.ybase - j, 0, line);
  } else {
    this.lines[row] = line;
  }

  if (this.scrollTop !== 0) {
    if (this.ybase !== 0) {
      this.ybase--;
      this.ydisp = this.ybase;
    }
    this.lines.splice(this.ybase + this.scrollTop, 1);
  }
};

Terminal.prototype.scrollDisp = function(disp) {
  var i, row;

  if (disp >= 0) {
    for (i = 0; i < disp; i++) {
      if (this.ydisp === this.ybase) {
        break;
      }
      if (++this.ydisp === this.currentHeight) {
        this.ydisp = 0;
      }
    }
  } else {
    disp = -disp;
    row = this.ybase + this.rows;

    if (row >= this.currentHeight) {
      row -= this.currentHeight;
    }

    for (i = 0; i < disp; i++) {
      if (this.ydisp === row) break;
      if (--this.ydisp < 0) {
        this.ydisp = this.currentHeight - 1;
      }
    }
  }

  this.refresh(0, this.rows - 1);
};

Terminal.prototype.write = function(str) {
  // console.log(JSON.stringify(str.replace(/\x1b/g, '^[')));

  var l = str.length
    , i = 0
    , ch
    , param
    , row;

  this.refreshStart = this.rows;
  this.refreshEnd = -1;
  this.getRows(this.y);

  if (this.ybase !== this.ydisp) {
    this.ydisp = this.ybase;
    this.refreshStart = 0;
    this.refreshEnd = this.rows - 1;
  }

  for (; i < l; i++) {
    ch = str.charCodeAt(i);
    switch (this.state) {
      case normal:
        switch (ch) {
          // '\0'
          case 0:
            break;

          // '\a'
          case 7:
            this.bell();
            break;

          // '\n', '\v', '\f'
          case 10:
          case 11:
          case 12:
            if (this.convertEol) {
              this.x = 0;
            }
            this.y++;
            if (this.y >= this.scrollBottom + 1) {
              this.y--;
              this.scroll();
              this.refreshStart = 0;
              this.refreshEnd = this.rows - 1;
            }
            break;

          // '\r'
          case 13:
            this.x = 0;
            break;

          // '\b'
          case 8:
            if (this.x > 0) {
              this.x--;
            }
            break;

          // '\t'
          case 9:
            // should check tabstops
            param = (this.x + 8) & ~7;
            if (param <= this.cols) {
              this.x = param;
            }
            break;

          // '\e'
          case 27:
            this.state = escaped;
            break;

          default:
            // ' '
            if (ch >= 32) {
              if (this.charset && this.charset[ch]) {
                ch = this.charset[ch];
              }
              if (this.x >= this.cols) {
                this.x = 0;
                this.y++;
                if (this.y >= this.scrollBottom + 1) {
                  this.y--;
                  this.scroll();
                  this.refreshStart = 0;
                  this.refreshEnd = this.rows - 1;
                }
              }
              row = this.y + this.ybase;
              if (row >= this.currentHeight) {
                row -= this.currentHeight;
              }
              this.lines[row][this.x] = (ch & 0xffff) | (this.curAttr << 16);
              this.x++;
              this.getRows(this.y);
            }
            break;
        }
        break;
      case escaped:
        switch (str[i]) {
          // ESC [ Control Sequence Introducer ( CSI is 0x9b).
          case '[':
            this.params = [];
            this.currentParam = 0;
            this.state = csi;
            break;

          // ESC ] Operating System Command ( OSC is 0x9d).
          case ']':
            this.params = [];
            this.currentParam = 0;
            this.state = osc;
            break;

          // ESC P Device Control String ( DCS is 0x90).
          case 'P':
            this.state = osc;
            break;

          // ESC _ Application Program Command ( APC is 0x9f).
          case '_':
            this.state = osc;
            break;

          // ESC ^ Privacy Message ( PM is 0x9e).
          case '^':
            this.state = osc;
            break;

          // ESC c Full Reset (RIS).
          case 'c':
            this.reset();
            break;

          // ESC E Next Line ( NEL is 0x85).
          // ESC D Index ( IND is 0x84).
          case 'E':
            this.x = 0;
            ;
          case 'D':
            this.index();
            break;

          // ESC M Reverse Index ( RI is 0x8d).
          case 'M':
            this.reverseIndex();
            break;

          // ESC % Select default/utf-8 character set.
          // @ = default, G = utf-8
          case '%':
            this.charset = null;
            this.state = normal;
            i++;
            break;

          // ESC (,),*,+,-,. Designate G0-G2 Character Set.
          case '(': // <-- this seems to get all the attention
          case ')':
          case '*':
          case '+':
          case '-':
          case '.':
            this.state = charset;
            break;

          // Designate G3 Character Set (VT300).
          // A = ISO Latin-1 Supplemental.
          // Not implemented.
          case '/':
            this.charset = null;
            this.state = normal;
            i++;
            break;

          // ESC 7 Save Cursor (DECSC).
          case '7':
            this.saveCursor();
            this.state = normal;
            break;

          // ESC 8 Restore Cursor (DECRC).
          case '8':
            this.restoreCursor();
            this.state = normal;
            break;

          // ESC # 3 DEC line height/width
          case '#':
            this.state = normal;
            i++;
            break;

          // ESC H Tab Set ( HTS is 0x88).
          case 'H':
            // this.tabSet(this.x);
            this.state = normal;
            break;

          // ESC = Application Keypad (DECPAM).
          case '=':
            console.log('Serial port requested application keypad.');
            this.applicationKeypad = true;
            this.state = normal;
            break;

          // ESC > Normal Keypad (DECPNM).
          case '>':
            console.log('Switching back to normal keypad.');
            this.applicationKeypad = false;
            this.state = normal;
            break;

          default:
            this.state = normal;
            console.log('Unknown ESC control: ' + str[i] + '.');
            break;
        }
        break;

      case charset:
        switch (str[i]) {
          // DEC Special Character and Line Drawing Set.
          case '0':
            this.charset = SCLD;
            break;
          // United States (USASCII).
          case 'B':
          default:
            this.charset = null;
            break;
        }
        this.state = normal;
        break;

      case osc:
        if (ch !== 27 && ch !== 7) break;
        console.log('Unknown OSC code.');
        this.state = normal;
        // increment for the trailing slash in ST
        if (ch === 27) i++;
        break;

      case csi:
        // '?', '>', '!'
        if (ch === 63 || ch === 62 || ch === 33) {
          this.prefix = str[i];
          break;
        }

        // 0 - 9
        if (ch >= 48 && ch <= 57) {
          this.currentParam = this.currentParam * 10 + ch - 48;
        } else {
          // '$', '"', ' ', '\''
          if (ch === 36 || ch === 34 || ch === 32 || ch === 39) {
            this.postfix = str[i];
            break;
          }

          this.params[this.params.length] = this.currentParam;
          this.currentParam = 0;

          // ';'
          if (ch === 59) break;

          this.state = normal;

          switch (ch) {
            // CSI Ps A
            // Cursor Up Ps Times (default = 1) (CUU).
            case 65:
              this.cursorUp(this.params);
              break;

            // CSI Ps B
            // Cursor Down Ps Times (default = 1) (CUD).
            case 66:
              this.cursorDown(this.params);
              break;

            // CSI Ps C
            // Cursor Forward Ps Times (default = 1) (CUF).
            case 67:
              this.cursorForward(this.params);
              break;

            // CSI Ps D
            // Cursor Backward Ps Times (default = 1) (CUB).
            case 68:
              this.cursorBackward(this.params);
              break;

            // CSI Ps ; Ps H
            // Cursor Position [row;column] (default = [1,1]) (CUP).
            case 72:
              this.cursorPos(this.params);
              break;

            // CSI Ps J  Erase in Display (ED).
            case 74:
              this.eraseInDisplay(this.params);
              break;

            // CSI Ps K  Erase in Line (EL).
            case 75:
              this.eraseInLine(this.params);
              break;

            // CSI Pm m  Character Attributes (SGR).
            case 109:
              this.charAttributes(this.params);
              break;

            // CSI Ps n  Device Status Report (DSR).
            case 110:
              this.deviceStatus(this.params);
              break;

            /**
             * Additions
             */

            // CSI Ps @
            // Insert Ps (Blank) Character(s) (default = 1) (ICH).
            case 64:
              this.insertChars(this.params);
              break;

            // CSI Ps E
            // Cursor Next Line Ps Times (default = 1) (CNL).
            case 69:
              this.cursorNextLine(this.params);
              break;

            // CSI Ps F
            // Cursor Preceding Line Ps Times (default = 1) (CNL).
            case 70:
              this.cursorPrecedingLine(this.params);
              break;

            // CSI Ps G
            // Cursor Character Absolute  [column] (default = [row,1]) (CHA).
            case 71:
              this.cursorCharAbsolute(this.params);
              break;

            // CSI Ps L
            // Insert Ps Line(s) (default = 1) (IL).
            case 76:
              this.insertLines(this.params);
              break;

            // CSI Ps M
            // Delete Ps Line(s) (default = 1) (DL).
            case 77:
              this.deleteLines(this.params);
              break;

            // CSI Ps P
            // Delete Ps Character(s) (default = 1) (DCH).
            case 80:
              this.deleteChars(this.params);
              break;

            // CSI Ps X
            // Erase Ps Character(s) (default = 1) (ECH).
            case 88:
              this.eraseChars(this.params);
              break;

            // CSI Pm `  Character Position Absolute
            //   [column] (default = [row,1]) (HPA).
            case 96:
              this.charPosAbsolute(this.params);
              break;

            // 141 61 a * HPR -
            // Horizontal Position Relative
            case 97:
              this.HPositionRelative(this.params);
              break;

            // CSI P s c
            // Send Device Attributes (Primary DA).
            // CSI > P s c
            // Send Device Attributes (Secondary DA)
            case 99:
              this.sendDeviceAttributes(this.params);
              break;

            // CSI Pm d
            // Line Position Absolute  [row] (default = [1,column]) (VPA).
            case 100:
              this.linePosAbsolute(this.params);
              break;

            // 145 65 e * VPR - Vertical Position Relative
            case 101:
              this.VPositionRelative(this.params);
              break;

            // CSI Ps ; Ps f
            //   Horizontal and Vertical Position [row;column] (default =
            //   [1,1]) (HVP).
            case 102:
              this.HVPosition(this.params);
              break;

            // CSI Pm h  Set Mode (SM).
            // CSI ? Pm h - mouse escape codes, cursor escape codes
            case 104:
              this.setMode(this.params);
              break;

            // CSI Pm l  Reset Mode (RM).
            // CSI ? Pm l
            case 108:
              this.resetMode(this.params);
              break;

            // CSI Ps ; Ps r
            //   Set Scrolling Region [top;bottom] (default = full size of win-
            //   dow) (DECSTBM).
            // CSI ? Pm r
            case 114:
              this.setScrollRegion(this.params);
              break;

            // CSI s     Save cursor (ANSI.SYS).
            case 115:
              this.saveCursor(this.params);
              break;

            // CSI u     Restore cursor (ANSI.SYS).
            case 117:
              this.restoreCursor(this.params);
              break;

            /**
             * Lesser Used
             */

            // CSI Ps I
            // Cursor Forward Tabulation Ps tab stops (default = 1) (CHT).
            case 73:
              this.cursorForwardTab(this.params);
              break;

            // CSI Ps S  Scroll up Ps lines (default = 1) (SU).
            case 83:
              this.scrollUp(this.params);
              break;

            // CSI Ps T  Scroll down Ps lines (default = 1) (SD).
            // CSI Ps ; Ps ; Ps ; Ps ; Ps T
            // CSI > Ps; Ps T
            case 84:
              // if (this.prefix === '>') {
              //   this.resetTitleModes(this.params);
              //   break;
              // }
              // if (this.params.length > 1) {
              //   this.initMouseTracking(this.params);
              //   break;
              // }
              this.scrollDown(this.params);
              break;

            // CSI Ps Z
            // Cursor Backward Tabulation Ps tab stops (default = 1) (CBT).
            case 90:
              this.cursorBackwardTab(this.params);
              break;

            // CSI Ps b  Repeat the preceding graphic character Ps times (REP).
            case 98:
              this.repeatPrecedingCharacter(this.params);
              break;

            // CSI Ps g  Tab Clear (TBC).
            // case 103:
            //   this.tabClear(this.params);
            //   break;

            // CSI Pm i  Media Copy (MC).
            // CSI ? Pm i
            // case 105:
            //   this.mediaCopy(this.params);
            //   break;

            // CSI Pm m  Character Attributes (SGR).
            // CSI > Ps; Ps m
            // case 109: // duplicate
            //   if (this.prefix === '>') {
            //     this.setResources(this.params);
            //   } else {
            //     this.charAttributes(this.params);
            //   }
            //   break;

            // CSI Ps n  Device Status Report (DSR).
            // CSI > Ps n
            // case 110: // duplicate
            //   if (this.prefix === '>') {
            //     this.disableModifiers(this.params);
            //   } else {
            //     this.deviceStatus(this.params);
            //   }
            //   break;

            // CSI > Ps p  Set pointer mode.
            // CSI ! p   Soft terminal reset (DECSTR).
            // CSI Ps$ p
            //   Request ANSI mode (DECRQM).
            // CSI ? Ps$ p
            //   Request DEC private mode (DECRQM).
            // CSI Ps ; Ps " p
            case 112:
              switch (this.prefix) {
                // case '>':
                //   this.setPointerMode(this.params);
                //   break;
                case '!':
                  this.softReset(this.params);
                  break;
                // case '?':
                //   if (this.postfix === '$') {
                //     this.requestPrivateMode(this.params);
                //   }
                //   break;
                // default:
                //   if (this.postfix === '"') {
                //     this.setConformanceLevel(this.params);
                //   } else if (this.postfix === '$') {
                //     this.requestAnsiMode(this.params);
                //   }
                //   break;
              }
              break;

            // CSI Ps q  Load LEDs (DECLL).
            // CSI Ps SP q
            // CSI Ps " q
            // case 113:
            //   if (this.postfix === ' ') {
            //     this.setCursorStyle(this.params);
            //     break;
            //   }
            //   if (this.postfix === '"') {
            //     this.setCharProtectionAttr(this.params);
            //     break;
            //   }
            //   this.loadLEDs(this.params);
            //   break;

            // CSI Ps ; Ps r
            //   Set Scrolling Region [top;bottom] (default = full size of win-
            //   dow) (DECSTBM).
            // CSI ? Pm r
            // CSI Pt; Pl; Pb; Pr; Ps$ r
            // case 114: // duplicate
            //   if (this.prefix === '?') {
            //     this.restorePrivateValues(this.params);
            //   } else if (this.postfix === '$') {
            //     this.setAttrInRectangle(this.params);
            //   } else {
            //     this.setScrollRegion(this.params);
            //   }
            //   break;

            // CSI s     Save cursor (ANSI.SYS).
            // CSI ? Pm s
            // case 115: // duplicate
            //   if (this.prefix === '?') {
            //     this.savePrivateValues(this.params);
            //   } else {
            //     this.saveCursor(this.params);
            //   }
            //   break;

            // CSI Ps ; Ps ; Ps t
            // CSI Pt; Pl; Pb; Pr; Ps$ t
            // CSI > Ps; Ps t
            // CSI Ps SP t
            // case 116:
            //   if (this.postfix === '$') {
            //     this.reverseAttrInRectangle(this.params);
            //   } else if (this.postfix === ' ') {
            //     this.setWarningBellVolume(this.params);
            //   } else {
            //     if (this.prefix === '>') {
            //       this.setTitleModeFeature(this.params);
            //     } else {
            //       this.manipulateWindow(this.params);
            //     }
            //   }
            //   break;

            // CSI u     Restore cursor (ANSI.SYS).
            // CSI Ps SP u
            // case 117: // duplicate
            //   if (this.postfix === ' ') {
            //     this.setMarginBellVolume(this.params);
            //   } else {
            //     this.restoreCursor(this.params);
            //   }
            //   break;

            // CSI Pt; Pl; Pb; Pr; Pp; Pt; Pl; Pp$ v
            // case 118:
            //   if (this.postfix === '$') {
            //     this.copyRectagle(this.params);
            //   }
            //   break;

            // CSI Pt ; Pl ; Pb ; Pr ' w
            // case 119:
            //   if (this.postfix === '\'') {
            //     this.enableFilterRectangle(this.params);
            //   }
            //   break;

            // CSI Ps x  Request Terminal Parameters (DECREQTPARM).
            // CSI Ps x  Select Attribute Change Extent (DECSACE).
            // CSI Pc; Pt; Pl; Pb; Pr$ x
            // case 120:
            //   if (this.postfix === '$') {
            //     this.fillRectangle(this.params);
            //   } else {
            //     this.requestParameters(this.params);
            //     //this.__(this.params);
            //   }
            //   break;

            // CSI Ps ; Pu ' z
            // CSI Pt; Pl; Pb; Pr$ z
            // case 122:
            //   if (this.postfix === '\'') {
            //     this.enableLocatorReporting(this.params);
            //   } else if (this.postfix === '$') {
            //     this.eraseRectangle(this.params);
            //   }
            //   break;

            // CSI Pm ' {
            // CSI Pt; Pl; Pb; Pr$ {
            // case 123:
            //   if (this.postfix === '\'') {
            //     this.setLocatorEvents(this.params);
            //   } else if (this.postfix === '$') {
            //     this.selectiveEraseRectangle(this.params);
            //   }
            //   break;

            // CSI Ps ' |
            // case 124:
            //   if (this.postfix === '\'') {
            //     this.requestLocatorPosition(this.params);
            //   }
            //   break;

            // CSI P m SP }
            // Insert P s Column(s) (default = 1) (DECIC), VT420 and up.
            // case 125:
            //   if (this.postfix === ' ') {
            //     this.insertColumns(this.params);
            //   }
            //   break;

            // CSI P m SP ~
            // Delete P s Column(s) (default = 1) (DECDC), VT420 and up
            // case 126:
            //   if (this.postfix === ' ') {
            //     this.deleteColumns(this.params);
            //   }
            //   break;

            default:
              console.log(
                'Unknown CSI code: %s',
                str[i], this.params);
              break;
          }

          this.prefix = '';
          this.postfix = '';
        }
        break;
    }
  }

  this.getRows(this.y);

  if (this.refreshEnd >= this.refreshStart) {
    this.refresh(this.refreshStart, this.refreshEnd);
  }
};

Terminal.prototype.writeln = function(str) {
  this.write(str + '\r\n');
};

Terminal.prototype.keyDownHandler = function(ev) {
  var str = '';
  switch (ev.keyCode) {
    // backspace
    case 8:
      str = '\x7f'; // ^?
      //str = '\x08'; // ^H
      break;
    // tab
    case 9:
      str = '\t';
      break;
    // return/enter
    case 13:
      str = '\r';
      break;
    // escape
    case 27:
      str = '\x1b';
      break;
    // left-arrow
    case 37:
      if (this.applicationKeypad) {
        str = '\x1bOD'; // SS3 as ^O for 7-bit
        //str = '\x8fD'; // SS3 as 0x8f for 8-bit
        break;
      }
      str = '\x1b[D';
      break;
    // right-arrow
    case 39:
      if (this.applicationKeypad) {
        str = '\x1bOC';
        break;
      }
      str = '\x1b[C';
      break;
    // up-arrow
    case 38:
      if (this.applicationKeypad) {
        str = '\x1bOA';
        break;
      }
      if (ev.ctrlKey) {
        this.scrollDisp(-1);
      } else {
        str = '\x1b[A';
      }
      break;
    // down-arrow
    case 40:
      if (this.applicationKeypad) {
        str = '\x1bOB';
        break;
      }
      if (ev.ctrlKey) {
        this.scrollDisp(1);
      } else {
        str = '\x1b[B';
      }
      break;
    // delete
    case 46:
      str = '\x1b[3~';
      break;
    // insert
    case 45:
      str = '\x1b[2~';
      break;
    // home
    case 36:
      if (this.applicationKeypad) {
        str = '\x1bOH';
        break;
      }
      str = '\x1bOH';
      break;
    // end
    case 35:
      if (this.applicationKeypad) {
        str = '\x1bOF';
        break;
      }
      str = '\x1bOF';
      break;
    // page up
    case 33:
      if (ev.ctrlKey) {
        this.scrollDisp(-(this.rows - 1));
      } else {
        str = '\x1b[5~';
      }
      break;
    // page down
    case 34:
      if (ev.ctrlKey) {
        this.scrollDisp(this.rows - 1);
      } else {
        str = '\x1b[6~';
      }
      break;
    // F1
    case 112:
      str = '\x1bOP';
      break;
    // F2
    case 113:
      str = '\x1bOQ';
      break;
    // F3
    case 114:
      str = '\x1bOR';
      break;
    // F4
    case 115:
      str = '\x1bOS';
      break;
    // F5
    case 116:
      str = '\x1b[15~';
      break;
    // F6
    case 117:
      str = '\x1b[17~';
      break;
    // F7
    case 118:
      str = '\x1b[18~';
      break;
    // F8
    case 119:
      str = '\x1b[19~';
      break;
    // F9
    case 120:
      str = '\x1b[20~';
      break;
    // F10
    case 121:
      str = '\x1b[21~';
      break;
    // F11
    case 122:
      str = '\x1b[23~';
      break;
    // F12
    case 123:
      str = '\x1b[24~';
      break;
    default:
      // a-z and space
      if (ev.ctrlKey) {
        if (ev.keyCode >= 65 && ev.keyCode <= 90) {
          str = String.fromCharCode(ev.keyCode - 64);
        } else if (ev.keyCode === 32) {
          // NUL
          str = String.fromCharCode(0);
        } else if (ev.keyCode >= 51 && ev.keyCode <= 55) {
          // escape, file sep, group sep, record sep, unit sep
          str = String.fromCharCode(ev.keyCode - 51 + 27);
        } else if (ev.keyCode === 56) {
          // delete
          str = String.fromCharCode(127);
        }
      } else if ((!this.isMac && ev.altKey) || (this.isMac && ev.metaKey)) {
        if (ev.keyCode >= 65 && ev.keyCode <= 90) {
          str = '\x1b' + String.fromCharCode(ev.keyCode + 32);
        }
      }
      break;
  }

  if (str) {
    if (ev.stopPropagation) ev.stopPropagation();
    if (ev.preventDefault) ev.preventDefault();

    this.showCursor();
    this.keyState = 1;
    this.keyStr = str;
    this.handler(str);

    return false;
  } else {
    this.keyState = 0;
    return true;
  }
};

Terminal.prototype.keyPressHandler = function(ev) {
  var str = ''
    , key;

  if (ev.stopPropagation) ev.stopPropagation();
  if (ev.preventDefault) ev.preventDefault();

  if (!('charCode' in ev)) {
    key = ev.keyCode;
    if (this.keyState === 1) {
      this.keyState = 2;
      return false;
    } else if (this.keyState === 2) {
      this.showCursor();
      this.handler(this.keyStr);
      return false;
    }
  } else {
    key = ev.charCode;
  }

  if (key !== 0) {
    if (!ev.ctrlKey
        && ((!this.isMac && !ev.altKey)
        || (this.isMac && !ev.metaKey))) {
      str = String.fromCharCode(key);
    }
  }

  if (str) {
    this.showCursor();
    this.handler(str);
    return false;
  } else {
    return true;
  }
};

Terminal.prototype.queueChars = function(str) {
  var self = this;

  this.outputQueue += str;

  if (this.outputQueue) {
    setTimeout(function() {
      self.outputHandler();
    }, 1);
  }
};

Terminal.prototype.outputHandler = function() {
  if (this.outputQueue) {
    this.handler(this.outputQueue);
    this.outputQueue = '';
  }
};

Terminal.prototype.bell = function() {
  if (!this.useBell) return;
  var self = this;
  this.element.style.borderColor = 'white';
  setTimeout(function() {
    self.element.style.borderColor = '';
  }, 10);
};

Terminal.prototype.resize = function(x, y) {
  var line
    , el
    , i
    , j;

  if (x < 1) x = 1;
  if (y < 1) y = 1;

  // make sure the cursor stays on screen
  if (this.y >= y) this.y = y - 1;
  if (this.x >= x) this.x = x - 1;

  if (this.cols < x) {
    i = this.lines.length;
    while (i--) {
      while (this.lines[i].length < x) {
        this.lines[i].push((this.defAttr << 16) | 32);
      }
    }
  } else if (this.cols > x) {
    i = this.lines.length;
    while (i--) {
      while (this.lines[i].length > x) {
        this.lines[i].pop();
      }
    }
  }

  j = this.rows;
  if (j < y) {
    el = this.element;
    while (j++ < y) {
      if (this.lines.length < y + this.ybase) {
        this.lines.push(this.blankLine());
      }
      if (this.children.length < y) {
        line = document.createElement('div');
        line.className = 'term';
        el.appendChild(line);
        this.children.push(line);
      }
    }
  } else if (j > y) {
    while (j-- > y) {
      if (this.lines.length > y + this.ybase) {
        this.lines.shift();
      }
      if (this.children.length > y) {
        el = this.children.pop();
        if (!el) continue;
        el.parentNode.removeChild(el);
      }
    }
  }

  this.cols = x;
  this.rows = y;
  this.scrollTop = 0;
  this.scrollBottom = y - 1;
  this.refreshStart = 0;
  this.refreshEnd = y - 1;
  this.currentHeight = this.lines.length;
  if (this.currentHeight < this.rows) {
    this.currentHeight = this.rows;
  }

  this.refresh(0, this.rows - 1);

  // it's a real nightmare trying
  // to resize the original
  // screen buffer. just set it
  // to null for now.
  this.normal = null;
};

Terminal.prototype.getRows = function(y) {
  this.refreshStart = Math.min(this.refreshStart, y);
  this.refreshEnd = Math.max(this.refreshEnd, y);
};

Terminal.prototype.eraseLine = function(x, y) {
  var line, i, ch, row;

  row = this.ybase + y;

  if (row >= this.currentHeight) {
    row -= this.currentHeight;
  }

  line = this.lines[row];
  // screen:
  // ch = 32 | (this.defAttr << 16);
  // xterm, linux:
  ch = 32 | (this.curAttr << 16);

  for (i = x; i < this.cols; i++) {
    line[i] = ch;
  }

  this.getRows(y);
};

Terminal.prototype.blankLine = function(cur) {
  var attr = cur
    ? this.curAttr
    : this.defAttr;

  var ch = 32 | (attr << 16)
    , line = []
    , i = 0;

  for (; i < this.cols; i++) {
    line[i] = ch;
  }

  return line;
};

/**
 * ESC
 */

// ESC D Index (IND is 0x84).
Terminal.prototype.index = function() {
  this.y++;
  if (this.y >= this.scrollBottom + 1) {
    this.y--;
    this.scroll();
    this.refreshStart = 0;
    this.refreshEnd = this.rows - 1;
  }
  this.state = normal;
};

// ESC M Reverse Index (RI is 0x8d).
Terminal.prototype.reverseIndex = function() {
  var j;
  this.y--;
  if (this.y < this.scrollTop) {
    this.y++;
    // echo -ne '\e[1;1H\e[44m\eM\e[0m'
    // use this.blankLine(false) for screen behavior
    this.lines.splice(this.y + this.ybase, 0, this.blankLine(true));
    j = this.rows - 1 - this.scrollBottom;
    // add an extra one because we just added a line
    // maybe put this above
    this.lines.splice(this.rows - 1 + this.ybase - j + 1, 1);
    this.refreshStart = 0;
    this.refreshEnd = this.rows - 1;
  }
  this.state = normal;
};

// ESC c Full Reset (RIS).
Terminal.prototype.reset = function() {
  Terminal.call(this, this.cols, this.rows, this.handler);
};

/**
 * CSI
 */

// CSI Ps A
// Cursor Up Ps Times (default = 1) (CUU).
Terminal.prototype.cursorUp = function(params) {
  var param, row;
  param = params[0];
  if (param < 1) param = 1;
  this.y -= param;
  if (this.y < 0) this.y = 0;
};

// CSI Ps B
// Cursor Down Ps Times (default = 1) (CUD).
Terminal.prototype.cursorDown = function(params) {
  var param, row;
  param = params[0];
  if (param < 1) param = 1;
  this.y += param;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
};

// CSI Ps C
// Cursor Forward Ps Times (default = 1) (CUF).
Terminal.prototype.cursorForward = function(params) {
  var param, row;
  param = params[0];
  if (param < 1) param = 1;
  this.x += param;
  if (this.x >= this.cols - 1) {
    this.x = this.cols - 1;
  }
};

// CSI Ps D
// Cursor Backward Ps Times (default = 1) (CUB).
Terminal.prototype.cursorBackward = function(params) {
  var param, row;
  param = params[0];
  if (param < 1) param = 1;
  this.x -= param;
  if (this.x < 0) this.x = 0;
};

// CSI Ps ; Ps H
// Cursor Position [row;column] (default = [1,1]) (CUP).
Terminal.prototype.cursorPos = function(params) {
  var param, row, col;

  row = params[0] - 1;

  if (params.length >= 2) {
    col = params[1] - 1;
  } else {
    col = 0;
  }

  if (row < 0) {
    row = 0;
  } else if (row >= this.rows) {
    row = this.rows - 1;
  }

  if (col < 0) {
    col = 0;
  } else if (col >= this.cols) {
    col = this.cols - 1;
  }

  this.x = col;
  this.y = row;
};

// CSI Ps J  Erase in Display (ED).
//     Ps = 0  -> Erase Below (default).
//     Ps = 1  -> Erase Above.
//     Ps = 2  -> Erase All.
//     Ps = 3  -> Erase Saved Lines (xterm).
// CSI ? Ps J
//   Erase in Display (DECSED).
//     Ps = 0  -> Selective Erase Below (default).
//     Ps = 1  -> Selective Erase Above.
//     Ps = 2  -> Selective Erase All.
Terminal.prototype.eraseInDisplay = function(params) {
  var param, row, j;
  switch (params[0] || 0) {
    case 0:
      this.eraseLine(this.x, this.y);
      for (j = this.y + 1; j < this.rows; j++) {
        this.eraseLine(0, j);
      }
      break;
    case 1:
      this.eraseInLine([1]);
      j = this.y;
      while (j--) {
        this.eraseLine(0, j);
      }
      break;
    case 2:
      this.eraseInDisplay([0]);
      this.eraseInDisplay([1]);
      break;
    case 3:
      ; // no saved lines
      break;
  }
};

// CSI Ps K  Erase in Line (EL).
//     Ps = 0  -> Erase to Right (default).
//     Ps = 1  -> Erase to Left.
//     Ps = 2  -> Erase All.
// CSI ? Ps K
//   Erase in Line (DECSEL).
//     Ps = 0  -> Selective Erase to Right (default).
//     Ps = 1  -> Selective Erase to Left.
//     Ps = 2  -> Selective Erase All.
Terminal.prototype.eraseInLine = function(params) {
  switch (params[0] || 0) {
    case 0:
      this.eraseLine(this.x, this.y);
      break;
    case 1:
      var x = this.x + 1;
      var line = this.lines[this.ybase + this.y];
      // screen:
      //var ch = (this.defAttr << 16) | 32;
      // xterm, linux:
      var ch = (this.curAttr << 16) | 32;
      while (x--) line[x] = ch;
      break;
    case 2:
      var x = this.cols;
      var line = this.lines[this.ybase + this.y];
      // screen:
      //var ch = (this.defAttr << 16) | 32;
      // xterm, linux:
      var ch = (this.curAttr << 16) | 32;
      while (x--) line[x] = ch;
      break;
  }
};

// CSI Pm m  Character Attributes (SGR).
//     Ps = 0  -> Normal (default).
//     Ps = 1  -> Bold.
//     Ps = 4  -> Underlined.
//     Ps = 5  -> Blink (appears as Bold).
//     Ps = 7  -> Inverse.
//     Ps = 8  -> Invisible, i.e., hidden (VT300).
//     Ps = 2 2  -> Normal (neither bold nor faint).
//     Ps = 2 4  -> Not underlined.
//     Ps = 2 5  -> Steady (not blinking).
//     Ps = 2 7  -> Positive (not inverse).
//     Ps = 2 8  -> Visible, i.e., not hidden (VT300).
//     Ps = 3 0  -> Set foreground color to Black.
//     Ps = 3 1  -> Set foreground color to Red.
//     Ps = 3 2  -> Set foreground color to Green.
//     Ps = 3 3  -> Set foreground color to Yellow.
//     Ps = 3 4  -> Set foreground color to Blue.
//     Ps = 3 5  -> Set foreground color to Magenta.
//     Ps = 3 6  -> Set foreground color to Cyan.
//     Ps = 3 7  -> Set foreground color to White.
//     Ps = 3 9  -> Set foreground color to default (original).
//     Ps = 4 0  -> Set background color to Black.
//     Ps = 4 1  -> Set background color to Red.
//     Ps = 4 2  -> Set background color to Green.
//     Ps = 4 3  -> Set background color to Yellow.
//     Ps = 4 4  -> Set background color to Blue.
//     Ps = 4 5  -> Set background color to Magenta.
//     Ps = 4 6  -> Set background color to Cyan.
//     Ps = 4 7  -> Set background color to White.
//     Ps = 4 9  -> Set background color to default (original).

//   If 16-color support is compiled, the following apply.  Assume
//   that xterm's resources are set so that the ISO color codes are
//   the first 8 of a set of 16.  Then the aixterm colors are the
//   bright versions of the ISO colors:
//     Ps = 9 0  -> Set foreground color to Black.
//     Ps = 9 1  -> Set foreground color to Red.
//     Ps = 9 2  -> Set foreground color to Green.
//     Ps = 9 3  -> Set foreground color to Yellow.
//     Ps = 9 4  -> Set foreground color to Blue.
//     Ps = 9 5  -> Set foreground color to Magenta.
//     Ps = 9 6  -> Set foreground color to Cyan.
//     Ps = 9 7  -> Set foreground color to White.
//     Ps = 1 0 0  -> Set background color to Black.
//     Ps = 1 0 1  -> Set background color to Red.
//     Ps = 1 0 2  -> Set background color to Green.
//     Ps = 1 0 3  -> Set background color to Yellow.
//     Ps = 1 0 4  -> Set background color to Blue.
//     Ps = 1 0 5  -> Set background color to Magenta.
//     Ps = 1 0 6  -> Set background color to Cyan.
//     Ps = 1 0 7  -> Set background color to White.

//   If xterm is compiled with the 16-color support disabled, it
//   supports the following, from rxvt:
//     Ps = 1 0 0  -> Set foreground and background color to
//     default.

//   If 88- or 256-color support is compiled, the following apply.
//     Ps = 3 8  ; 5  ; Ps -> Set foreground color to the second
//     Ps.
//     Ps = 4 8  ; 5  ; Ps -> Set background color to the second
//     Ps.
Terminal.prototype.charAttributes = function(params) {
  var i, p;
  if (params.length === 0) {
    this.curAttr = this.defAttr;
  } else {
    for (i = 0; i < params.length; i++) {
      p = params[i];
      if (p >= 30 && p <= 37) {
        this.curAttr = (this.curAttr & ~(7 << 3)) | ((p - 30) << 3);
      } else if (p >= 40 && p <= 47) {
        this.curAttr = (this.curAttr & ~7) | (p - 40);
      } else if (p >= 90 && p <= 97) {
        this.curAttr = (this.curAttr & ~(7 << 3)) | ((p - 90) << 3);
      } else if (p >= 100 && p <= 107) {
        this.curAttr = (this.curAttr & ~7) | (p - 100);
      } else if (p === 0) {
        this.curAttr = this.defAttr;
      } else if (p === 1) {
        // bold text
        this.curAttr = this.curAttr | (1 << 8);
      } else if (p === 4) {
        // underlined text
        this.curAttr = this.curAttr | (4 << 8);
      } else if (p === 39) {
        // reset fg
        p = this.curAttr & 7;
        this.curAttr = (this.defAttr & ~7) | p;
      } else if (p === 49) {
        // reset bg
        p = (this.curAttr >> 3) & 7;
        this.curAttr = (this.defAttr & ~(7 << 3)) | (p << 3);
      }
    }
  }
};

// CSI Ps n  Device Status Report (DSR).
//     Ps = 5  -> Status Report.  Result (``OK'') is
//   CSI 0 n
//     Ps = 6  -> Report Cursor Position (CPR) [row;column].
//   Result is
//   CSI r ; c R
// CSI ? Ps n
//   Device Status Report (DSR, DEC-specific).
//     Ps = 6  -> Report Cursor Position (CPR) [row;column] as CSI
//     ? r ; c R (assumes page is zero).
//     Ps = 1 5  -> Report Printer status as CSI ? 1 0  n  (ready).
//     or CSI ? 1 1  n  (not ready).
//     Ps = 2 5  -> Report UDK status as CSI ? 2 0  n  (unlocked)
//     or CSI ? 2 1  n  (locked).
//     Ps = 2 6  -> Report Keyboard status as
//   CSI ? 2 7  ;  1  ;  0  ;  0  n  (North American).
//   The last two parameters apply to VT400 & up, and denote key-
//   board ready and LK01 respectively.
//     Ps = 5 3  -> Report Locator status as
//   CSI ? 5 3  n  Locator available, if compiled-in, or
//   CSI ? 5 0  n  No Locator, if not.
Terminal.prototype.deviceStatus = function(params) {
  if (this.prefix === '?') {
    // modern xterm doesnt seem to
    // respond to any of these except ?6, 6, and 5
    switch (params[0]) {
      case 6:
        this.queueChars('\x1b['
          + (this.y + 1)
          + ';'
          + (this.x + 1)
          + 'R');
        break;
      case 15:
        // no printer
        // this.queueChars('\x1b[?11n');
        break;
      case 25:
        // dont support user defined keys
        // this.queueChars('\x1b[?21n');
        break;
      case 26:
        // this.queueChars('\x1b[?27;1;0;0n');
        break;
      case 53:
        // no dec locator/mouse
        // this.queueChars('\x1b[?50n');
        break;
    }
    return;
  }
  switch (params[0]) {
    case 5:
      this.queueChars('\x1b[0n');
      break;
    case 6:
      this.queueChars('\x1b['
        + (this.y + 1)
        + ';'
        + (this.x + 1)
        + 'R');
      break;
  }
};

/**
 * Additions
 */

// CSI Ps @
// Insert Ps (Blank) Character(s) (default = 1) (ICH).
Terminal.prototype.insertChars = function(params) {
  var param, row, j;
  param = params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;
  j = this.x;
  while (param-- && j < this.cols) {
    // screen:
    //this.lines[row].splice(j++, 0, (this.defAttr << 16) | 32);
    // xterm, linux:
    this.lines[row].splice(j++, 0, (this.curAttr << 16) | 32);
    this.lines[row].pop();
  }
};

// CSI Ps E
// Cursor Next Line Ps Times (default = 1) (CNL).
Terminal.prototype.cursorNextLine = function(params) {
  var param, row;
  param = params[0];
  if (param < 1) param = 1;
  this.y += param;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
  // above is the same as CSI Ps B
  this.x = 0;
};

// CSI Ps F
// Cursor Preceding Line Ps Times (default = 1) (CNL).
Terminal.prototype.cursorPrecedingLine = function(params) {
  var param, row;
  param = params[0];
  if (param < 1) param = 1;
  this.y -= param;
  if (this.y < 0) this.y = 0;
  // above is the same as CSI Ps A
  this.x = 0;
};

// CSI Ps G
// Cursor Character Absolute  [column] (default = [row,1]) (CHA).
Terminal.prototype.cursorCharAbsolute = function(params) {
  var param, row;
  param = params[0];
  if (param < 1) param = 1;
  this.x = param - 1;
};

// CSI Ps L
// Insert Ps Line(s) (default = 1) (IL).
Terminal.prototype.insertLines = function(params) {
  var param, row, j;
  param = params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;

  j = this.rows - 1 - this.scrollBottom;
  // add an extra one because we added one
  // above
  j = this.rows - 1 + this.ybase - j + 1;

  while (param--) {
    // this.blankLine(false) for screen behavior
    // test: echo -e '\e[44m\e[1L\e[0m'
    this.lines.splice(row, 0, this.blankLine(true));
    this.lines.splice(j, 1);
  }

  //this.refresh(0, this.rows - 1);
  this.refreshStart = 0;
  this.refreshEnd = this.rows - 1;
};

// CSI Ps M
// Delete Ps Line(s) (default = 1) (DL).
Terminal.prototype.deleteLines = function(params) {
  var param, row, j;
  param = params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;

  j = this.rows - 1 - this.scrollBottom;
  j = this.rows - 1 + this.ybase - j;

  while (param--) {
    // this.blankLine(false) for screen behavior
    // test: echo -e '\e[44m\e[1M\e[0m'
    this.lines.splice(j + 1, 0, this.blankLine(true));
    this.lines.splice(row, 1);
  }

  //this.refresh(0, this.rows - 1);
  this.refreshStart = 0;
  this.refreshEnd = this.rows - 1;
};

// CSI Ps P
// Delete Ps Character(s) (default = 1) (DCH).
Terminal.prototype.deleteChars = function(params) {
  var param, row;
  param = params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;
  while (param--) {
    this.lines[row].splice(this.x, 1);
    // screen:
    //this.lines.push((this.defAttr << 16) | 32);
    // xterm, linux:
    this.lines.push((this.curAttr << 16) | 32);
  }
};

// CSI Ps X
// Erase Ps Character(s) (default = 1) (ECH).
Terminal.prototype.eraseChars = function(params) {
  var param, row, j;
  param = params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;
  j = this.x;
  while (param-- && j < this.cols) {
    // screen:
    // this.lines[row][j++] = (this.defAttr << 16) | 32;
    // xterm, linux:
    this.lines[row][j++] = (this.curAttr << 16) | 32;
  }
};

// CSI Pm `  Character Position Absolute
//   [column] (default = [row,1]) (HPA).
Terminal.prototype.charPosAbsolute = function(params) {
  var param, row;
  param = params[0];
  if (param < 1) param = 1;
  this.x = param - 1;
  if (this.x >= this.cols) {
    this.x = this.cols - 1;
  }
};

// 141 61 a * HPR -
// Horizontal Position Relative
Terminal.prototype.HPositionRelative = function(params) {
  var param, row;
  param = params[0];
  if (param < 1) param = 1;
  this.x += param;
  if (this.x >= this.cols - 1) {
    this.x = this.cols - 1;
  }
  // above is the same as CSI Ps C
};

// CSI Ps c  Send Device Attributes (Primary DA).
//     Ps = 0  or omitted -> request attributes from terminal.  The
//     response depends on the decTerminalID resource setting.
//     -> CSI ? 1 ; 2 c  (``VT100 with Advanced Video Option'')
//     -> CSI ? 1 ; 0 c  (``VT101 with No Options'')
//     -> CSI ? 6 c  (``VT102'')
//     -> CSI ? 6 0 ; 1 ; 2 ; 6 ; 8 ; 9 ; 1 5 ; c  (``VT220'')
//   The VT100-style response parameters do not mean anything by
//   themselves.  VT220 parameters do, telling the host what fea-
//   tures the terminal supports:
//     Ps = 1  -> 132-columns.
//     Ps = 2  -> Printer.
//     Ps = 6  -> Selective erase.
//     Ps = 8  -> User-defined keys.
//     Ps = 9  -> National replacement character sets.
//     Ps = 1 5  -> Technical characters.
//     Ps = 2 2  -> ANSI color, e.g., VT525.
//     Ps = 2 9  -> ANSI text locator (i.e., DEC Locator mode).
// CSI > Ps c
//   Send Device Attributes (Secondary DA).
//     Ps = 0  or omitted -> request the terminal's identification
//     code.  The response depends on the decTerminalID resource set-
//     ting.  It should apply only to VT220 and up, but xterm extends
//     this to VT100.
//     -> CSI  > Pp ; Pv ; Pc c
//   where Pp denotes the terminal type
//     Pp = 0  -> ``VT100''.
//     Pp = 1  -> ``VT220''.
//   and Pv is the firmware version (for xterm, this was originally
//   the XFree86 patch number, starting with 95).  In a DEC termi-
//   nal, Pc indicates the ROM cartridge registration number and is
//   always zero.
Terminal.prototype.sendDeviceAttributes = function(params) {
  // This severely breaks things if
  // TERM is set to `linux`. xterm
  // is fine.
  return;

  if (this.prefix !== '>') {
    this.queueChars('\x1b[?1;2c');
  } else {
    // say we're a vt100 with
    // firmware version 95
    // this.queueChars('\x1b[>0;95;0c');
    // modern xterm responds with:
    this.queueChars('\x1b[>0;276;0c');
  }
};

// CSI Pm d
// Line Position Absolute  [row] (default = [1,column]) (VPA).
Terminal.prototype.linePosAbsolute = function(params) {
  var param, row;
  param = params[0];
  if (param < 1) param = 1;
  this.y = param - 1;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
};

// 145 65 e * VPR - Vertical Position Relative
Terminal.prototype.VPositionRelative = function(params) {
  var param, row;
  param = params[0];
  if (param < 1) param = 1;
  this.y += param;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
  // above is same as CSI Ps B
};

// CSI Ps ; Ps f
//   Horizontal and Vertical Position [row;column] (default =
//   [1,1]) (HVP).
Terminal.prototype.HVPosition = function(params) {
  if (params[0] < 1) params[0] = 1;
  if (params[1] < 1) params[1] = 1;

  this.y = params[0] - 1;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }

  this.x = params[1] - 1;
  if (this.x >= this.cols) {
    this.x = this.cols - 1;
  }
};

// CSI Pm h  Set Mode (SM).
//     Ps = 2  -> Keyboard Action Mode (AM).
//     Ps = 4  -> Insert Mode (IRM).
//     Ps = 1 2  -> Send/receive (SRM).
//     Ps = 2 0  -> Automatic Newline (LNM).
// CSI ? Pm h
//   DEC Private Mode Set (DECSET).
//     Ps = 1  -> Application Cursor Keys (DECCKM).
//     Ps = 2  -> Designate USASCII for character sets G0-G3
//     (DECANM), and set VT100 mode.
//     Ps = 3  -> 132 Column Mode (DECCOLM).
//     Ps = 4  -> Smooth (Slow) Scroll (DECSCLM).
//     Ps = 5  -> Reverse Video (DECSCNM).
//     Ps = 6  -> Origin Mode (DECOM).
//     Ps = 7  -> Wraparound Mode (DECAWM).
//     Ps = 8  -> Auto-repeat Keys (DECARM).
//     Ps = 9  -> Send Mouse X & Y on button press.  See the sec-
//     tion Mouse Tracking.
//     Ps = 1 0  -> Show toolbar (rxvt).
//     Ps = 1 2  -> Start Blinking Cursor (att610).
//     Ps = 1 8  -> Print form feed (DECPFF).
//     Ps = 1 9  -> Set print extent to full screen (DECPEX).
//     Ps = 2 5  -> Show Cursor (DECTCEM).
//     Ps = 3 0  -> Show scrollbar (rxvt).
//     Ps = 3 5  -> Enable font-shifting functions (rxvt).
//     Ps = 3 8  -> Enter Tektronix Mode (DECTEK).
//     Ps = 4 0  -> Allow 80 -> 132 Mode.
//     Ps = 4 1  -> more(1) fix (see curses resource).
//     Ps = 4 2  -> Enable Nation Replacement Character sets (DECN-
//     RCM).
//     Ps = 4 4  -> Turn On Margin Bell.
//     Ps = 4 5  -> Reverse-wraparound Mode.
//     Ps = 4 6  -> Start Logging.  This is normally disabled by a
//     compile-time option.
//     Ps = 4 7  -> Use Alternate Screen Buffer.  (This may be dis-
//     abled by the titeInhibit resource).
//     Ps = 6 6  -> Application keypad (DECNKM).
//     Ps = 6 7  -> Backarrow key sends backspace (DECBKM).
//     Ps = 1 0 0 0  -> Send Mouse X & Y on button press and
//     release.  See the section Mouse Tracking.
//     Ps = 1 0 0 1  -> Use Hilite Mouse Tracking.
//     Ps = 1 0 0 2  -> Use Cell Motion Mouse Tracking.
//     Ps = 1 0 0 3  -> Use All Motion Mouse Tracking.
//     Ps = 1 0 0 4  -> Send FocusIn/FocusOut events.
//     Ps = 1 0 0 5  -> Enable Extended Mouse Mode.
//     Ps = 1 0 1 0  -> Scroll to bottom on tty output (rxvt).
//     Ps = 1 0 1 1  -> Scroll to bottom on key press (rxvt).
//     Ps = 1 0 3 4  -> Interpret "meta" key, sets eighth bit.
//     (enables the eightBitInput resource).
//     Ps = 1 0 3 5  -> Enable special modifiers for Alt and Num-
//     Lock keys.  (This enables the numLock resource).
//     Ps = 1 0 3 6  -> Send ESC   when Meta modifies a key.  (This
//     enables the metaSendsEscape resource).
//     Ps = 1 0 3 7  -> Send DEL from the editing-keypad Delete
//     key.
//     Ps = 1 0 3 9  -> Send ESC  when Alt modifies a key.  (This
//     enables the altSendsEscape resource).
//     Ps = 1 0 4 0  -> Keep selection even if not highlighted.
//     (This enables the keepSelection resource).
//     Ps = 1 0 4 1  -> Use the CLIPBOARD selection.  (This enables
//     the selectToClipboard resource).
//     Ps = 1 0 4 2  -> Enable Urgency window manager hint when
//     Control-G is received.  (This enables the bellIsUrgent
//     resource).
//     Ps = 1 0 4 3  -> Enable raising of the window when Control-G
//     is received.  (enables the popOnBell resource).
//     Ps = 1 0 4 7  -> Use Alternate Screen Buffer.  (This may be
//     disabled by the titeInhibit resource).
//     Ps = 1 0 4 8  -> Save cursor as in DECSC.  (This may be dis-
//     abled by the titeInhibit resource).
//     Ps = 1 0 4 9  -> Save cursor as in DECSC and use Alternate
//     Screen Buffer, clearing it first.  (This may be disabled by
//     the titeInhibit resource).  This combines the effects of the 1
//     0 4 7  and 1 0 4 8  modes.  Use this with terminfo-based
//     applications rather than the 4 7  mode.
//     Ps = 1 0 5 0  -> Set terminfo/termcap function-key mode.
//     Ps = 1 0 5 1  -> Set Sun function-key mode.
//     Ps = 1 0 5 2  -> Set HP function-key mode.
//     Ps = 1 0 5 3  -> Set SCO function-key mode.
//     Ps = 1 0 6 0  -> Set legacy keyboard emulation (X11R6).
//     Ps = 1 0 6 1  -> Set VT220 keyboard emulation.
//     Ps = 2 0 0 4  -> Set bracketed paste mode.
// Modes:
//   http://vt100.net/docs/vt220-rm/chapter4.html
Terminal.prototype.setMode = function(params) {
  if (typeof params === 'object') {
    while (params.length) this.setMode(params.shift());
    return;
  }

  if (this.prefix !== '?') {
    switch (params) {
      case 4:
        this.insertMode = true;
        break;
      case 20:
        //this.convertEol = true;
        break;
    }
  } else {
    switch (params) {
      case 1:
        this.applicationKeypad = true;
        break;
      case 6:
        this.originMode = true;
        break;
      case 7:
        this.wraparoundMode = true;
        break;
      case 9: // X10 Mouse
        // button press only.
        break;
      case 1000: // vt200 mouse
        // no wheel events, no motion.
        // no modifiers except control.
        // button press, release.
        break;
      case 1001: // vt200 highlight mouse
        // no wheel events, no motion.
        // first event is to send tracking instead
        // of button press, *then* button release.
        break;
      case 1002: // button event mouse
      case 1003: // any event mouse
        // button press, release, wheel, and motion.
        // no modifiers except control.
        console.log('binding to mouse events - warning: experimental!');
        this.mouseEvents = true;
        this.element.style.cursor = 'default';
        break;
      case 1004: // send focusin/focusout events
        // focusin: ^[[>I
        // focusout: ^[[>O
        break;
      case 1005: // utf8 ext mode mouse
        // for wide terminals
        // simply encodes large values as utf8 characters
        break;
      case 1006: // sgr ext mode mouse
        // for wide terminals
        // does not add 32 to fields
        // press: ^[[<b;x;yM
        // release: ^[[<b;x;ym
        break;
      case 1015: // urxvt ext mode mouse
        // for wide terminals
        // numbers for fields
        // press: ^[[b;x;yM
        // motion: ^[[b;x;yT
        break;
      case 25: // show cursor
        this.cursorHidden = false;
        break;
      case 1049: // alt screen buffer cursor
        //this.saveCursor();
        ; // FALL-THROUGH
      case 47: // alt screen buffer
      case 1047: // alt screen buffer
        if (!this.normal) {
          var normal = {
            lines: this.lines,
            currentHeight: this.currentHeight,
            ybase: this.ybase,
            ydisp: this.ydisp,
            x: this.x,
            y: this.y,
            scrollTop: this.scrollTop,
            scrollBottom: this.scrollBottom
          };
          this.reset();
          this.normal = normal;
        }
        break;
    }
  }
};

// CSI Pm l  Reset Mode (RM).
//     Ps = 2  -> Keyboard Action Mode (AM).
//     Ps = 4  -> Replace Mode (IRM).
//     Ps = 1 2  -> Send/receive (SRM).
//     Ps = 2 0  -> Normal Linefeed (LNM).
// CSI ? Pm l
//   DEC Private Mode Reset (DECRST).
//     Ps = 1  -> Normal Cursor Keys (DECCKM).
//     Ps = 2  -> Designate VT52 mode (DECANM).
//     Ps = 3  -> 80 Column Mode (DECCOLM).
//     Ps = 4  -> Jump (Fast) Scroll (DECSCLM).
//     Ps = 5  -> Normal Video (DECSCNM).
//     Ps = 6  -> Normal Cursor Mode (DECOM).
//     Ps = 7  -> No Wraparound Mode (DECAWM).
//     Ps = 8  -> No Auto-repeat Keys (DECARM).
//     Ps = 9  -> Don't send Mouse X & Y on button press.
//     Ps = 1 0  -> Hide toolbar (rxvt).
//     Ps = 1 2  -> Stop Blinking Cursor (att610).
//     Ps = 1 8  -> Don't print form feed (DECPFF).
//     Ps = 1 9  -> Limit print to scrolling region (DECPEX).
//     Ps = 2 5  -> Hide Cursor (DECTCEM).
//     Ps = 3 0  -> Don't show scrollbar (rxvt).
//     Ps = 3 5  -> Disable font-shifting functions (rxvt).
//     Ps = 4 0  -> Disallow 80 -> 132 Mode.
//     Ps = 4 1  -> No more(1) fix (see curses resource).
//     Ps = 4 2  -> Disable Nation Replacement Character sets (DEC-
//     NRCM).
//     Ps = 4 4  -> Turn Off Margin Bell.
//     Ps = 4 5  -> No Reverse-wraparound Mode.
//     Ps = 4 6  -> Stop Logging.  (This is normally disabled by a
//     compile-time option).
//     Ps = 4 7  -> Use Normal Screen Buffer.
//     Ps = 6 6  -> Numeric keypad (DECNKM).
//     Ps = 6 7  -> Backarrow key sends delete (DECBKM).
//     Ps = 1 0 0 0  -> Don't send Mouse X & Y on button press and
//     release.  See the section Mouse Tracking.
//     Ps = 1 0 0 1  -> Don't use Hilite Mouse Tracking.
//     Ps = 1 0 0 2  -> Don't use Cell Motion Mouse Tracking.
//     Ps = 1 0 0 3  -> Don't use All Motion Mouse Tracking.
//     Ps = 1 0 0 4  -> Don't send FocusIn/FocusOut events.
//     Ps = 1 0 0 5  -> Disable Extended Mouse Mode.
//     Ps = 1 0 1 0  -> Don't scroll to bottom on tty output
//     (rxvt).
//     Ps = 1 0 1 1  -> Don't scroll to bottom on key press (rxvt).
//     Ps = 1 0 3 4  -> Don't interpret "meta" key.  (This disables
//     the eightBitInput resource).
//     Ps = 1 0 3 5  -> Disable special modifiers for Alt and Num-
//     Lock keys.  (This disables the numLock resource).
//     Ps = 1 0 3 6  -> Don't send ESC  when Meta modifies a key.
//     (This disables the metaSendsEscape resource).
//     Ps = 1 0 3 7  -> Send VT220 Remove from the editing-keypad
//     Delete key.
//     Ps = 1 0 3 9  -> Don't send ESC  when Alt modifies a key.
//     (This disables the altSendsEscape resource).
//     Ps = 1 0 4 0  -> Do not keep selection when not highlighted.
//     (This disables the keepSelection resource).
//     Ps = 1 0 4 1  -> Use the PRIMARY selection.  (This disables
//     the selectToClipboard resource).
//     Ps = 1 0 4 2  -> Disable Urgency window manager hint when
//     Control-G is received.  (This disables the bellIsUrgent
//     resource).
//     Ps = 1 0 4 3  -> Disable raising of the window when Control-
//     G is received.  (This disables the popOnBell resource).
//     Ps = 1 0 4 7  -> Use Normal Screen Buffer, clearing screen
//     first if in the Alternate Screen.  (This may be disabled by
//     the titeInhibit resource).
//     Ps = 1 0 4 8  -> Restore cursor as in DECRC.  (This may be
//     disabled by the titeInhibit resource).
//     Ps = 1 0 4 9  -> Use Normal Screen Buffer and restore cursor
//     as in DECRC.  (This may be disabled by the titeInhibit
//     resource).  This combines the effects of the 1 0 4 7  and 1 0
//     4 8  modes.  Use this with terminfo-based applications rather
//     than the 4 7  mode.
//     Ps = 1 0 5 0  -> Reset terminfo/termcap function-key mode.
//     Ps = 1 0 5 1  -> Reset Sun function-key mode.
//     Ps = 1 0 5 2  -> Reset HP function-key mode.
//     Ps = 1 0 5 3  -> Reset SCO function-key mode.
//     Ps = 1 0 6 0  -> Reset legacy keyboard emulation (X11R6).
//     Ps = 1 0 6 1  -> Reset keyboard emulation to Sun/PC style.
//     Ps = 2 0 0 4  -> Reset bracketed paste mode.
Terminal.prototype.resetMode = function(params) {
  if (typeof params === 'object') {
    while (params.length) this.resetMode(params.shift());
    return;
  }

  if (this.prefix !== '?') {
    switch (params) {
      case 4:
        this.insertMode = false;
        break;
      case 20:
        //this.convertEol = false;
        break;
    }
  } else {
    switch (params) {
      case 1:
        this.applicationKeypad = false;
        break;
      case 6:
        this.originMode = false;
        break;
      case 7:
        this.wraparoundMode = false;
        break;
      case 9:
      case 1000:
      case 1001:
      case 1002:
      case 1003:
      case 1004:
      case 1005:
        this.mouseEvents = false;
        this.element.style.cursor = '';
        break;
      case 25: // hide cursor
        this.cursorHidden = true;
        break;
      case 1049: // alt screen buffer cursor
        ; // FALL-THROUGH
      case 47: // normal screen buffer
      case 1047: // normal screen buffer - clearing it first
        if (this.normal) {
          this.lines = this.normal.lines;
          this.currentHeight = this.normal.currentHeight;
          this.ybase = this.normal.ybase;
          this.ydisp = this.normal.ydisp;
          this.x = this.normal.x;
          this.y = this.normal.y;
          this.scrollTop = this.normal.scrollTop;
          this.scrollBottom = this.normal.scrollBottom;
          this.normal = null;
          // if (params === 1049) {
          //   this.x = this.savedX;
          //   this.y = this.savedY;
          // }
          this.refresh(0, this.rows - 1);
        }
        break;
    }
  }
};

// CSI Ps ; Ps r
//   Set Scrolling Region [top;bottom] (default = full size of win-
//   dow) (DECSTBM).
// CSI ? Pm r
Terminal.prototype.setScrollRegion = function(params) {
  if (this.prefix === '?') return;
  this.scrollTop = (params[0] || 1) - 1;
  this.scrollBottom = (params[1] || this.rows) - 1;
  this.x = 0;
  this.y = 0;
};

// CSI s     Save cursor (ANSI.SYS).
Terminal.prototype.saveCursor = function(params) {
  this.savedX = this.x;
  this.savedY = this.y;
};

// CSI u     Restore cursor (ANSI.SYS).
Terminal.prototype.restoreCursor = function(params) {
  this.x = this.savedX || 0;
  this.y = this.savedY || 0;
};

/**
 * Lesser Used
 */

// CSI Ps I  Cursor Forward Tabulation Ps tab stops (default = 1) (CHT).
Terminal.prototype.cursorForwardTab = function(params) {
  var row, param, line, ch;

  param = params[0] || 1;
  param = param * 8;
  row = this.y + this.ybase;
  line = this.lines[row];
  ch = (this.defAttr << 16) | 32;

  while (param--) {
    line.splice(this.x++, 0, ch);
    line.pop();
    if (this.x === this.cols) {
      this.x--;
      break;
    }
  }
};

// CSI Ps S  Scroll up Ps lines (default = 1) (SU).
Terminal.prototype.scrollUp = function(params) {
  var param = params[0] || 1;
  while (param--) {
    //this.lines.shift();
    //this.lines.push(this.blankLine());
    this.lines.splice(this.ybase + this.scrollTop, 1);
    // no need to add 1 here, because we removed a line
    this.lines.splice(this.ybase + this.scrollBottom, 0, this.blankLine());
  }
  this.refreshStart = 0;
  this.refreshEnd = this.rows - 1;
};

// CSI Ps T  Scroll down Ps lines (default = 1) (SD).
Terminal.prototype.scrollDown = function(params) {
  var param = params[0] || 1;
  while (param--) {
    //this.lines.pop();
    //this.lines.unshift(this.blankLine());
    this.lines.splice(this.ybase + this.scrollBottom, 1);
    this.lines.splice(this.ybase + this.scrollTop, 0, this.blankLine());
  }
  this.refreshStart = 0;
  this.refreshEnd = this.rows - 1;
};

// CSI Ps ; Ps ; Ps ; Ps ; Ps T
//   Initiate highlight mouse tracking.  Parameters are
//   [func;startx;starty;firstrow;lastrow].  See the section Mouse
//   Tracking.
Terminal.prototype.initMouseTracking = function(params) {
  console.log('mouse tracking');
};

// CSI > Ps; Ps T
//   Reset one or more features of the title modes to the default
//   value.  Normally, "reset" disables the feature.  It is possi-
//   ble to disable the ability to reset features by compiling a
//   different default for the title modes into xterm.
//     Ps = 0  -> Do not set window/icon labels using hexadecimal.
//     Ps = 1  -> Do not query window/icon labels using hexadeci-
//     mal.
//     Ps = 2  -> Do not set window/icon labels using UTF-8.
//     Ps = 3  -> Do not query window/icon labels using UTF-8.
//   (See discussion of "Title Modes").
Terminal.prototype.resetTitleModes = function(params) {
};

// CSI Ps Z  Cursor Backward Tabulation Ps tab stops (default = 1) (CBT).
Terminal.prototype.cursorBackwardTab = function(params) {
  var row, param, line, ch;

  param = params[0] || 1;
  param = param * 8;
  row = this.y + this.ybase;
  line = this.lines[row];
  ch = (this.defAttr << 16) | 32;

  while (param--) {
    line.splice(--this.x, 1);
    line.push(ch);
    if (this.x === 0) {
      break;
    }
  }
};

// CSI Ps b  Repeat the preceding graphic character Ps times (REP).
Terminal.prototype.repeatPrecedingCharacter = function(params) {
  var param = params[0] || 1;
  var line = this.lines[this.ybase + this.y];
  var ch = line[this.x - 1] || ((this.defAttr << 16) | 32);
  while (param--) line[this.x++] = ch;
};

// CSI Ps g  Tab Clear (TBC).
//     Ps = 0  -> Clear Current Column (default).
//     Ps = 3  -> Clear All.
Terminal.prototype.tabClear = function(params) {
};

// CSI Pm i  Media Copy (MC).
//     Ps = 0  -> Print screen (default).
//     Ps = 4  -> Turn off printer controller mode.
//     Ps = 5  -> Turn on printer controller mode.
// CSI ? Pm i
//   Media Copy (MC, DEC-specific).
//     Ps = 1  -> Print line containing cursor.
//     Ps = 4  -> Turn off autoprint mode.
//     Ps = 5  -> Turn on autoprint mode.
//     Ps = 1  0  -> Print composed display, ignores DECPEX.
//     Ps = 1  1  -> Print all pages.
Terminal.prototype.mediaCopy = function(params) {
};

// CSI > Ps; Ps m
//   Set or reset resource-values used by xterm to decide whether
//   to construct escape sequences holding information about the
//   modifiers pressed with a given key.  The first parameter iden-
//   tifies the resource to set/reset.  The second parameter is the
//   value to assign to the resource.  If the second parameter is
//   omitted, the resource is reset to its initial value.
//     Ps = 1  -> modifyCursorKeys.
//     Ps = 2  -> modifyFunctionKeys.
//     Ps = 4  -> modifyOtherKeys.
//   If no parameters are given, all resources are reset to their
//   initial values.
Terminal.prototype.setResources = function(params) {
};

// CSI > Ps n
//   Disable modifiers which may be enabled via the CSI > Ps; Ps m
//   sequence.  This corresponds to a resource value of "-1", which
//   cannot be set with the other sequence.  The parameter identi-
//   fies the resource to be disabled:
//     Ps = 1  -> modifyCursorKeys.
//     Ps = 2  -> modifyFunctionKeys.
//     Ps = 4  -> modifyOtherKeys.
//   If the parameter is omitted, modifyFunctionKeys is disabled.
//   When modifyFunctionKeys is disabled, xterm uses the modifier
//   keys to make an extended sequence of functions rather than
//   adding a parameter to each function key to denote the modi-
//   fiers.
Terminal.prototype.disableModifiers = function(params) {
};

// CSI > Ps p
//   Set resource value pointerMode.  This is used by xterm to
//   decide whether to hide the pointer cursor as the user types.
//   Valid values for the parameter:
//     Ps = 0  -> never hide the pointer.
//     Ps = 1  -> hide if the mouse tracking mode is not enabled.
//     Ps = 2  -> always hide the pointer.  If no parameter is
//     given, xterm uses the default, which is 1 .
Terminal.prototype.setPointerMode = function(params) {
};

// CSI ! p   Soft terminal reset (DECSTR).
Terminal.prototype.softReset = function(params) {
  this.reset();
};

// CSI Ps$ p
//   Request ANSI mode (DECRQM).  For VT300 and up, reply is
//     CSI Ps; Pm$ y
//   where Ps is the mode number as in RM, and Pm is the mode
//   value:
//     0 - not recognized
//     1 - set
//     2 - reset
//     3 - permanently set
//     4 - permanently reset
Terminal.prototype.requestAnsiMode = function(params) {
};

// CSI ? Ps$ p
//   Request DEC private mode (DECRQM).  For VT300 and up, reply is
//     CSI ? Ps; Pm$ p
//   where Ps is the mode number as in DECSET, Pm is the mode value
//   as in the ANSI DECRQM.
Terminal.prototype.requestPrivateMode = function(params) {
};

// CSI Ps ; Ps " p
//   Set conformance level (DECSCL).  Valid values for the first
//   parameter:
//     Ps = 6 1  -> VT100.
//     Ps = 6 2  -> VT200.
//     Ps = 6 3  -> VT300.
//   Valid values for the second parameter:
//     Ps = 0  -> 8-bit controls.
//     Ps = 1  -> 7-bit controls (always set for VT100).
//     Ps = 2  -> 8-bit controls.
Terminal.prototype.setConformanceLevel = function(params) {
};

// CSI Ps q  Load LEDs (DECLL).
//     Ps = 0  -> Clear all LEDS (default).
//     Ps = 1  -> Light Num Lock.
//     Ps = 2  -> Light Caps Lock.
//     Ps = 3  -> Light Scroll Lock.
//     Ps = 2  1  -> Extinguish Num Lock.
//     Ps = 2  2  -> Extinguish Caps Lock.
//     Ps = 2  3  -> Extinguish Scroll Lock.
Terminal.prototype.loadLEDs = function(params) {
};

// CSI Ps SP q
//   Set cursor style (DECSCUSR, VT520).
//     Ps = 0  -> blinking block.
//     Ps = 1  -> blinking block (default).
//     Ps = 2  -> steady block.
//     Ps = 3  -> blinking underline.
//     Ps = 4  -> steady underline.
Terminal.prototype.setCursorStyle = function(params) {
};

// CSI Ps " q
//   Select character protection attribute (DECSCA).  Valid values
//   for the parameter:
//     Ps = 0  -> DECSED and DECSEL can erase (default).
//     Ps = 1  -> DECSED and DECSEL cannot erase.
//     Ps = 2  -> DECSED and DECSEL can erase.
Terminal.prototype.setCharProtectionAttr = function(params) {
};

// CSI ? Pm r
//   Restore DEC Private Mode Values.  The value of Ps previously
//   saved is restored.  Ps values are the same as for DECSET.
Terminal.prototype.restorePrivateValues = function(params) {
};

// CSI Pt; Pl; Pb; Pr; Ps$ r
//   Change Attributes in Rectangular Area (DECCARA), VT400 and up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
//     Ps denotes the SGR attributes to change: 0, 1, 4, 5, 7.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.setAttrInRectangle = function(params) {
  var t = params[0]
    , l = params[1]
    , b = params[2]
    , r = params[3]
    , attr = params[4];

  var line
    , i;

  for (; t < b + 1; t++) {
    line = this.lines[this.ybase + t];
    for (i = l; i < r; i++) {
      line[i] = (attr << 16) | (line[i] & 0xFFFF);
    }
  }
};

// CSI ? Pm s
//   Save DEC Private Mode Values.  Ps values are the same as for
//   DECSET.
Terminal.prototype.savePrivateValues = function(params) {
};

// CSI Ps ; Ps ; Ps t
//   Window manipulation (from dtterm, as well as extensions).
//   These controls may be disabled using the allowWindowOps
//   resource.  Valid values for the first (and any additional
//   parameters) are:
//     Ps = 1  -> De-iconify window.
//     Ps = 2  -> Iconify window.
//     Ps = 3  ;  x ;  y -> Move window to [x, y].
//     Ps = 4  ;  height ;  width -> Resize the xterm window to
//     height and width in pixels.
//     Ps = 5  -> Raise the xterm window to the front of the stack-
//     ing order.
//     Ps = 6  -> Lower the xterm window to the bottom of the
//     stacking order.
//     Ps = 7  -> Refresh the xterm window.
//     Ps = 8  ;  height ;  width -> Resize the text area to
//     [height;width] in characters.
//     Ps = 9  ;  0  -> Restore maximized window.
//     Ps = 9  ;  1  -> Maximize window (i.e., resize to screen
//     size).
//     Ps = 1 0  ;  0  -> Undo full-screen mode.
//     Ps = 1 0  ;  1  -> Change to full-screen.
//     Ps = 1 1  -> Report xterm window state.  If the xterm window
//     is open (non-iconified), it returns CSI 1 t .  If the xterm
//     window is iconified, it returns CSI 2 t .
//     Ps = 1 3  -> Report xterm window position.  Result is CSI 3
//     ; x ; y t
//     Ps = 1 4  -> Report xterm window in pixels.  Result is CSI
//     4  ;  height ;  width t
//     Ps = 1 8  -> Report the size of the text area in characters.
//     Result is CSI  8  ;  height ;  width t
//     Ps = 1 9  -> Report the size of the screen in characters.
//     Result is CSI  9  ;  height ;  width t
//     Ps = 2 0  -> Report xterm window's icon label.  Result is
//     OSC  L  label ST
//     Ps = 2 1  -> Report xterm window's title.  Result is OSC  l
//     label ST
//     Ps = 2 2  ;  0  -> Save xterm icon and window title on
//     stack.
//     Ps = 2 2  ;  1  -> Save xterm icon title on stack.
//     Ps = 2 2  ;  2  -> Save xterm window title on stack.
//     Ps = 2 3  ;  0  -> Restore xterm icon and window title from
//     stack.
//     Ps = 2 3  ;  1  -> Restore xterm icon title from stack.
//     Ps = 2 3  ;  2  -> Restore xterm window title from stack.
//     Ps >= 2 4  -> Resize to Ps lines (DECSLPP).
Terminal.prototype.manipulateWindow = function(params) {
};

// CSI Pt; Pl; Pb; Pr; Ps$ t
//   Reverse Attributes in Rectangular Area (DECRARA), VT400 and
//   up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
//     Ps denotes the attributes to reverse, i.e.,  1, 4, 5, 7.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.reverseAttrInRectangle = function(params) {
};

// CSI > Ps; Ps t
//   Set one or more features of the title modes.  Each parameter
//   enables a single feature.
//     Ps = 0  -> Set window/icon labels using hexadecimal.
//     Ps = 1  -> Query window/icon labels using hexadecimal.
//     Ps = 2  -> Set window/icon labels using UTF-8.
//     Ps = 3  -> Query window/icon labels using UTF-8.  (See dis-
//     cussion of "Title Modes")
Terminal.prototype.setTitleModeFeature = function(params) {
};

// CSI Ps SP t
//   Set warning-bell volume (DECSWBV, VT520).
//     Ps = 0  or 1  -> off.
//     Ps = 2 , 3  or 4  -> low.
//     Ps = 5 , 6 , 7 , or 8  -> high.
Terminal.prototype.setWarningBellVolume = function(params) {
};

// CSI Ps SP u
//   Set margin-bell volume (DECSMBV, VT520).
//     Ps = 1  -> off.
//     Ps = 2 , 3  or 4  -> low.
//     Ps = 0 , 5 , 6 , 7 , or 8  -> high.
Terminal.prototype.setMarginBellVolume = function(params) {
};

// CSI Pt; Pl; Pb; Pr; Pp; Pt; Pl; Pp$ v
//   Copy Rectangular Area (DECCRA, VT400 and up).
//     Pt; Pl; Pb; Pr denotes the rectangle.
//     Pp denotes the source page.
//     Pt; Pl denotes the target location.
//     Pp denotes the target page.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.copyRectangle = function(params) {
};

// CSI Pt ; Pl ; Pb ; Pr ' w
//   Enable Filter Rectangle (DECEFR), VT420 and up.
//   Parameters are [top;left;bottom;right].
//   Defines the coordinates of a filter rectangle and activates
//   it.  Anytime the locator is detected outside of the filter
//   rectangle, an outside rectangle event is generated and the
//   rectangle is disabled.  Filter rectangles are always treated
//   as "one-shot" events.  Any parameters that are omitted default
//   to the current locator position.  If all parameters are omit-
//   ted, any locator motion will be reported.  DECELR always can-
//   cels any prevous rectangle definition.
Terminal.prototype.enableFilterRectangle = function(params) {
};

// CSI Ps x  Request Terminal Parameters (DECREQTPARM).
//   if Ps is a "0" (default) or "1", and xterm is emulating VT100,
//   the control sequence elicits a response of the same form whose
//   parameters describe the terminal:
//     Ps -> the given Ps incremented by 2.
//     Pn = 1  <- no parity.
//     Pn = 1  <- eight bits.
//     Pn = 1  <- 2  8  transmit 38.4k baud.
//     Pn = 1  <- 2  8  receive 38.4k baud.
//     Pn = 1  <- clock multiplier.
//     Pn = 0  <- STP flags.
Terminal.prototype.requestParameters = function(params) {
};

// CSI Ps x  Select Attribute Change Extent (DECSACE).
//     Ps = 0  -> from start to end position, wrapped.
//     Ps = 1  -> from start to end position, wrapped.
//     Ps = 2  -> rectangle (exact).
Terminal.prototype.__ = function(params) {
};

// CSI Pc; Pt; Pl; Pb; Pr$ x
//   Fill Rectangular Area (DECFRA), VT420 and up.
//     Pc is the character to use.
//     Pt; Pl; Pb; Pr denotes the rectangle.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.fillRectangle = function(params) {
  var ch = params[0]
    , t = params[1]
    , l = params[2]
    , b = params[3]
    , r = params[4];

  var line
    , i;

  for (; t < b + 1; t++) {
    line = this.lines[this.ybase + t];
    for (i = l; i < r; i++) {
      line[i] = ((line[i] >> 16) << 16) | ch;
    }
  }
};

// CSI Ps ; Pu ' z
//   Enable Locator Reporting (DECELR).
//   Valid values for the first parameter:
//     Ps = 0  -> Locator disabled (default).
//     Ps = 1  -> Locator enabled.
//     Ps = 2  -> Locator enabled for one report, then disabled.
//   The second parameter specifies the coordinate unit for locator
//   reports.
//   Valid values for the second parameter:
//     Pu = 0  <- or omitted -> default to character cells.
//     Pu = 1  <- device physical pixels.
//     Pu = 2  <- character cells.
Terminal.prototype.enableLocatorReporting = function(params) {
};

// CSI Pt; Pl; Pb; Pr$ z
//   Erase Rectangular Area (DECERA), VT400 and up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.eraseRectangle = function(params) {
  var t = params[0]
    , l = params[1]
    , b = params[2]
    , r = params[3];

  var line
    , i;

  for (; t < b + 1; t++) {
    line = this.lines[this.ybase + t];
    for (i = l; i < r; i++) {
      // curAttr for xterm behavior?
      line[i] = (this.curAttr << 16) | 32;
    }
  }
};

// CSI Pm ' {
//   Select Locator Events (DECSLE).
//   Valid values for the first (and any additional parameters)
//   are:
//     Ps = 0  -> only respond to explicit host requests (DECRQLP).
//                (This is default).  It also cancels any filter
//   rectangle.
//     Ps = 1  -> report button down transitions.
//     Ps = 2  -> do not report button down transitions.
//     Ps = 3  -> report button up transitions.
//     Ps = 4  -> do not report button up transitions.
Terminal.prototype.setLocatorEvents = function(params) {
};

// CSI Pt; Pl; Pb; Pr$ {
//   Selective Erase Rectangular Area (DECSERA), VT400 and up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
Terminal.prototype.selectiveEraseRectangle = function(params) {
};

// CSI Ps ' |
//   Request Locator Position (DECRQLP).
//   Valid values for the parameter are:
//     Ps = 0 , 1 or omitted -> transmit a single DECLRP locator
//     report.

//   If Locator Reporting has been enabled by a DECELR, xterm will
//   respond with a DECLRP Locator Report.  This report is also
//   generated on button up and down events if they have been
//   enabled with a DECSLE, or when the locator is detected outside
//   of a filter rectangle, if filter rectangles have been enabled
//   with a DECEFR.

//     -> CSI Pe ; Pb ; Pr ; Pc ; Pp &  w

//   Parameters are [event;button;row;column;page].
//   Valid values for the event:
//     Pe = 0  -> locator unavailable - no other parameters sent.
//     Pe = 1  -> request - xterm received a DECRQLP.
//     Pe = 2  -> left button down.
//     Pe = 3  -> left button up.
//     Pe = 4  -> middle button down.
//     Pe = 5  -> middle button up.
//     Pe = 6  -> right button down.
//     Pe = 7  -> right button up.
//     Pe = 8  -> M4 button down.
//     Pe = 9  -> M4 button up.
//     Pe = 1 0  -> locator outside filter rectangle.
//   ``button'' parameter is a bitmask indicating which buttons are
//     pressed:
//     Pb = 0  <- no buttons down.
//     Pb & 1  <- right button down.
//     Pb & 2  <- middle button down.
//     Pb & 4  <- left button down.
//     Pb & 8  <- M4 button down.
//   ``row'' and ``column'' parameters are the coordinates of the
//     locator position in the xterm window, encoded as ASCII deci-
//     mal.
//   The ``page'' parameter is not used by xterm, and will be omit-
//   ted.
Terminal.prototype.requestLocatorPosition = function(params) {
};

// CSI P m SP }
// Insert P s Column(s) (default = 1) (DECIC), VT420 and up.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.insertColumns = function() {
  param = params[0];

  var l = this.ybase + this.rows
    , i;

  while (param--) {
    for (i = this.ybase; i < l; i++) {
      // xterm behavior uses curAttr?
      this.lines[i].splice(this.x + 1, 0, (this.defAttr << 16) | 32);
      this.lines[i].pop();
    }
  }
};

// CSI P m SP ~
// Delete P s Column(s) (default = 1) (DECDC), VT420 and up
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.deleteColumns = function() {
  param = params[0];

  var l = this.ybase + this.rows
    , i;

  while (param--) {
    for (i = this.ybase; i < l; i++) {
      this.lines[i].splice(this.x, 1);
      // xterm behavior uses curAttr?
      this.lines[i].push((this.defAttr << 16) | 32);
    }
  }
};

/**
 * Character Sets
 */

// DEC Special Character and Line Drawing Set.
// http://vt100.net/docs/vt102-ug/table5-13.html
// A lot of curses apps use this if they see TERM=xterm.
// testing: echo -e '\e(0a\e(B'
// The real xterm output seems to conflict with the
// reference above. The table below uses
// the exact same charset xterm outputs.
var SCLD = {
  95: 0x005f, // '_' - blank ? should this be ' ' ?
  96: 0x25c6, // '◆'
  97: 0x2592, // '▒'
  98: 0x0062, // 'b' - should this be: '\t' ?
  99: 0x0063, // 'c' - should this be: '\f' ?
  100: 0x0064, // 'd' - should this be: '\r' ?
  101: 0x0065, // 'e' - should this be: '\n' ?
  102: 0x00b0, // '°'
  103: 0x00b1, // '±'
  104: 0x2592, // '▒' - NL ? should this be '\n' ?
  105: 0x2603, // '☃' - VT ? should this be '\v' ?
  106: 0x2518, // '┘'
  107: 0x2510, // '┐'
  108: 0x250c, // '┌'
  109: 0x2514, // '└'
  110: 0x253c, // '┼'
  111: 0x23ba, // '⎺'
  112: 0x23bb, // '⎻'
  113: 0x2500, // '─'
  114: 0x23bc, // '⎼'
  115: 0x23bd, // '⎽'
  116: 0x251c, // '├'
  117: 0x2524, // '┤'
  118: 0x2534, // '┴'
  119: 0x252c, // '┬'
  120: 0x2502, // '│'
  121: 0x2264, // '≤'
  122: 0x2265, // '≥'
  123: 0x03c0, // 'π'
  124: 0x2260, // '≠'
  125: 0x00a3, // '£'
  126: 0x00b7  // '·'
};

/**
 * Expose
 */

this.Terminal = Terminal;

}).call(this);
