/**
 * xterm.js
 * The makings of an experimental
 * terminal designed to emulate xterm.
 * It uses the same basic design as the
 * jslinux vt100.
 * The state machine is complete, behavior
 * needs to be implemented.
 */

var Terminal = function(rows, cols, handler) {
  this.name = 'xterm-color';
  this.handler = handler;
  this.rows = rows;
  this.cols = cols;

  this.element = document.createElement('table');
  this.element.id = 'xterm';
  this.element.style.backgroundColor = 'black';

  this.state = 'normal';
  this.x = 0;
  this.y = 0;
  this.lines = [];
  this.colors = [
    '#000000',
    '#ff0000',
    '#00ff00',
    '#ffff00',
    '#0000ff',
    '#ff00ff',
    '#00ffff',
    '#ffffff',
    '#000000',
    '#ff0000',
    '#00ff00',
    '#ffff00',
    '#0000ff',
    '#ff00ff',
    '#00ffff',
    '#ffffff'
  ];

  this.keyState = 0;
  this.keyStr = '';
  this.isMac = ~navigator.userAgent.indexOf("Mac");

  if (!document.getElementById('term-style')) {
    var style = document.createElement('style');
    style.id = 'term-style';
    style.textContent = ''
      + '.term {'
      + '  font-family: monospace;'
      + '  font-size: 14px;'
      + '  color: #f0f0f0;'
      + '  background: #000000;'
      + '}'
      + '.reverse-video {'
      + '  color: #000000;'
      + '  background: #00ff00;'
      + '}';
    document.head.appendChild(style);
  }

  var html = ''
    , i = 0;

  for (; i < this.rows; i++) {
    html += '<tr><td class="term" id="line-' + i + '"></td></tr>';
  }

  this.element.innerHTML = html;
};

Terminal.prototype.open = function() {
  var self = this;

  setInterval(function() {
    self.cursorBlink();
  }, 500);

  this.render(0, this.rows - 1);

  document.addEventListener('keydown', function(key) {
    self.handleKeyDown(key);
  }, true);

  document.addEventListener('keypress', function(key) {
    self.handleKeyPress(key);
  }, true);
};

Terminal.prototype.cursorBlink = function() {
};

Terminal.prototype.render = function(y1, y2) {
  var y = y1
    , x
    , bg
    , fg
    , out;

  for (; y < y2; y++) {
    out = '';
    line = this.lines[y2];
    x = 0;
    for (; x < this.rows; x++) {
      ch = line.rows[x];
      fg = ch & 0xFF;
      bg = (ch >> 8) & 0xFF;
      ch = (ch >> 16) & 0xFFFF;
      if (bg === -1 || (x === this.x && y === this.y)) {
        out += '<span class="reverse-video">';
      } else {
        out += '<span style="color:'
          + this.colors[fg]
          + ';background:'
          + this.colors[bg]
          + '">';
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
          if (c < 32) {
            out += '&nbsp;';
          } else {
            out += String.fromCharCode(ch);
          }
          break;
      }
      out += '</span>';
    }
    document.getElementById('line-' + y).innerHTML = out;
  }
};

/**
 * State Machine
 */

Terminal.prototype.write = function(str) {
  var out = ''
    , row = 0
    , l = str.length
    , i = 0
    , ch;

  for (; i < l; i++) {
    ch = str[i];
    switch (this.state) {
      case 'normal':
        switch (ch) {
          case '\033':
            this.state = 'escaped';
            break;
          default:
            this.lines[this.y].rows[row++] =
              (ch.charChodeAt(i) << 16) | CHARACTER_ATTRIBUTES_HERE;
            break;
        }
        break;
      case 'escaped':
        switch (ch) {
          case '[':
            this.state = 'csi';
            break;
          case ']':
            this.state = 'osc';
            break;
          default:
            break;
        }
        break;
      case 'csi':
        switch (ch) {
          case '?':
          case '>':
          case '!':
            this.prefix += ch;
            this.state = 'csi param';
            break;
          default:
            this.state = 'csi param';
            i--;
            break;
        }
        break;
      case 'csi param':
        if (!isFinite(ch) && this.num !== '') {
          this.params.push(+num);
          this.num = '';
        }
        switch (ch) {
          // case ';':
          //  this.params.push(+num);
          //  this.num = '';
          //  break;
          case '@':
            this.insertBlankChars();
            break;
          case 'A':
            this.cursorUpTimes();
            break;
          case 'B':
            this.cursorDownTimes();
            break;
          case 'C':
            this.cursorForwardTimes();
            break;
          case 'D':
            this.cursorBackTimes();
            break;
          case 'E':
            this.cursorNextLineTimes();
            break;
          case 'F':
            this.cursorPrecedingLineTimes();
            break;
          case 'G':
            this.cursorCharacterAbsolute();
            break;
          case 'H':
            this.cursorPosition();
            break;
          case 'I':
            this.cursorForwardTab();
            break;
          case 'J':
            if (this.prefix === '?') {
              this.params.unshift('?');
            }
            this.eraseInDisplay();
            break;
          case 'K':
            if (this.prefix === '?') {
              this.params.unshift('?');
            }
            this.eraseInLine();
            break;
          case 'L':
            this.insertLines();
            break;
          case 'M':
            this.deleteLines();
            break;
          case 'M':
            this.deleteCharacters();
            break;
          case 'S':
            // should implement
            // SP postfix
            // here
            this.scrollUp();
            break;
          case 'T':
            if (this.prefix === '>') {
              this.resetTitleModes();
            }
            if (this.params.length > 1) {
              this.initMouseTracking();
            } else {
              this.scrollDown();
            }
            break;
          case 'X':
            this.eraseCharacters();
            break;
          case 'Z':
            this.cursorBackwardTab();
            break;
          case '`':
            this.characterPositionAbsolute();
            break;
          case 'b':
            this.repeatPrecedingCharacter();
            break;
          case 'c':
            if (this.prefix === '>') {
              this.params.unshift('>');
            }
            this.sendDeviceAttr();
            break;
          case 'd':
            this.linePositionAbsolute();
            break;
          case 'f':
            this.horizontalVerticalPosition();
            break;
          case 'g':
            this.tabClear();
            break;
          case 'h':
            if (this.prefix === '?') {
              this.params.unshift('?');
            }
            this.setMode();
            break;
          case 'i':
            if (this.prefix === '?') {
              this.params.unshift('?');
            }
            this.mediaCopy();
            break;
          case 'l':
            if (this.prefix === '?') {
              this.params.unshift('?');
            }
            this.resetMode();
            break;
          case 'm':
            if (this.prefix === '>') {
              this.setResources();
            } else {
              this.characterAttributes();
            }
            break;
          case 'm':
            if (this.prefix === '>') {
              this.disableModifiers();
            } else {
              if (this.prefix === '?') {
                this.params.unshift('?');
              }
              this.deviceStatusReport();
            }
            break;
          case '$':
            this.postfix = '$';
            break;
          case 'p':
            if (this.prefix === '>') {
              this.setPointerMode();
              break;
            }
            if (this.prefix === '!') {
              this.softReset();
            }
            if (this.postfix === '$') {
              if (this.prefix === '?') {
                this.requestPrivateMode();
              } else {
                this.requestAnsiMode();
              }
            }
            if (this.postfix === '"') {
              this.setConformanceLevel();
            }
            break;
          case '"':
            this.postfix = '"';
            break;
          case 'q':
            if (this.postfix === 'SP') {
              this.setCursorStyle();
            } else if (this.postfix === '"') {
              this.setCharProtectionAttr();
            } else {
              this.loadLEDs();
            }
            break;
          case 'r':
            if (this.postfix === '$') {
              this.setAttrInRectangle();
              break;
            }
            if (this.prefix === '?') {
              this.restorePrivateValues();
            } else {
              this.setScrollingRegion();
            }
            break;
          case 's':
            if (this.prefix === '?') {
              this.savePrivateValues();
            } else {
              this.saveCursor();
            }
            break;
          case 't':
            if (this.postfix === '$') {
              this.reverseAttrInRectangle();
              break;
            }
            if (this.prefix === '>') {
              this.setTitleModeFeature();
              break;
            }
            if (this.postfix === 'SP') {
              this.setWarningBellVolume();
              break;
            }
            this.manipulateWindow();
            break;
          case 'u':
            if (this.postfix === 'SP') {
              this.setMarginBellVolume();
            } else {
              this.restoreCursor();
            }
            break;
          case 'u':
            if (this.postfix === 'SP') {
              this.setMarginBellVolume();
            } else {
              this.restoreCursor();
            }
            break;
          case 'v':
            if (this.postfix === '$') {
              this.copyRectangle();
            }
            break;
          case 'w':
            if (this.postfix === '\'') {
              this.enableFilterRectangle();
            }
            break;
          case 'x':
            if (this.postfix === '$') {
              this.fillRectangle();
            } else {
              this.requestParameters();
            }
            break;
          case 'z':
            if (this.postfix === '\'') {
              this.enableLocatorReporting();
            } else if (this.postfix === '$') {
              this.eraseRectangle();
            }
            break;
          case '{':
            if (this.postfix === '\'') {
              this.setLocatorEvents();
              break;
            }
            if (this.postfix === '$') {
              this.selectiveEraseRectange();
              break;
            }
            break;
          case '|':
            if (this.postfix === '\'') {
              this.requestLocatorPosition();
            }
            break;
          case '\'':
            this.postfix += '\'';
            break;
          default:
            if (isFinite(ch)) {
              this.num += ch;
            }
            break;
        }
        break;
    }
  }
};

Terminal.prototype.resetParams = function() {
  this.prefix = '';
  this.postfix = '';
  this.params = [];
  this.num = '';
  this.state = 'normal';
};

Terminal.prototype.handleKeyPress = function() {
};

Terminal.prototype.handleKeyDown = function() {
};

/**
 * CSI Codes
 * http://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 */

// CSI Ps @
// Insert Ps (Blank) Character(s) (default = 1) (ICH).
Terminal.prototype.insertBlankChars = function() {
  var n = this.params[0] || 1;
  this.write(Array(n + 1).join(' '));
  this.resetParams();
};

// CSI Ps A
// Cursor Up Ps Times (default = 1) (CUU).
Terminal.prototype.cursorUpTimes = function() {
  var n = this.params[0] || 1;
  this.y -= n;
  this.resetParams();
};

// CSI Ps B
// Cursor Down Ps Times (default = 1) (CUD).
Terminal.prototype.cursorDownTimes = function() {
  var n = this.params[0] || 1;
  this.y += n;
  this.resetParams();
};

// CSI Ps C
// Cursor Forward Ps Times (default = 1) (CUF).
Terminal.prototype.cursorForwardTimes = function() {
  var n = this.params[0] || 1;
  this.x += n;
  this.resetParams();
};

// CSI Ps D
// Cursor Backward Ps Times (default = 1) (CUB).
Terminal.prototype.cursorBackTimes = function() {
  var n = this.params[0] || 1;
  this.x -= n;
  this.resetParams();
};

// CSI Ps E
// Cursor Next Line Ps Times (default = 1) (CNL).
Terminal.prototype.cursorNextLine = function() {
  var n = this.params[0] || 1;
  this.x = 0;
  this.y += n;
  this.resetParams();
};

// TEST: echo -ne '\e[1F'

// CSI Ps F  Cursor Preceding Line Ps Times (default = 1) (CPL).
Terminal.prototype.cursorPrecedingLineTimes = function() {
  var n = this.params[0] || 1;
  this.x = 0;
  this.y -= n;
  this.resetParams();
};

// CSI Ps G  Cursor Character Absolute  [column] (default = [row,1]) (CHA).
Terminal.prototype.cursorCharacterAbsolute = function() {
  this.x = this.params[0] || 1;
  this.resetParams();
};

// CSI Ps ; Ps H
//           Cursor Position [row;column] (default = [1,1]) (CUP).
Terminal.prototype.cursorPosition = function() {
  this.y = this.params[0] || 1;
  this.x = this.params[1] || 1;
  this.resetParams();
};

// CSI Ps I  Cursor Forward Tabulation Ps tab stops (default = 1) (CHT).
Terminal.prototype.cursorForwardTab = function() {
  this.x += 8;
  this.resetParams();
};

// CSI Ps J  Erase in Display (ED).
//             Ps = 0  -> Erase Below (default).
//             Ps = 1  -> Erase Above.
//             Ps = 2  -> Erase All.
//             Ps = 3  -> Erase Saved Lines (xterm).
// CSI ? Ps J
//           Erase in Display (DECSED).
//             Ps = 0  -> Selective Erase Below (default).
//             Ps = 1  -> Selective Erase Above.
//             Ps = 2  -> Selective Erase All.
Terminal.prototype.eraseInDisplay = function() {
  if (this.params[0] === '$') {
    switch (this.params[1] || 0) {
      case 0: break;
      case 1: break;
      case 2: break;
      case 3: break;
    }
  } else {
    switch (this.params[0] || 0) {
      case 0: break;
      case 1: break;
      case 2: break;
      case 3: break;
    }
  }
};

// CSI Ps K  Erase in Line (EL).
//             Ps = 0  -> Erase to Right (default).
//             Ps = 1  -> Erase to Left.
//             Ps = 2  -> Erase All.
// CSI ? Ps K
//           Erase in Line (DECSEL).
//             Ps = 0  -> Selective Erase to Right (default).
//             Ps = 1  -> Selective Erase to Left.
//             Ps = 2  -> Selective Erase All.
Terminal.prototype.eraseInLine = function() {
  if (this.params[0] === '$') {
    switch (this.params[1] || 0) {
      case 0: break;
      case 1: break;
      case 2: break;
    }
  } else {
    switch (this.params[0] || 0) {
      case 0: break;
      case 1: break;
      case 2: break;
    }
  }
};

// CSI Ps L  Insert Ps Line(s) (default = 1) (IL).
Terminal.prototype.insertLines = function() {
  var n = this.params[0] || 1;
};

// CSI Ps M  Delete Ps Line(s) (default = 1) (DL).
Terminal.prototype.deleteLines = function() {
  var n = this.params[0] || 1;
};

// CSI Ps P  Delete Ps Character(s) (default = 1) (DCH).
Terminal.prototype.deleteCharacters = function() {
};

// CSI Ps S  Scroll up Ps lines (default = 1) (SU).
Terminal.prototype.scrollUp = function() {
};

// CSI Ps T  Scroll down Ps lines (default = 1) (SD).
Terminal.prototype.scrollDown = function() {
};

// CSI Ps ; Ps ; Ps ; Ps ; Ps T
//           Initiate highlight mouse tracking.  Parameters are
//           [func;startx;starty;firstrow;lastrow].  See the section Mouse
//           Tracking.
Terminal.prototype.initMouseTracking = function() {
};

// CSI > Ps; Ps T
//           Reset one or more features of the title modes to the default
//           value.  Normally, "reset" disables the feature.  It is possi-
//           ble to disable the ability to reset features by compiling a
//           different default for the title modes into xterm.
//             Ps = 0  -> Do not set window/icon labels using hexadecimal.
//             Ps = 1  -> Do not query window/icon labels using hexadeci-
//           mal.
//             Ps = 2  -> Do not set window/icon labels using UTF-8.
//             Ps = 3  -> Do not query window/icon labels using UTF-8.
//           (See discussion of "Title Modes").
Terminal.prototype.resetTitleModes = function() {
};

// CSI Ps X  Erase Ps Character(s) (default = 1) (ECH).
Terminal.prototype.eraseCharacters = function() {
};

// CSI Ps Z  Cursor Backward Tabulation Ps tab stops (default = 1) (CBT).
Terminal.prototype.cursorBackwardTab = function() {
};

// CSI Pm `  Character Position Absolute  [column] (default = [row,1])
//           (HPA).
Terminal.prototype.characterPositionAbsolute = function() {
};

// CSI Ps b  Repeat the preceding graphic character Ps times (REP).
Terminal.prototype.repeatPrecedingCharacter = function() {
};

// CSI Ps c  Send Device Attributes (Primary DA).
//             Ps = 0  or omitted -> request attributes from terminal.  The
//           response depends on the decTerminalID resource setting.
//             -> CSI ? 1 ; 2 c  (``VT100 with Advanced Video Option'')
//             -> CSI ? 1 ; 0 c  (``VT101 with No Options'')
//             -> CSI ? 6 c  (``VT102'')
//             -> CSI ? 6 0 ; 1 ; 2 ; 6 ; 8 ; 9 ; 1 5 ; c  (``VT220'')
//           The VT100-style response parameters do not mean anything by
//           themselves.  VT220 parameters do, telling the host what fea-
//           tures the terminal supports:
//             Ps = 1  -> 132-columns.
//             Ps = 2  -> Printer.
//             Ps = 6  -> Selective erase.
//             Ps = 8  -> User-defined keys.
//             Ps = 9  -> National replacement character sets.
//             Ps = 1 5  -> Technical characters.
//             Ps = 2 2  -> ANSI color, e.g., VT525.
//             Ps = 2 9  -> ANSI text locator (i.e., DEC Locator mode).
// CSI > Ps c
//           Send Device Attributes (Secondary DA).
//             Ps = 0  or omitted -> request the terminal's identification
//           code.  The response depends on the decTerminalID resource set-
//           ting.  It should apply only to VT220 and up, but xterm extends
//           this to VT100.
//             -> CSI  > Pp ; Pv ; Pc c
//           where Pp denotes the terminal type
//             Pp = 0  -> ``VT100''.
//             Pp = 1  -> ``VT220''.
//           and Pv is the firmware version (for xterm, this was originally
//           the XFree86 patch number, starting with 95).  In a DEC termi-
//           nal, Pc indicates the ROM cartridge registration number and is
//           always zero.
Terminal.prototype.sendDeviceAttr = function() {
};

// CSI Pm d  Line Position Absolute  [row] (default = [1,column]) (VPA).
Terminal.prototype.linePositionAbsolute = function() {
};

// CSI Ps ; Ps f
//           Horizontal and Vertical Position [row;column] (default =
//           [1,1]) (HVP).
Terminal.prototype.horizontalVerticalPosition = function() {
};

// CSI Ps g  Tab Clear (TBC).
//             Ps = 0  -> Clear Current Column (default).
//             Ps = 3  -> Clear All.
Terminal.prototype.tabClear = function() {
};

// CSI Pm h  Set Mode (SM).
//             Ps = 2  -> Keyboard Action Mode (AM).
//             Ps = 4  -> Insert Mode (IRM).
//             Ps = 1 2  -> Send/receive (SRM).
//             Ps = 2 0  -> Automatic Newline (LNM).
// CSI ? Pm h
//           DEC Private Mode Set (DECSET).
//             Ps = 1  -> Application Cursor Keys (DECCKM).
//             Ps = 2  -> Designate USASCII for character sets G0-G3
//           (DECANM), and set VT100 mode.
//             Ps = 3  -> 132 Column Mode (DECCOLM).
//             Ps = 4  -> Smooth (Slow) Scroll (DECSCLM).
//             Ps = 5  -> Reverse Video (DECSCNM).
//             Ps = 6  -> Origin Mode (DECOM).
//             Ps = 7  -> Wraparound Mode (DECAWM).
//             Ps = 8  -> Auto-repeat Keys (DECARM).
//             Ps = 9  -> Send Mouse X & Y on button press.  See the sec-
//           tion Mouse Tracking.
//             Ps = 1 0  -> Show toolbar (rxvt).
//             Ps = 1 2  -> Start Blinking Cursor (att610).
//             Ps = 1 8  -> Print form feed (DECPFF).
//             Ps = 1 9  -> Set print extent to full screen (DECPEX).
//             Ps = 2 5  -> Show Cursor (DECTCEM).
//             Ps = 3 0  -> Show scrollbar (rxvt).
//             Ps = 3 5  -> Enable font-shifting functions (rxvt).
//             Ps = 3 8  -> Enter Tektronix Mode (DECTEK).
//             Ps = 4 0  -> Allow 80 -> 132 Mode.
//             Ps = 4 1  -> more(1) fix (see curses resource).
//             Ps = 4 2  -> Enable Nation Replacement Character sets (DECN-
//           RCM).
//             Ps = 4 4  -> Turn On Margin Bell.
//             Ps = 4 5  -> Reverse-wraparound Mode.
//             Ps = 4 6  -> Start Logging.  This is normally disabled by a
//           compile-time option.
//             Ps = 4 7  -> Use Alternate Screen Buffer.  (This may be dis-
//           abled by the titeInhibit resource).
//             Ps = 6 6  -> Application keypad (DECNKM).
//             Ps = 6 7  -> Backarrow key sends backspace (DECBKM).
//             Ps = 1 0 0 0  -> Send Mouse X & Y on button press and
//           release.  See the section Mouse Tracking.
//             Ps = 1 0 0 1  -> Use Hilite Mouse Tracking.
//             Ps = 1 0 0 2  -> Use Cell Motion Mouse Tracking.
//             Ps = 1 0 0 3  -> Use All Motion Mouse Tracking.
//             Ps = 1 0 0 4  -> Send FocusIn/FocusOut events.
//             Ps = 1 0 0 5  -> Enable Extended Mouse Mode.
//             Ps = 1 0 1 0  -> Scroll to bottom on tty output (rxvt).
//             Ps = 1 0 1 1  -> Scroll to bottom on key press (rxvt).
//             Ps = 1 0 3 4  -> Interpret "meta" key, sets eighth bit.
//           (enables the eightBitInput resource).
//             Ps = 1 0 3 5  -> Enable special modifiers for Alt and Num-
//           Lock keys.  (This enables the numLock resource).
//             Ps = 1 0 3 6  -> Send ESC   when Meta modifies a key.  (This
//           enables the metaSendsEscape resource).
//             Ps = 1 0 3 7  -> Send DEL from the editing-keypad Delete
//           key.
//             Ps = 1 0 3 9  -> Send ESC  when Alt modifies a key.  (This
//           enables the altSendsEscape resource).
//             Ps = 1 0 4 0  -> Keep selection even if not highlighted.
//           (This enables the keepSelection resource).
//             Ps = 1 0 4 1  -> Use the CLIPBOARD selection.  (This enables
//           the selectToClipboard resource).
//             Ps = 1 0 4 2  -> Enable Urgency window manager hint when
//           Control-G is received.  (This enables the bellIsUrgent
//           resource).
//             Ps = 1 0 4 3  -> Enable raising of the window when Control-G
//           is received.  (enables the popOnBell resource).
//             Ps = 1 0 4 7  -> Use Alternate Screen Buffer.  (This may be
//           disabled by the titeInhibit resource).
//             Ps = 1 0 4 8  -> Save cursor as in DECSC.  (This may be dis-
//           abled by the titeInhibit resource).
//             Ps = 1 0 4 9  -> Save cursor as in DECSC and use Alternate
//           Screen Buffer, clearing it first.  (This may be disabled by
//           the titeInhibit resource).  This combines the effects of the 1
//           0 4 7  and 1 0 4 8  modes.  Use this with terminfo-based
//           applications rather than the 4 7  mode.
//             Ps = 1 0 5 0  -> Set terminfo/termcap function-key mode.
//             Ps = 1 0 5 1  -> Set Sun function-key mode.
//             Ps = 1 0 5 2  -> Set HP function-key mode.
//             Ps = 1 0 5 3  -> Set SCO function-key mode.
//             Ps = 1 0 6 0  -> Set legacy keyboard emulation (X11R6).
//             Ps = 1 0 6 1  -> Set VT220 keyboard emulation.
//             Ps = 2 0 0 4  -> Set bracketed paste mode.
Terminal.prototype.setMode = function() {
};

// CSI Pm i  Media Copy (MC).
//             Ps = 0  -> Print screen (default).
//             Ps = 4  -> Turn off printer controller mode.
//             Ps = 5  -> Turn on printer controller mode.
// CSI ? Pm i
//           Media Copy (MC, DEC-specific).
//             Ps = 1  -> Print line containing cursor.
//             Ps = 4  -> Turn off autoprint mode.
//             Ps = 5  -> Turn on autoprint mode.
//             Ps = 1  0  -> Print composed display, ignores DECPEX.
//             Ps = 1  1  -> Print all pages.
Terminal.prototype.mediaCopy = function() {
};

// CSI Pm l  Reset Mode (RM).
//             Ps = 2  -> Keyboard Action Mode (AM).
//             Ps = 4  -> Replace Mode (IRM).
//             Ps = 1 2  -> Send/receive (SRM).
//             Ps = 2 0  -> Normal Linefeed (LNM).
// CSI ? Pm l
//           DEC Private Mode Reset (DECRST).
//             Ps = 1  -> Normal Cursor Keys (DECCKM).
//             Ps = 2  -> Designate VT52 mode (DECANM).
//             Ps = 3  -> 80 Column Mode (DECCOLM).
//             Ps = 4  -> Jump (Fast) Scroll (DECSCLM).
//             Ps = 5  -> Normal Video (DECSCNM).
//             Ps = 6  -> Normal Cursor Mode (DECOM).
//             Ps = 7  -> No Wraparound Mode (DECAWM).
//             Ps = 8  -> No Auto-repeat Keys (DECARM).
//             Ps = 9  -> Don't send Mouse X & Y on button press.
//             Ps = 1 0  -> Hide toolbar (rxvt).
//             Ps = 1 2  -> Stop Blinking Cursor (att610).
//             Ps = 1 8  -> Don't print form feed (DECPFF).
//             Ps = 1 9  -> Limit print to scrolling region (DECPEX).
//             Ps = 2 5  -> Hide Cursor (DECTCEM).
//             Ps = 3 0  -> Don't show scrollbar (rxvt).
//             Ps = 3 5  -> Disable font-shifting functions (rxvt).
//             Ps = 4 0  -> Disallow 80 -> 132 Mode.
//             Ps = 4 1  -> No more(1) fix (see curses resource).
//             Ps = 4 2  -> Disable Nation Replacement Character sets (DEC-
//           NRCM).
//             Ps = 4 4  -> Turn Off Margin Bell.
//             Ps = 4 5  -> No Reverse-wraparound Mode.
//             Ps = 4 6  -> Stop Logging.  (This is normally disabled by a
//           compile-time option).
//             Ps = 4 7  -> Use Normal Screen Buffer.
//             Ps = 6 6  -> Numeric keypad (DECNKM).
//             Ps = 6 7  -> Backarrow key sends delete (DECBKM).
//             Ps = 1 0 0 0  -> Don't send Mouse X & Y on button press and
//           release.  See the section Mouse Tracking.
//             Ps = 1 0 0 1  -> Don't use Hilite Mouse Tracking.
//             Ps = 1 0 0 2  -> Don't use Cell Motion Mouse Tracking.
//             Ps = 1 0 0 3  -> Don't use All Motion Mouse Tracking.
//             Ps = 1 0 0 4  -> Don't send FocusIn/FocusOut events.
//             Ps = 1 0 0 5  -> Disable Extended Mouse Mode.
//             Ps = 1 0 1 0  -> Don't scroll to bottom on tty output
//           (rxvt).
//             Ps = 1 0 1 1  -> Don't scroll to bottom on key press (rxvt).
//             Ps = 1 0 3 4  -> Don't interpret "meta" key.  (This disables
//           the eightBitInput resource).
//             Ps = 1 0 3 5  -> Disable special modifiers for Alt and Num-
//           Lock keys.  (This disables the numLock resource).
//             Ps = 1 0 3 6  -> Don't send ESC  when Meta modifies a key.
//           (This disables the metaSendsEscape resource).
//             Ps = 1 0 3 7  -> Send VT220 Remove from the editing-keypad
//           Delete key.
//             Ps = 1 0 3 9  -> Don't send ESC  when Alt modifies a key.
//           (This disables the altSendsEscape resource).
//             Ps = 1 0 4 0  -> Do not keep selection when not highlighted.
//           (This disables the keepSelection resource).
//             Ps = 1 0 4 1  -> Use the PRIMARY selection.  (This disables
//           the selectToClipboard resource).
//             Ps = 1 0 4 2  -> Disable Urgency window manager hint when
//           Control-G is received.  (This disables the bellIsUrgent
//           resource).
//             Ps = 1 0 4 3  -> Disable raising of the window when Control-
//           G is received.  (This disables the popOnBell resource).
//             Ps = 1 0 4 7  -> Use Normal Screen Buffer, clearing screen
//           first if in the Alternate Screen.  (This may be disabled by
//           the titeInhibit resource).
//             Ps = 1 0 4 8  -> Restore cursor as in DECRC.  (This may be
//           disabled by the titeInhibit resource).
//             Ps = 1 0 4 9  -> Use Normal Screen Buffer and restore cursor
//           as in DECRC.  (This may be disabled by the titeInhibit
//           resource).  This combines the effects of the 1 0 4 7  and 1 0
//           4 8  modes.  Use this with terminfo-based applications rather
//           than the 4 7  mode.
//             Ps = 1 0 5 0  -> Reset terminfo/termcap function-key mode.
//             Ps = 1 0 5 1  -> Reset Sun function-key mode.
//             Ps = 1 0 5 2  -> Reset HP function-key mode.
//             Ps = 1 0 5 3  -> Reset SCO function-key mode.
//             Ps = 1 0 6 0  -> Reset legacy keyboard emulation (X11R6).
//             Ps = 1 0 6 1  -> Reset keyboard emulation to Sun/PC style.
//             Ps = 2 0 0 4  -> Reset bracketed paste mode.
Terminal.prototype.resetMode = function() {
};

// CSI Pm m  Character Attributes (SGR).
//             Ps = 0  -> Normal (default).
//             Ps = 1  -> Bold.
//             Ps = 4  -> Underlined.
//             Ps = 5  -> Blink (appears as Bold).
//             Ps = 7  -> Inverse.
//             Ps = 8  -> Invisible, i.e., hidden (VT300).
//             Ps = 2 2  -> Normal (neither bold nor faint).
//             Ps = 2 4  -> Not underlined.
//             Ps = 2 5  -> Steady (not blinking).
//             Ps = 2 7  -> Positive (not inverse).
//             Ps = 2 8  -> Visible, i.e., not hidden (VT300).
//             Ps = 3 0  -> Set foreground color to Black.
//             Ps = 3 1  -> Set foreground color to Red.
//             Ps = 3 2  -> Set foreground color to Green.
//             Ps = 3 3  -> Set foreground color to Yellow.
//             Ps = 3 4  -> Set foreground color to Blue.
//             Ps = 3 5  -> Set foreground color to Magenta.
//             Ps = 3 6  -> Set foreground color to Cyan.
//             Ps = 3 7  -> Set foreground color to White.
//             Ps = 3 9  -> Set foreground color to default (original).
//             Ps = 4 0  -> Set background color to Black.
//             Ps = 4 1  -> Set background color to Red.
//             Ps = 4 2  -> Set background color to Green.
//             Ps = 4 3  -> Set background color to Yellow.
//             Ps = 4 4  -> Set background color to Blue.
//             Ps = 4 5  -> Set background color to Magenta.
//             Ps = 4 6  -> Set background color to Cyan.
//             Ps = 4 7  -> Set background color to White.
//             Ps = 4 9  -> Set background color to default (original).

//           If 16-color support is compiled, the following apply.  Assume
//           that xterm's resources are set so that the ISO color codes are
//           the first 8 of a set of 16.  Then the aixterm colors are the
//           bright versions of the ISO colors:
//             Ps = 9 0  -> Set foreground color to Black.
//             Ps = 9 1  -> Set foreground color to Red.
//             Ps = 9 2  -> Set foreground color to Green.
//             Ps = 9 3  -> Set foreground color to Yellow.
//             Ps = 9 4  -> Set foreground color to Blue.
//             Ps = 9 5  -> Set foreground color to Magenta.
//             Ps = 9 6  -> Set foreground color to Cyan.
//             Ps = 9 7  -> Set foreground color to White.
//             Ps = 1 0 0  -> Set background color to Black.
//             Ps = 1 0 1  -> Set background color to Red.
//             Ps = 1 0 2  -> Set background color to Green.
//             Ps = 1 0 3  -> Set background color to Yellow.
//             Ps = 1 0 4  -> Set background color to Blue.
//             Ps = 1 0 5  -> Set background color to Magenta.
//             Ps = 1 0 6  -> Set background color to Cyan.
//             Ps = 1 0 7  -> Set background color to White.

//           If xterm is compiled with the 16-color support disabled, it
//           supports the following, from rxvt:
//             Ps = 1 0 0  -> Set foreground and background color to
//           default.

//           If 88- or 256-color support is compiled, the following apply.
//             Ps = 3 8  ; 5  ; Ps -> Set foreground color to the second
//           Ps.
//             Ps = 4 8  ; 5  ; Ps -> Set background color to the second
//           Ps.
Terminal.prototype.characterAttributes = function() {
};

// CSI > Ps; Ps m
//           Set or reset resource-values used by xterm to decide whether
//           to construct escape sequences holding information about the
//           modifiers pressed with a given key.  The first parameter iden-
//           tifies the resource to set/reset.  The second parameter is the
//           value to assign to the resource.  If the second parameter is
//           omitted, the resource is reset to its initial value.
//             Ps = 1  -> modifyCursorKeys.
//             Ps = 2  -> modifyFunctionKeys.
//             Ps = 4  -> modifyOtherKeys.
//           If no parameters are given, all resources are reset to their
//           initial values.
Terminal.prototype.setResources = function() {
};

// CSI Ps n  Device Status Report (DSR).
//             Ps = 5  -> Status Report.  Result (``OK'') is
//           CSI 0 n
//             Ps = 6  -> Report Cursor Position (CPR) [row;column].
//           Result is
//           CSI r ; c R
// CSI ? Ps n
//           Device Status Report (DSR, DEC-specific).
//             Ps = 6  -> Report Cursor Position (CPR) [row;column] as CSI
//           ? r ; c R (assumes page is zero).
//             Ps = 1 5  -> Report Printer status as CSI ? 1 0  n  (ready).
//           or CSI ? 1 1  n  (not ready).
//             Ps = 2 5  -> Report UDK status as CSI ? 2 0  n  (unlocked)
//           or CSI ? 2 1  n  (locked).
//             Ps = 2 6  -> Report Keyboard status as
//           CSI ? 2 7  ;  1  ;  0  ;  0  n  (North American).
//           The last two parameters apply to VT400 & up, and denote key-
//           board ready and LK01 respectively.
//             Ps = 5 3  -> Report Locator status as
//           CSI ? 5 3  n  Locator available, if compiled-in, or
//           CSI ? 5 0  n  No Locator, if not.
Terminal.prototype.deviceStatusReport = function() {
};

// CSI > Ps n
//           Disable modifiers which may be enabled via the CSI > Ps; Ps m
//           sequence.  This corresponds to a resource value of "-1", which
//           cannot be set with the other sequence.  The parameter identi-
//           fies the resource to be disabled:
//             Ps = 1  -> modifyCursorKeys.
//             Ps = 2  -> modifyFunctionKeys.
//             Ps = 4  -> modifyOtherKeys.
//           If the parameter is omitted, modifyFunctionKeys is disabled.
//           When modifyFunctionKeys is disabled, xterm uses the modifier
//           keys to make an extended sequence of functions rather than
//           adding a parameter to each function key to denote the modi-
//           fiers.
Terminal.prototype.disableModifiers = function() {
};

// CSI > Ps p
//           Set resource value pointerMode.  This is used by xterm to
//           decide whether to hide the pointer cursor as the user types.
//           Valid values for the parameter:
//             Ps = 0  -> never hide the pointer.
//             Ps = 1  -> hide if the mouse tracking mode is not enabled.
//             Ps = 2  -> always hide the pointer.  If no parameter is
//           given, xterm uses the default, which is 1 .
Terminal.prototype.setPointerMode = function() {
};

// CSI ! p   Soft terminal reset (DECSTR).
Terminal.prototype.softReset = function() {
};

// CSI Ps$ p
//           Request ANSI mode (DECRQM).  For VT300 and up, reply is
//             CSI Ps; Pm$ y
//           where Ps is the mode number as in RM, and Pm is the mode
//           value:
//             0 - not recognized
//             1 - set
//             2 - reset
//             3 - permanently set
//             4 - permanently reset
Terminal.prototype.requestAnsiMode = function() {
};

// CSI ? Ps$ p
//           Request DEC private mode (DECRQM).  For VT300 and up, reply is
//             CSI ? Ps; Pm$ p
//           where Ps is the mode number as in DECSET, Pm is the mode value
//           as in the ANSI DECRQM.
Terminal.prototype.requestPrivateMode = function() {
};

// CSI Ps ; Ps " p
//           Set conformance level (DECSCL).  Valid values for the first
//           parameter:
//             Ps = 6 1  -> VT100.
//             Ps = 6 2  -> VT200.
//             Ps = 6 3  -> VT300.
//           Valid values for the second parameter:
//             Ps = 0  -> 8-bit controls.
//             Ps = 1  -> 7-bit controls (always set for VT100).
//             Ps = 2  -> 8-bit controls.
Terminal.prototype.setConformanceLevel = function() {
};

// CSI Ps q  Load LEDs (DECLL).
//             Ps = 0  -> Clear all LEDS (default).
//             Ps = 1  -> Light Num Lock.
//             Ps = 2  -> Light Caps Lock.
//             Ps = 3  -> Light Scroll Lock.
//             Ps = 2  1  -> Extinguish Num Lock.
//             Ps = 2  2  -> Extinguish Caps Lock.
//             Ps = 2  3  -> Extinguish Scroll Lock.
Terminal.prototype.loadLEDs = function() {
};

// CSI Ps SP q
//           Set cursor style (DECSCUSR, VT520).
//             Ps = 0  -> blinking block.
//             Ps = 1  -> blinking block (default).
//             Ps = 2  -> steady block.
//             Ps = 3  -> blinking underline.
//             Ps = 4  -> steady underline.
Terminal.prototype.setCursorStyle = function() {
};

// CSI Ps " q
//           Select character protection attribute (DECSCA).  Valid values
//           for the parameter:
//             Ps = 0  -> DECSED and DECSEL can erase (default).
//             Ps = 1  -> DECSED and DECSEL cannot erase.
//             Ps = 2  -> DECSED and DECSEL can erase.
Terminal.prototype.setCharProtectionAttr = function() {
};

// CSI Ps ; Ps r
//           Set Scrolling Region [top;bottom] (default = full size of win-
//           dow) (DECSTBM).
Terminal.prototype.setScrollingRegion = function() {
};

// CSI ? Pm r
//           Restore DEC Private Mode Values.  The value of Ps previously
//           saved is restored.  Ps values are the same as for DECSET.
Terminal.prototype.restorePrivateValues = function() {
};

// CSI Pt; Pl; Pb; Pr; Ps$ r
//           Change Attributes in Rectangular Area (DECCARA), VT400 and up.
//             Pt; Pl; Pb; Pr denotes the rectangle.
//             Ps denotes the SGR attributes to change: 0, 1, 4, 5, 7.
Terminal.prototype.setAttrInRectangle = function() {
};

// CSI s     Save cursor (ANSI.SYS).
Terminal.prototype.saveCursor = function() {
};

// CSI ? Pm s
//           Save DEC Private Mode Values.  Ps values are the same as for
//           DECSET.
Terminal.prototype.savePrivateValues = function() {
};

// CSI Ps ; Ps ; Ps t
//           Window manipulation (from dtterm, as well as extensions).
//           These controls may be disabled using the allowWindowOps
//           resource.  Valid values for the first (and any additional
//           parameters) are:
//             Ps = 1  -> De-iconify window.
//             Ps = 2  -> Iconify window.
//             Ps = 3  ;  x ;  y -> Move window to [x, y].
//             Ps = 4  ;  height ;  width -> Resize the xterm window to
//           height and width in pixels.
//             Ps = 5  -> Raise the xterm window to the front of the stack-
//           ing order.
//             Ps = 6  -> Lower the xterm window to the bottom of the
//           stacking order.
//             Ps = 7  -> Refresh the xterm window.
//             Ps = 8  ;  height ;  width -> Resize the text area to
//           [height;width] in characters.
//             Ps = 9  ;  0  -> Restore maximized window.
//             Ps = 9  ;  1  -> Maximize window (i.e., resize to screen
//           size).
//             Ps = 1 0  ;  0  -> Undo full-screen mode.
//             Ps = 1 0  ;  1  -> Change to full-screen.
//             Ps = 1 1  -> Report xterm window state.  If the xterm window
//           is open (non-iconified), it returns CSI 1 t .  If the xterm
//           window is iconified, it returns CSI 2 t .
//             Ps = 1 3  -> Report xterm window position.  Result is CSI 3
//           ; x ; y t
//             Ps = 1 4  -> Report xterm window in pixels.  Result is CSI
//           4  ;  height ;  width t
//             Ps = 1 8  -> Report the size of the text area in characters.
//           Result is CSI  8  ;  height ;  width t
//             Ps = 1 9  -> Report the size of the screen in characters.
//           Result is CSI  9  ;  height ;  width t
//             Ps = 2 0  -> Report xterm window's icon label.  Result is
//           OSC  L  label ST
//             Ps = 2 1  -> Report xterm window's title.  Result is OSC  l
//           label ST
//             Ps = 2 2  ;  0  -> Save xterm icon and window title on
//           stack.
//             Ps = 2 2  ;  1  -> Save xterm icon title on stack.
//             Ps = 2 2  ;  2  -> Save xterm window title on stack.
//             Ps = 2 3  ;  0  -> Restore xterm icon and window title from
//           stack.
//             Ps = 2 3  ;  1  -> Restore xterm icon title from stack.
//             Ps = 2 3  ;  2  -> Restore xterm window title from stack.
//             Ps >= 2 4  -> Resize to Ps lines (DECSLPP).
Terminal.prototype.manipulateWindow = function() {
};

// CSI Pt; Pl; Pb; Pr; Ps$ t
//           Reverse Attributes in Rectangular Area (DECRARA), VT400 and
//           up.
//             Pt; Pl; Pb; Pr denotes the rectangle.
//             Ps denotes the attributes to reverse, i.e.,  1, 4, 5, 7.
Terminal.prototype.reverseAttrInRectangle = function() {
};

// CSI > Ps; Ps t
//           Set one or more features of the title modes.  Each parameter
//           enables a single feature.
//             Ps = 0  -> Set window/icon labels using hexadecimal.
//             Ps = 1  -> Query window/icon labels using hexadecimal.
//             Ps = 2  -> Set window/icon labels using UTF-8.
//             Ps = 3  -> Query window/icon labels using UTF-8.  (See dis-
//           cussion of "Title Modes")
Terminal.prototype.setTitleModeFeature = function() {
};

// CSI Ps SP t
//           Set warning-bell volume (DECSWBV, VT520).
//             Ps = 0  or 1  -> off.
//             Ps = 2 , 3  or 4  -> low.
//             Ps = 5 , 6 , 7 , or 8  -> high.
Terminal.prototype.setWarningBellVolume = function() {
};

// CSI u     Restore cursor (ANSI.SYS).
Terminal.prototype.restoreCursor = function() {
};

// CSI Ps SP u
//           Set margin-bell volume (DECSMBV, VT520).
//             Ps = 1  -> off.
//             Ps = 2 , 3  or 4  -> low.
//             Ps = 0 , 5 , 6 , 7 , or 8  -> high.
Terminal.prototype.setMarginBellVolume = function() {
};

// CSI Pt; Pl; Pb; Pr; Pp; Pt; Pl; Pp$ v
//           Copy Rectangular Area (DECCRA, VT400 and up).
//             Pt; Pl; Pb; Pr denotes the rectangle.
//             Pp denotes the source page.
//             Pt; Pl denotes the target location.
//             Pp denotes the target page.
Terminal.prototype.copyRectangle = function() {
};

// CSI Pt ; Pl ; Pb ; Pr ' w
//           Enable Filter Rectangle (DECEFR), VT420 and up.
//           Parameters are [top;left;bottom;right].
//           Defines the coordinates of a filter rectangle and activates
//           it.  Anytime the locator is detected outside of the filter
//           rectangle, an outside rectangle event is generated and the
//           rectangle is disabled.  Filter rectangles are always treated
//           as "one-shot" events.  Any parameters that are omitted default
//           to the current locator position.  If all parameters are omit-
//           ted, any locator motion will be reported.  DECELR always can-
//           cels any prevous rectangle definition.
Terminal.prototype.enableFilterRectangle = function() {
};

// CSI Ps x  Request Terminal Parameters (DECREQTPARM).
//           if Ps is a "0" (default) or "1", and xterm is emulating VT100,
//           the control sequence elicits a response of the same form whose
//           parameters describe the terminal:
//             Ps -> the given Ps incremented by 2.
//             Pn = 1  <- no parity.
//             Pn = 1  <- eight bits.
//             Pn = 1  <- 2  8  transmit 38.4k baud.
//             Pn = 1  <- 2  8  receive 38.4k baud.
//             Pn = 1  <- clock multiplier.
//             Pn = 0  <- STP flags.
Terminal.prototype.requestParameters = function() {
};

// CSI Ps x  Select Attribute Change Extent (DECSACE).
//             Ps = 0  -> from start to end position, wrapped.
//             Ps = 1  -> from start to end position, wrapped.
//             Ps = 2  -> rectangle (exact).
Terminal.prototype.__ = function() {
};

// CSI Pc; Pt; Pl; Pb; Pr$ x
//           Fill Rectangular Area (DECFRA), VT420 and up.
//             Pc is the character to use.
//             Pt; Pl; Pb; Pr denotes the rectangle.
Terminal.prototype.fillRectangle = function() {
};

// CSI Ps ; Pu ' z
//           Enable Locator Reporting (DECELR).
//           Valid values for the first parameter:
//             Ps = 0  -> Locator disabled (default).
//             Ps = 1  -> Locator enabled.
//             Ps = 2  -> Locator enabled for one report, then disabled.
//           The second parameter specifies the coordinate unit for locator
//           reports.
//           Valid values for the second parameter:
//             Pu = 0  <- or omitted -> default to character cells.
//             Pu = 1  <- device physical pixels.
//             Pu = 2  <- character cells.
Terminal.prototype.enableLocatorReporting = function() {
};

// CSI Pt; Pl; Pb; Pr$ z
//           Erase Rectangular Area (DECERA), VT400 and up.
//             Pt; Pl; Pb; Pr denotes the rectangle.
Terminal.prototype.eraseRectangle = function() {
};

// CSI Pm ' {
//           Select Locator Events (DECSLE).
//           Valid values for the first (and any additional parameters)
//           are:
//             Ps = 0  -> only respond to explicit host requests (DECRQLP).
//                        (This is default).  It also cancels any filter
//           rectangle.
//             Ps = 1  -> report button down transitions.
//             Ps = 2  -> do not report button down transitions.
//             Ps = 3  -> report button up transitions.
//             Ps = 4  -> do not report button up transitions.
Terminal.prototype.setLocatorEvents = function() {
};

// CSI Pt; Pl; Pb; Pr$ {
//           Selective Erase Rectangular Area (DECSERA), VT400 and up.
//             Pt; Pl; Pb; Pr denotes the rectangle.
Terminal.prototype.selectiveEraseRectange = function() {
};

// CSI Ps ' |
//           Request Locator Position (DECRQLP).
//           Valid values for the parameter are:
//             Ps = 0 , 1 or omitted -> transmit a single DECLRP locator
//           report.

//           If Locator Reporting has been enabled by a DECELR, xterm will
//           respond with a DECLRP Locator Report.  This report is also
//           generated on button up and down events if they have been
//           enabled with a DECSLE, or when the locator is detected outside
//           of a filter rectangle, if filter rectangles have been enabled
//           with a DECEFR.

//             -> CSI Pe ; Pb ; Pr ; Pc ; Pp &  w

//           Parameters are [event;button;row;column;page].
//           Valid values for the event:
//             Pe = 0  -> locator unavailable - no other parameters sent.
//             Pe = 1  -> request - xterm received a DECRQLP.
//             Pe = 2  -> left button down.
//             Pe = 3  -> left button up.
//             Pe = 4  -> middle button down.
//             Pe = 5  -> middle button up.
//             Pe = 6  -> right button down.
//             Pe = 7  -> right button up.
//             Pe = 8  -> M4 button down.
//             Pe = 9  -> M4 button up.
//             Pe = 1 0  -> locator outside filter rectangle.
//           ``button'' parameter is a bitmask indicating which buttons are
//           pressed:
//             Pb = 0  <- no buttons down.
//             Pb & 1  <- right button down.
//             Pb & 2  <- middle button down.
//             Pb & 4  <- left button down.
//             Pb & 8  <- M4 button down.
//           ``row'' and ``column'' parameters are the coordinates of the
//           locator position in the xterm window, encoded as ASCII deci-
//           mal.
//           The ``page'' parameter is not used by xterm, and will be omit-
//           ted.
Terminal.prototype.requestLocatorPosition = function() {
};
