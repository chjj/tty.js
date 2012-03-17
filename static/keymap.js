"use strict";

var isMac = ~navigator.userAgent.indexOf('Mac');

var ESC_SEQ = String.fromCharCode(27);

var defaultMap = {
  // backspace
  8: '\x7f', // '\x08'
  // tab
  9: '\t',
  // return
  13: '\r',
  // escape
  27: ESC_SEQ,
  // space
  32: { ctrl: String.fromCharCode(0) },
  // page-up
  33: { default: ESC_SEQ + '[5~', shift: true },
  // page-down
  34: { default: ESC_SEQ + '[6~', shift: true },
  // end
  35: ESC_SEQ + '0F',
  // home
  36: { default: ESC_SEQ + '[H', keypad: ESC_SEQ + 'OH' },
  // left
  37: { default: ESC_SEQ + '[D', keypad: ESC_SEQ + 'OD' },
  // up
  38: { default: ESC_SEQ + '[A', keypad: ESC_SEQ + 'OA', ctrl: true },
  // right
  39: { default: ESC_SEQ + '[C', keypad: ESC_SEQ + 'OC' },
  // down
  40: { default: ESC_SEQ + '[B', keypad: ESC_SEQ + 'OB', ctrl: true },
  // insert
  45: ESC_SEQ + '[2~',
  // delete
  46: ESC_SEQ + '[3~',
  // 8
  56: { ctrl: String.fromCharCode(127) },
  // f1
  112: ESC_SEQ + 'OP',
  113: ESC_SEQ + 'OQ',
  114: ESC_SEQ + 'OR',
  115: ESC_SEQ + 'OS',
  116: ESC_SEQ + '[15~',
  117: ESC_SEQ + '[17~',
  118: ESC_SEQ + '[18~',
  119: ESC_SEQ + '[19~',
  120: ESC_SEQ + '[20~',
  121: ESC_SEQ + '[21~',
  122: ESC_SEQ + '[23~',
  // f12
  123: ESC_SEQ + '[24~',
  // [
  219: { ctrl: String.fromCharCode(27) },
  // ]
  221: { ctrl: String.fromCharCode(29) },
};

var KeyMap = function (map) {
  var k;

  this._map = {};
  for (k in map) {
    if (typeof map[k] === 'string' || map[k] instanceof String)
      this._map[k] = { default: map[k] };
    else
      this._map[k] = map[k];
  }
};

KeyMap.prototype.lookup = function (ev, keypad) {
  var key, str, mask = [];

  key = ev.keyCode;
  str = '';

  if (ev.ctrlKey)
    mask.push('ctrl');

  if (ev.shiftKey)
    mask.push('shift');

  if (ev.altKey || ev.metaKey)
    mask.push('alt');

  if (!mask.length) {
    if (keypad) {
      mask.push('keypad');
    } else {
      mask.push('default');
    }
  }

  mask = mask.join('_');

  if (this._map[key] && this._map[key][mask]) {
    str = this._map[key][mask];
  } else {
    if (ev.ctrlKey) {
      if (key >= 65 && key <= 90) {
        str = String.fromCharCode(key - 64);
      } else if (key >= 51 && key <= 55) {
        str = String.fromCharCode(key - 51 + 27);
      }
    } else if ((!isMac && ev.altKey) || (isMac && ev.metaKey)) {
      if (key >= 65 && key <= 90) {
        str = ESC_SEQ + String.fromCharCode(key + 32);
      } else if (key >= 48 && key <= 57) {
        str = ESC_SEQ + (key = 48);
      }
    }
  }

  return str;
};
