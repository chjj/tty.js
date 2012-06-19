/**
 * tty.js: logger.js
 * Copyright (c) 2012, Christopher Jeffrey (MIT License)
 */

/**
 * Logger
 */

var slice = Array.prototype.slice;

var isatty = require('tty').isatty;
isatty = [isatty(0), isatty(1), isatty(2)];

var levels = {
  'log': [34, 'log'],
  'error': [41, 'error'],
  'warning': [31, 'error'] // 31, 33, 91
};

function logger(level) {
  var args = Array.prototype.slice.call(arguments, 1);

  if (typeof args[0] !== 'string') args.unshift('');

  level = levels[level];

  args[0] = '\x1b['
    + level[0]
    + 'm['
    + logger.prefix
    + ']\x1b[m '
    + args[0];

  if ((level[1] === 'log' && !isatty[1])
      || (level[1] === 'error' && !isatty[2])) {
    args[0] = args[0].replace(/\x1b\[(?:\d+(?:;\d+)*)?m/g, '');
  }

  return console[level[1]].apply(console, args);
}

logger.prefix = 'tty.js';

logger.log = function() {
  return logger('log', slice.call(arguments));
};

logger.warning = function() {
  return logger('warning', slice.call(arguments));
};

logger.error = function() {
  return logger('error', slice.call(arguments));
};

module.exports = logger;
