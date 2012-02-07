/**
 * Javascript Terminal
 *
 * Copyright (c) 2011 Fabrice Bellard
 *
 * Redistribution or commercial use is prohibited without the author's
 * permission.
*/

/**
 * Originally taken from [http://bellard.org/jslinux/]
 * with the author's permission.
 */

'use strict';

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
        && this.ydisp === this.ybase) {
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

  function getRows(y) {
    rows = Math.min(rows, y);
    rowh = Math.max(rowh, y);
  }

  function eraseLine(self, x, y) {
    var line, i, ch, row;
    row = self.ybase + y;

    if (row >= self.currentHeight) {
      row -= self.currentHeight;
    }

    line = self.lines[row];
    ch = 32 | (self.defAttr << 16);

    for (i = x; i < self.cols; i++) {
      line[i] = ch;
    }

    getRows(y);
  }

  function changeAttr(self, params) {
    var i, p;
    if (params.length === 0) {
      self.curAttr = self.defAttr;
    } else {
      for (i = 0; i < params.length; i++) {
        p = params[i];
        if (p >= 30 && p <= 37) {
          self.curAttr = (self.curAttr & ~(7 << 3)) | ((p - 30) << 3);
        } else if (p >= 40 && p <= 47) {
          self.curAttr = (self.curAttr & ~7) | (p - 40);
        } else if (p === 0) {
          self.curAttr = self.defAttr;
        }
      }
    }
  }

  var normal = 0;
  var escaped = 1;
  var csi = 2;
  var osc = 3;

  var l = str.length
    , i = 0
    , ch
    , rows
    , rowh
    , param
    , j
    , col
    , row;

  rows = this.rows;
  rowh = -1;
  getRows(this.y);

  if (this.ybase !== this.ydisp) {
    this.ydisp = this.ybase;
    rows = 0;
    rowh = this.rows - 1;
  }

  for (; i < l; i++) {
    ch = str.charCodeAt(i);
    switch (this.state) {
      case normal:
        switch (ch) {
          // '\n'
          case 10:
            if (this.convertEol) {
              this.x = 0;
            }
            this.y++;
            if (this.y >= this.scrollBottom + 1) {
              this.y--;
              this.scroll();
              rows = 0;
              rowh = this.rows - 1;
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
                  rows = 0;
                  rowh = this.rows - 1;
                }
              }
              row = this.y + this.ybase;
              if (row >= this.currentHeight) {
                row -= this.currentHeight;
              }
              this.lines[row][this.x] = (ch & 0xffff) | (this.curAttr << 16);
              this.x++;
              getRows(this.y);
            }
            break;
        }
        break;
      case escaped:
        switch (String.fromCharCode(ch)) {
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
          case 'c': // full reset
            this.x = 0;
            this.y = 0;
            j = this.rows - 1;
            eraseLine(this, 0, -this.ybase);
            this.lines = [ this.lines[0] ];
            while (j--) {
              this.lines.push(this.lines[0]);
            }
            this.ybase = 0;
            this.ydisp = 0;
            this.state = normal;
            break;
          case 'E': // next line
            this.x = 0;
            ; // FALL-THROUGH
          case 'D': // index
            this.y++;
            if (this.y >= this.scrollBottom + 1) {
              this.y--;
              this.scroll();
              rows = 0;
              rowh = this.rows - 1;
            }
            this.state = normal;
            break;
          case 'M': // reverse index
            this.y--;
            if (this.y < this.scrollTop) {
              this.y++;
              this.lines.splice(this.y + this.ybase, 0, []);
              eraseLine(this, this.x, this.y);
              j = this.rows - 1 - this.scrollBottom;
              // add an extra one because we just added a line
              // maybe put this above
              this.lines.splice(this.rows - 1 + this.ybase - j + 1, 1);
            }
            this.state = normal;
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
          default:
            this.state = normal;
            break;
        }
        break;
      case osc:
        // '?' or '>'
        if (ch === 63 || ch === 62) {
          this.prefix = String.fromCharCode(ch);
        } else {
          this.prefix = '';
        }
        // 0 - 9
        if (ch >= 48 && ch <= 57) {
          this.currentParam = this.currentParam * 10 + ch - 48;
        } else {
          this.params[this.params.length] = this.currentParam;
          this.currentParam = 0;

          // ';'
          if (ch === 59) break;

          this.state = normal;

          console.log('Unknown OSC code: %s',
            String.fromCharCode(ch), this.params);
        }
      case csi:
        // '?' or '>'
        if (ch === 63 || ch === 62) {
          this.prefix = String.fromCharCode(ch);
          break;
        } else {
          this.prefix = '';
        }
        // 0 - 9
        if (ch >= 48 && ch <= 57) {
          this.currentParam = this.currentParam * 10 + ch - 48;
        } else {
          this.params[this.params.length] = this.currentParam;
          this.currentParam = 0;

          // ';'
          if (ch === 59) break;

          this.state = normal;

          switch (ch) {
            // CSI Ps A
            // Cursor Up Ps Times (default = 1) (CUU).
            case 65:
              param = this.params[0];
              if (param < 1) param = 1;
              this.y -= param;
              if (this.y < 0) this.y = 0;
              break;
            // CSI Ps B
            // Cursor Down Ps Times (default = 1) (CUD).
            case 66:
              param = this.params[0];
              if (param < 1) param = 1;
              this.y += param;
              if (this.y >= this.rows) {
                this.y = this.rows - 1;
              }
              break;
            // CSI Ps C
            // Cursor Forward Ps Times (default = 1) (CUF).
            case 67:
              param = this.params[0];
              if (param < 1) param = 1;
              this.x += param;
              if (this.x >= this.cols - 1) {
                this.x = this.cols - 1;
              }
              break;
            // CSI Ps D
            // Cursor Backward Ps Times (default = 1) (CUB).
            case 68:
              param = this.params[0];
              if (param < 1) param = 1;
              this.x -= param;
              if (this.x < 0) this.x = 0;
              break;
            // CSI Ps ; Ps H
            // Cursor Position [row;column] (default = [1,1]) (CUP).
            case 72:
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
              break;
            // CSI Ps J  Erase in Display (ED).
            //   Ps = 0  -> Erase Below (default).
            //   Ps = 1  -> Erase Above.
            //   Ps = 2  -> Erase All.
            //   Ps = 3  -> Erase Saved Lines (xterm).
            // Not fully implemented.
            case 74:
              eraseLine(this, this.x, this.y);
              for (j = this.y + 1; j < this.rows; j++) {
                eraseLine(this, 0, j);
              }
              break;
            // CSI Ps K  Erase in Line (EL).
            //   Ps = 0  -> Erase to Right (default).
            //   Ps = 1  -> Erase to Left.
            //   Ps = 2  -> Erase All.
            // Not fully implemented.
            case 75:
              eraseLine(this, this.x, this.y);
              break;
            // CSI Pm m  Character Attributes (SGR).
            case 109:
              changeAttr(this, this.params);
              break;
            // CSI Ps n  Device Status Report (DSR).
            // Not fully implemented.
            case 110:
              this.queueChars('\x1b['
                + (this.y + 1)
                + ';'
                + (this.x + 1)
                + 'R');
              break;

            // ADDITIONS:
            // CSI Ps @
            // Insert Ps (Blank) Character(s) (default = 1) (ICH).
            // insert spaces at cursor, have it "push" other
            // characters forward
            case 64:
              param = this.params[0];
              if (param < 1) param = 1;
              row = this.y + this.ybase;
              j = this.x;
              while (param-- && j < this.cols) {
                this.lines[row].splice(j++, 0, (this.defAttr << 16) | 32);
                this.lines[row].pop();
              }
              break;
            // CSI Ps E
            // Cursor Next Line Ps Times (default = 1) (CNL).
            case 69:
              param = this.params[0];
              if (param < 1) param = 1;
              this.y += param;
              if (this.y >= this.rows) {
                this.y = this.rows - 1;
              }
              // above is the same as CSI Ps B
              this.x = 0;
              break;
            // CSI Ps F
            // Cursor Preceding Line Ps Times (default = 1) (CNL).
            case 69:
              param = this.params[0];
              if (param < 1) param = 1;
              this.y -= param;
              if (this.y < 0) this.y = 0;
              // above is the same as CSI Ps A
              this.x = 0;
              break;
            // CSI Ps G
            // Cursor Character Absolute  [column] (default = [row,1]) (CHA).
            case 70:
              param = this.params[0];
              if (param < 1) param = 1;
              this.x = param;
              break;
            // CSI Ps L
            // Insert Ps Line(s) (default = 1) (IL).
            // pushes the lines immediately after the
            // cursor down to make room for the inserted
            // lines
            case 76:
              param = this.params[0];
              if (param < 1) param = 1;
              row = this.y + this.ybase;
              while (param--) {
                this.lines.splice(row, 0, []);
                eraseLine(this, 0, this.y);
                j = this.rows - 1 - this.scrollBottom;
                // add an extra one because we added one
                // above
                j = this.rows - 1 + this.ybase - j + 1;
                this.lines.splice(j, 1);
              }
              //this.refresh(0, this.rows - 1);
              rows = 0;
              rowh = this.rows - 1;
              break;
            // CSI Ps M
            // Delete Ps Line(s) (default = 1) (DL).
            // deletes the lines after the cursor
            // the lines after the deleted ones get pulled
            // up to fill their place
            case 77:
              param = this.params[0];
              if (param < 1) param = 1;
              row = this.y + this.ybase;
              while (param--) {
                j = this.rows - 1 - this.scrollBottom;
                j = this.rows - 1 + this.ybase - j;
                this.lines.splice(j, 0, []);
                eraseLine(this, 0, j - this.ybase);
                this.lines.splice(row, 1);
              }
              //this.refresh(0, this.rows - 1);
              rows = 0;
              rowh = this.rows - 1;
              break;
            // CSI Ps P
            // Delete Ps Character(s) (default = 1) (DCH).
            // delete characters in front of cursor and
            // "pull" back characters after that to fill
            // their place
            case 80:
              param = this.params[0];
              if (param < 1) param = 1;
              row = this.y + this.ybase;
              while (param--) {
                this.lines[row].splice(this.x, 1);
                this.lines.push((this.defAttr << 16) | 32);
              }
              break;
            // CSI Ps X
            // Erase Ps Character(s) (default = 1) (ECH).
            // erase characters in front of cursor, but
            // don't "pull" the next characters back (?)
            case 88:
              param = this.params[0];
              if (param < 1) param = 1;
              row = this.y + this.ybase;
              j = this.x;
              while (param-- && j < this.cols) {
                this.lines[row][j++] = (this.defAttr << 16) | 32;
              }
              break;
            // CSI Pm `  Character Position Absolute
            //   [column] (default = [row,1]) (HPA).
            case 96:
              param = this.params[0];
              if (param < 1) param = 1;
              this.x = param - 1;
              if (this.x >= this.cols) {
                this.x = this.cols - 1;
              }
              break;
            // 141 61 a * HPR -
            // Horizontal Position Relative
            case 97:
              param = this.params[0];
              if (param < 1) param = 1;
              this.x += param;
              if (this.x >= this.cols - 1) {
                this.x = this.cols - 1;
              }
              // above is the same as CSI Ps C
              break;
            // CSI P s c
            // Send Device Attributes (Primary DA).
            // CSI > P s c
            // Send Device Attributes (Secondary DA)
            // vim always likes to spam it!
            case 99:
              break;
              if (this.prefix !== '>') {
                this.queueChars('\x1b[?1;2c');
              } else {
                // say we're a vt100 with
                // firmware version 95
                this.queueChars('\x1b[>0;95;0');
              }
              break;
            // CSI Pm d
            // Line Position Absolute  [row] (default = [1,column]) (VPA).
            case 100:
              param = this.params[0];
              if (param < 1) param = 1;
              this.y = param - 1;
              if (this.y >= this.rows) {
                this.y = this.rows - 1;
              }
              break;
            // 145 65 e * VPR - Vertical Position Relative
            case 101:
              param = this.params[0];
              if (param < 1) param = 1;
              this.y += param;
              if (this.y >= this.rows) {
                this.y = this.rows - 1;
              }
              // above is same as CSI Ps B
              break;
            // CSI Ps ; Ps f
            //   Horizontal and Vertical Position [row;column] (default =
            //   [1,1]) (HVP).
            case 102:
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
              break;
            // CSI Pm h  Set Mode (SM).
            // CSI ? Pm h - mouse escape codes, cursor escape codes
            case 104:
              if (this.prefix !== '?') {
                switch (this.params[0]) {
                  case 20:
                    //this.convertEol = true;
                    break;
                }
              } else {
                switch (this.params[0]) {
                  case 25:
                    // show cursor
                    break;
                }
              }
              break;
            // CSI Pm l  Reset Mode (RM).
            // CSI ? Pm l
            // opposite of Pm h
            case 108:
              if (this.prefix !== '?') {
                switch (this.params[0]) {
                  case 20:
                    //this.convertEol = false;
                    break;
                }
              } else {
                switch (this.params[0]) {
                  case 25:
                    // hide cursor
                    break;
                }
              }
              break;
            // CSI Ps n  Device Status Report (DSR).
            case 110:
              break;
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
              break;
            // CSI Ps ; Ps r
            //   Set Scrolling Region [top;bottom] (default = full size of win-
            //   dow) (DECSTBM).
            // CSI ? Pm r
            case 114:
              if (this.prefix === '?') break;
              this.scrollTop = (this.params[0] || 1) - 1;
              this.scrollBottom = (this.params[1] || this.rows) - 1;
              break;
            // CSI s     Save cursor (ANSI.SYS).
            case 115:
              this.savedX = this.x;
              this.savedY = this.y;
              break;
            // CSI u     Restore cursor (ANSI.SYS).
            case 117:
              this.x = this.savedX || 0;
              this.y = this.savedY || 0;
              break;
            default:
              console.log('Unknown CSI code: %s',
                String.fromCharCode(ch), this.params);
              break;
          }
        }
        break;
    }
  }

  getRows(this.y);

  if (rowh >= rows) this.refresh(rows, rowh);
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
