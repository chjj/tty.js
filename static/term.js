/**
 * Javascript Terminal
 *
 * Copyright (c) 2011 Fabrice Bellard
 *
 * Redistribution or commercial use is prohibited without the author's
 * permission.
*/

;(function() {

/**
 * Originally taken from [http://bellard.org/jslinux/]
 * with the author's permission.
 */

'use strict';

/**
 * States
 */

var normal = 0
  , escaped = 1
  , csi = 2
  , osc = 3;

/**
 * Terminal
 */

function Term(cols, rows, handler) {
  this.cols = cols;
  this.rows = rows;
  this.currentHeight = rows;
  this.totalHeight = 1000;
  this.ybase = 0;
  this.ydisp = 0;
  this.x = 0;
  this.y = 0;
  this.cursorState = 0;
  this.cursorHidden = false;
  this.handler = handler;
  this.convertEol = false;
  this.state = 0;
  this.outputQueue = '';
  this.scrollTop = 0;
  this.scrollBottom = this.rows - 1;

  this.bgColors = [
    '#000000',
    '#ff0000',
    '#00ff00',
    '#ffff00',
    '#0000ff',
    '#ff00ff',
    '#00ffff',
    '#ffffff'
  ];

  this.fgColors = [
    '#000000',
    '#ff0000',
    '#00ff00',
    '#ffff00',
    '#0000ff',
    '#ff00ff',
    '#00ffff',
    '#ffffff'
  ];

  this.defAttr = (7 << 3) | 0;
  this.curAttr = this.defAttr;
  this.isMac = ~navigator.userAgent.indexOf('Mac');
  this.keyState = 0;
  this.keyStr = '';

  this.params = [];
  this.currentParam = 0;

  this.element = document.createElement('table');
}

Term.prototype.open = function() {
  var self = this
    , html = ''
    , line
    , y
    , i
    , ch;

  this.lines = [];
  ch = 32 | (this.defAttr << 16);

  for (y = 0; y < this.currentHeight; y++) {
    line = [];
    for (i = 0; i < this.cols; i++) {
      line[i] = ch;
    }
    this.lines[y] = line;
  }

  for (y = 0; y < this.rows; y++) {
    html += '<tr><td class="term" id="tline' + y + '"></td></tr>';
  }

  this.element.innerHTML = html;
  document.body.appendChild(this.element);

  this.refresh(0, this.rows - 1);

  document.addEventListener('keydown', function(key) {
    return self.keyDownHandler(key);
  }, true);

  document.addEventListener('keypress', function(key) {
    return self.keyPressHandler(key);
  }, true);

  setInterval(function() {
    self.cursorBlink();
  }, 500);
};

Term.prototype.refresh = function(start, end) {
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

    element = document.getElementById('tline' + y);
    element.innerHTML = out;
  }
};

Term.prototype.cursorBlink = function() {
  this.cursorState ^= 1;
  this.refresh(this.y, this.y);
};

Term.prototype.showCursor = function() {
  if (!this.cursorState) {
    this.cursorState = 1;
    this.refresh(this.y, this.y);
  }
};

Term.prototype.scroll = function() {
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
    this.ybase--;
    this.ydisp = this.ybase;
    this.lines.splice(this.ybase + this.scrollTop, 1);
  }
};

Term.prototype.scrollDisp = function(disp) {
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

Term.prototype.write = function(str) {
  //console.log(JSON.stringify(str.replace(/\x1b/g, '^[')));

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
          case '[': // csi
            this.params = [];
            this.currentParam = 0;
            this.state = csi;
            break;

          case ']': // osc
            this.params = [];
            this.currentParam = 0;
            this.state = osc;
            break;

          case 'P': // dcs
            this.state = osc;
            break;

          case '_': // apc
            this.state = osc;
            break;

          case '^': // pm
            this.state = osc;
            break;

          case 'c': // full reset
            this.reset();
            break;

          case 'E': // next line
            this.x = 0;
            ; // FALL-THROUGH
          case 'D': // index
            this.index();
            break;

          case 'M': // reverse index
            this.reverseIndex();
            break;

          case '%': // encoding changes
          case '(':
          case ')':
          case '*':
          case '+':
          case '-':
          case '.':
          case '/':
            console.log('Serial port requested encoding change');
            this.state = normal;
            break;

          case '7': // save cursor pos
            this.saveCursor();
            this.state = normal;
            break;

          case '8': // restore cursor pos
            this.restoreCursor();
            this.state = normal;
            break;

          case '#': // line height/width
            this.state = normal;
            break;

          case 'H': // tab set
            // this.tabSet(this.x);
            this.state = normal;
            break;

          default:
            this.state = normal;
            break;
        }
        break;

      case osc:
        if (ch !== 27 && ch !== 7) break;
        console.log('Unknown OSC code.');
        this.state = normal;
        // increment for the trailing slash in ST
        if (ch === 27) i++;
        break;

      case csi:
        // '?' or '>'
        if (ch === 63 || ch === 62) {
          this.prefix = str[i];
          break;
        }

        // 0 - 9
        if (ch >= 48 && ch <= 57) {
          this.currentParam = this.currentParam * 10 + ch - 48;
        } else {
          this.params[this.params.length] = this.currentParam;
          this.currentParam = 0;

          // ';'
          if (ch === 59) break;

          // '$', '"', ' ', '\''
          if (ch === 36 || ch === 34 || ch === 32 || ch === 39) {
            this.postfix = str[i];
            break;
          }

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

            // ADDITIONS:
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

Term.prototype.writeln = function(str) {
  this.write(str + '\r\n');
};

Term.prototype.keyDownHandler = function(ev) {
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
      str = '\x1b[D';
      break;
    // right-arrow
    case 39:
      str = '\x1b[C';
      break;
    // up-arrow
    case 38:
      if (ev.ctrlKey) {
        this.scrollDisp(-1);
      } else {
        str = '\x1b[A';
      }
      break;
    // down-arrow
    case 40:
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
      str = '\x1bOH';
      break;
    // end
    case 35:
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
    default:
      // a-z and space
      if (ev.ctrlKey) {
        if (ev.keyCode >= 65 && ev.keyCode <= 90) {
          str = String.fromCharCode(ev.keyCode - 64);
        } else if (ev.keyCode === 32) {
          str = String.fromCharCode(0);
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

Term.prototype.keyPressHandler = function(ev) {
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

Term.prototype.queueChars = function(str) {
  var self = this;

  this.outputQueue += str;

  if (this.outputQueue) {
    setTimeout(function() {
      self.outputHandler();
    }, 1);
  }
};

Term.prototype.outputHandler = function() {
  if (this.outputQueue) {
    this.handler(this.outputQueue);
    this.outputQueue = '';
  }
};

Term.prototype.bell = function() {
  if (!this.useBell) return;
  var self = this;
  this.element.style.borderColor = 'white';
  setTimeout(function() {
    self.element.style.borderColor = '';
  }, 10);
};

Term.prototype.getRows = function(y) {
  this.refreshStart = Math.min(this.refreshStart, y);
  this.refreshEnd = Math.max(this.refreshEnd, y);
};

Term.prototype.eraseLine = function(x, y) {
  var line, i, ch, row;

  row = this.ybase + y;

  if (row >= this.currentHeight) {
    row -= this.currentHeight;
  }

  line = this.lines[row];
  ch = 32 | (this.defAttr << 16);

  for (i = x; i < this.cols; i++) {
    line[i] = ch;
  }

  this.getRows(y);
};

Term.prototype.blankLine = function() {
  var ch = 32 | (this.defAttr << 16)
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

// ESC D
Term.prototype.index = function() {
  this.y++;
  if (this.y >= this.scrollBottom + 1) {
    this.y--;
    this.scroll();
    this.refreshStart = 0;
    this.refreshEnd = this.rows - 1;
  }
  this.state = normal;
};

// ESC M
Term.prototype.reverseIndex = function() {
  var j;
  this.y--;
  if (this.y < this.scrollTop) {
    this.y++;
    this.lines.splice(this.y + this.ybase, 0, []);
    this.eraseLine(this.x, this.y);
    j = this.rows - 1 - this.scrollBottom;
    // add an extra one because we just added a line
    // maybe put this above
    this.lines.splice(this.rows - 1 + this.ybase - j + 1, 1);
  }
  this.state = normal;
};

// ESC c
Term.prototype.reset = function() {
  this.currentHeight = this.rows;
  this.ybase = 0;
  this.ydisp = 0;
  this.x = 0;
  this.y = 0;
  this.cursorState = 0;
  this.convertEol = false;
  this.state = 0;
  this.outputQueue = '';
  this.scrollTop = 0;
  this.scrollBottom = this.rows - 1;

  var j = this.rows - 1;
  this.lines = [ this.blankLine() ];
  while (j--) {
    this.lines.push(this.lines[0].slice());
  }
};

/**
 * CSI
 */

// CSI Ps A
// Cursor Up Ps Times (default = 1) (CUU).
Term.prototype.cursorUp = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.y -= param;
  if (this.y < 0) this.y = 0;
};

// CSI Ps B
// Cursor Down Ps Times (default = 1) (CUD).
Term.prototype.cursorDown = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.y += param;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
};

// CSI Ps C
// Cursor Forward Ps Times (default = 1) (CUF).
Term.prototype.cursorForward = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.x += param;
  if (this.x >= this.cols - 1) {
    this.x = this.cols - 1;
  }
};

// CSI Ps D
// Cursor Backward Ps Times (default = 1) (CUB).
Term.prototype.cursorBackward = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.x -= param;
  if (this.x < 0) this.x = 0;
};

// CSI Ps ; Ps H
// Cursor Position [row;column] (default = [1,1]) (CUP).
Term.prototype.cursorPos = function(params) {
  var param, row, col;

  row = this.params[0] - 1;

  if (this.params.length >= 2) {
    col = this.params[1] - 1;
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
//   Ps = 0  -> Erase Below (default).
//   Ps = 1  -> Erase Above.
//   Ps = 2  -> Erase All.
//   Ps = 3  -> Erase Saved Lines (xterm).
// Not fully implemented.
Term.prototype.eraseInDisplay = function(params) {
  var param, row, j;
  this.eraseLine(this.x, this.y);
  for (j = this.y + 1; j < this.rows; j++) {
    this.eraseLine(0, j);
  }
};

// CSI Ps K  Erase in Line (EL).
//   Ps = 0  -> Erase to Right (default).
//   Ps = 1  -> Erase to Left.
//   Ps = 2  -> Erase All.
// Not fully implemented.
Term.prototype.eraseInLine = function(params) {
  this.eraseLine(this.x, this.y);
};

// CSI Pm m  Character Attributes (SGR).
Term.prototype.charAttributes = function(params) {
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
      } else if (p === 0) {
        this.curAttr = this.defAttr;
      } else if (p === 1) {
        // bold text
        this.curAttr = this.curAttr | (1 << 8);
      } else if (p === 4) {
        // underlined text
        this.curAttr = this.curAttr | (4 << 8);
      }
    }
  }
};

// CSI Ps n  Device Status Report (DSR).
Term.prototype.deviceStatus = function(params) {
  switch (this.params[0]) {
    case 5:
      this.queueChars('\x1b[0n');
      break;
    case 6:
      this.queueChars('\x1b['
        + (this.y+1)
        + ';'
        + (this.x+1)
        + 'R');
      break;
  }
};

// ADDITIONS:
// CSI Ps @
// Insert Ps (Blank) Character(s) (default = 1) (ICH).
Term.prototype.insertChars = function(params) {
  var param, row, j;
  param = this.params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;
  j = this.x;
  while (param-- && j < this.cols) {
    this.lines[row].splice(j++, 0, (this.defAttr << 16) | 32);
    this.lines[row].pop();
  }
};

// CSI Ps E
// Cursor Next Line Ps Times (default = 1) (CNL).
Term.prototype.cursorNextLine = function(params) {
  var param, row;
  param = this.params[0];
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
Term.prototype.cursorPrecedingLine = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.y -= param;
  if (this.y < 0) this.y = 0;
  // above is the same as CSI Ps A
  this.x = 0;
};

// CSI Ps G
// Cursor Character Absolute  [column] (default = [row,1]) (CHA).
Term.prototype.cursorCharAbsolute = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.x = param;
};

// CSI Ps L
// Insert Ps Line(s) (default = 1) (IL).
Term.prototype.insertLines = function(params) {
  var param, row, j;
  param = this.params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;
  while (param--) {
    this.lines.splice(row, 0, []);
    this.eraseLine(0, this.y);
    j = this.rows - 1 - this.scrollBottom;
    // add an extra one because we added one
    // above
    j = this.rows - 1 + this.ybase - j + 1;
    this.lines.splice(j, 1);
  }
  //this.refresh(0, this.rows - 1);
  this.refreshStart = 0;
  this.refreshEnd = this.rows - 1;
};

// CSI Ps M
// Delete Ps Line(s) (default = 1) (DL).
Term.prototype.deleteLines = function(params) {
  var param, row, j;
  param = this.params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;
  while (param--) {
    j = this.rows - 1 - this.scrollBottom;
    j = this.rows - 1 + this.ybase - j;
    this.lines.splice(j + 1, 0, []);
    this.eraseLine(0, j - this.ybase);
    this.lines.splice(row, 1);
  }
  //this.refresh(0, this.rows - 1);
  this.refreshStart = 0;
  this.refreshEnd = this.rows - 1;
};

// CSI Ps P
// Delete Ps Character(s) (default = 1) (DCH).
Term.prototype.deleteChars = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;
  while (param--) {
    this.lines[row].splice(this.x, 1);
    this.lines.push((this.defAttr << 16) | 32);
  }
};

// CSI Ps X
// Erase Ps Character(s) (default = 1) (ECH).
Term.prototype.eraseChars = function(params) {
  var param, row, j;
  param = this.params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;
  j = this.x;
  while (param-- && j < this.cols) {
    this.lines[row][j++] = (this.defAttr << 16) | 32;
  }
};

// CSI Pm `  Character Position Absolute
//   [column] (default = [row,1]) (HPA).
Term.prototype.charPosAbsolute = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.x = param - 1;
  if (this.x >= this.cols) {
    this.x = this.cols - 1;
  }
};

// 141 61 a * HPR -
// Horizontal Position Relative
Term.prototype.HPositionRelative = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.x += param;
  if (this.x >= this.cols - 1) {
    this.x = this.cols - 1;
  }
  // above is the same as CSI Ps C
};

// CSI P s c
// Send Device Attributes (Primary DA).
// CSI > P s c
// Send Device Attributes (Secondary DA)
Term.prototype.sendDeviceAttributes = function(params) {
  // this breaks things currently
  return;
  if (this.prefix !== '>') {
    this.queueChars('\x1b[?1;2c');
  } else {
    // say we're a vt100 with
    // firmware version 95
    this.queueChars('\x1b[>0;95;0');
  }
};

// CSI Pm d
// Line Position Absolute  [row] (default = [1,column]) (VPA).
Term.prototype.linePosAbsolute = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.y = param - 1;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
};

// 145 65 e * VPR - Vertical Position Relative
Term.prototype.VPositionRelative = function(params) {
  var param, row;
  param = this.params[0];
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
Term.prototype.HVPosition = function(params) {
  if (this.params[0] < 1) this.params[0] = 1;
  if (this.params[1] < 1) this.params[1] = 1;

  this.y = this.params[0] - 1;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }

  this.x = this.params[1] - 1;
  if (this.x >= this.cols) {
    this.x = this.cols - 1;
  }
};

// CSI Pm h  Set Mode (SM).
// CSI ? Pm h - mouse escape codes, cursor escape codes
Term.prototype.setMode = function(params) {
  if (typeof params === 'object') {
    while (params.length) this.setMode(params.shift());
    return;
  }

  if (this.prefix !== '?') {
    switch (params) {
      case 20:
        //this.convertEol = true;
        break;
    }
  } else {
    switch (params) {
      case 25: // show cursor
        this.cursorHidden = false;
        break;
      case 1049: // alt screen buffer cursor
        //this.saveCursor();
        ; // FALL-THROUGH
      case 47: // alt screen buffer
      case 1047: // alt screen buffer
        if (!this.normal) {
          this.normal = {};
          this.normal.lines = this.lines;
          this.normal.currentHeight = this.currentHeight;
          this.normal.ybase = this.ybase;
          this.normal.ydisp = this.ydisp;
          this.normal.x = this.x;
          this.normal.y = this.y;
          this.normal.scrollTop = this.scrollTop;
          this.normal.scrollBottom = this.scrollBottom;
          this.reset();
        }
        break;
    }
  }
};

// CSI Pm l  Reset Mode (RM).
// CSI ? Pm l
Term.prototype.resetMode = function(params) {
  if (typeof params === 'object') {
    while (params.length) this.resetMode(params.shift());
    return;
  }

  if (this.prefix !== '?') {
    switch (params) {
      case 20:
        //this.convertEol = false;
        break;
    }
  } else {
    switch (params) {
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
Term.prototype.setScrollRegion = function(params) {
  if (this.prefix === '?') return;
  this.scrollTop = (this.params[0] || 1) - 1;
  this.scrollBottom = (this.params[1] || this.rows) - 1;
};

// CSI s     Save cursor (ANSI.SYS).
Term.prototype.saveCursor = function(params) {
  this.savedX = this.x;
  this.savedY = this.y;
};

// CSI u     Restore cursor (ANSI.SYS).
Term.prototype.restoreCursor = function(params) {
  this.x = this.savedX || 0;
  this.y = this.savedY || 0;
};

/**
 * Expose
 */

this.Term = Term;

}).call(this);
