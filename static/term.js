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
    self.keyDownHandler(key);
  }, true);

  document.addEventListener('keypress', function(key) {
    self.keyPressHandler(key);
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

  this.lines[row] = line;
};

Term.prototype.scrollDisp = function(disp) {
  var i, row;

  if (disp >= 0) {
    for (i = 0; i < disp; i++) {
      if (this.ydisp === this.ybase)
        break;
      if (++this.ydisp === this.currentHeight)
        this.ydisp = 0;
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
  function getRows(y) {
    rows = Math.min(rows, y);
    rowh = Math.max(rowh, y);
  }

  function setLine(self, x, y) {
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
          case 10:
            if (this.convertEol) {
              this.x = 0;
            }
            this.y++;
            if (this.y >= this.rows) {
              this.y--;
              this.scroll();
              rows = 0;
              rowh = this.rows - 1;
            }
            break;
          case 13:
            this.x = 0;
            break;
          case 8:
            if (this.x > 0) {
              this.x--;
            }
            break;
          case 9:
            param = (this.x + 8) & ~7;
            if (param <= this.cols) {
              this.x = param;
            }
            break;
          case 27:
            this.state = escaped;
            break;
          default:
            if (ch >= 32) {
              if (this.x >= this.cols) {
                this.x = 0;
                this.y++;
                if (this.y >= this.rows) {
                  this.y--;
                  this.scroll();
                  rows = 0;
                  rowh = this.rows - 1;
                }
              }
              row = this.y + this.ybase;
              if (row >= this.currentHeight)
                row -= this.currentHeight;
              this.lines[row][this.x] = (ch & 0xffff) | (this.curAttr << 16);
              this.x++;
              getRows(this.y);
            }
            break;
        }
        break;
      case escaped:
        if (ch === 91) {
          this.params = [];
          this.currentParam = 0;
          this.state = csi;
        } else {
          this.state = normal;
        }
        break;
      case csi:
        if (ch >= 48 && ch <= 57) {
          this.currentParam = this.currentParam * 10 + ch - 48;
        } else {
          this.params[this.params.length] = this.currentParam;
          this.currentParam = 0;

          if (ch === 59) break;

          this.state = normal;
          switch (ch) {
            case 65:
              param = this.params[0];
              if (param < 1) param = 1;
              this.y -= param;
              if (this.y < 0) this.y = 0;
              break;
            case 66:
              param = this.params[0];
              if (param < 1)
                param = 1;
              this.y += param;
              if (this.y >= this.rows) {
                this.y = this.rows - 1;
              }
              break;
            case 67:
              param = this.params[0];
              if (param < 1) param = 1;
              this.x += param;
              if (this.x >= this.cols - 1) {
                this.x = this.cols - 1;
              }
              break;
            case 68:
              param = this.params[0];
              if (param < 1) param = 1;
              this.x -= param;
              if (this.x < 0) this.x = 0;
              break;
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
            case 74:
              setLine(this, this.x, this.y);
              for (j = this.y + 1; j < this.rows; j++) {
                setLine(this, 0, j);
              }
              break;
            case 75:
              setLine(this, this.x, this.y);
              break;
            case 109:
              changeAttr(this, this.params);
              break;
            case 110:
              this.queueChars('\x1b['
                + (this.y + 1)
                + ';'
                + (this.x + 1)
                + 'R');
              break;
            default:
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
    case 8:
      str = '\x7f'; // ^?
      //str = '\x08'; // ^H
      break;
    case 9:
      str = '\t';
      break;
    case 13:
      str = '\r';
      break;
    case 27:
      str = '\x1b';
      break;
    case 37:
      str = '\x1b[D';
      break;
    case 39:
      str = '\x1b[C';
      break;
    case 38:
      if (ev.ctrlKey) {
        this.scrollDisp(-1);
      } else {
        str = '\x1b[A';
      }
      break;
    case 40:
      if (ev.ctrlKey) {
        this.scrollDisp(1);
      } else {
        str = '\x1b[B';
      }
      break;
    case 46:
      str = '\x1b[3~';
      break;
    case 45:
      str = '\x1b[2~';
      break;
    case 36:
      str = '\x1bOH';
      break;
    case 35:
      str = '\x1bOF';
      break;
    case 33:
      if (ev.ctrlKey) {
        this.scrollDisp(-(this.rows - 1));
      } else {
        str = '\x1b[5~';
      }
      break;
    case 34:
      if (ev.ctrlKey) {
        this.scrollDisp(this.rows - 1);
      } else {
        str = '\x1b[6~';
      }
      break;
    default:
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
