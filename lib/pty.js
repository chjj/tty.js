/**
 * pty.js
 * Copyright (c) 2012, Christopher Jeffrey (MIT License)
 * Binding to the pseudo terminals.
 */

var net = require('net');
var pty = require('../pty.node');

/**
 * Terminal
 */

// Example:
//  var term = new Terminal('bash', ['-i'], {
//    name: 'xterm-color',
//    cols: 80,
//    rows: 30,
//    cwd: process.env.HOME,
//    env: { HELLO: 'WORLD' }
//  });

var Terminal = function(file, args, opt) {
  if (!(this instanceof Terminal)) return new Terminal(file, args, opt);

  var self = this
    , env
    , cwd
    , name
    , cols
    , rows
    , term;

  // backward compatibility
  if (typeof args === 'string') {
    opt = {
      name: arguments[1],
      cols: arguments[2],
      rows: arguments[3],
      cwd: process.env.HOME
    };
    args = [];
  }

  // arguments
  args = args || [];
  file = file || 'sh';
  opt = opt || {};

  name = opt.name || 'vt100';
  cols = opt.cols || 80;
  rows = opt.rows || 30;
  env = opt.env || clone(process.env);
  cwd = opt.cwd || process.cwd();

  if (opt.name) env.TERM = name;
  env = environ(env);

  // fork
  term = pty.fork(file, args, env, cwd, cols, rows);
  this.socket = new net.Socket(term.fd);
  this.socket.setEncoding('utf8');
  this.socket.resume();

  // setup
  this.socket.on('error', function(err) {
    self.socket.writable = false;
    self.write = function() {};
    self.end = this.write;
    self.writable = false;

    // EIO, happens when someone closes our child
    // process: the only process in the terminal.
    if (err.code && ~err.code.indexOf('errno 5')) return;

    // throw anything else
    if (this.listeners('error').length < 2) {
      throw err;
    }
  });

  this.pid = term.pid;
  this.fd = term.fd;
  this.pty = term.pty;

  this.file = file;
  this.name = name;
  this.cols = cols;
  this.rows = rows;

  env = null;
};

Terminal.fork =
Terminal.spawn =
Terminal.createTerminal = function(file, args, opt) {
  return new Terminal(file, args, opt);
};

/**
 * Events
 */

// don't inherit from net.Socket in
// order to avoid collisions.

Terminal.prototype.write = function(data) {
  return this.socket.write(data);
};

Terminal.prototype.end = function(data) {
  return this.socket.end(data);
};

Terminal.prototype.pipe = function(dest, options) {
  return this.socket.pipe(dest, options);
};

Terminal.prototype.addListener =
Terminal.prototype.on = function(type, func) {
  this.socket.on(type, func);
  return this;
};

Terminal.prototype.emit = function() {
  return this.socket.emit.apply(this.socket, arguments);
};

Terminal.prototype.listeners = function(type) {
  return this.socket.listeners(type);
};

Terminal.prototype.removeListener = function(type, func) {
  this.socket.removeListener(type, func);
  return this;
};

Terminal.prototype.removeAllListeners = function(type) {
  this.socket.removeAllListeners(type);
  return this;
};

Terminal.prototype.once = function(type, func) {
  this.socket.once(type, func);
  return this;
};

/**
 * TTY
 */

Terminal.prototype.resize = function(cols, rows) {
  this.cols = cols;
  this.rows = rows;

  pty.resize(this.fd, cols, rows);
};

Terminal.prototype.destroy = function() {
  var self = this;

  this.socket.writable = false;
  this.write = function() {};
  this.end = this.write;
  this.writable = false;

  // Need to close the read stream so
  // node stops reading a dead file descriptor.
  // Then we can safely SIGINT the shell
  // This may not be necessary, but do it
  // for good measure.
  this.socket.on('close', function() {
    try {
      process.kill(self.pid, 'SIGINT');
    } catch(e) {
      ;
    }
  });

  this.socket.destroy();
};

Terminal.prototype.__defineGetter__('process', function() {
  return pty.process(this.fd, this.pty) || this.file;
});

/**
 * Helpers
 */

function clone(a) {
  var b = {}
    , keys = Object.keys(a || {})
    , i = keys.length;

  while (i--) {
    b[keys[i]] = a[keys[i]];
  }

  return b;
}

function environ(env) {
  var keys = Object.keys(env)
    , i = keys.length
    , pairs = [];

  while (i--) {
    pairs.push(keys[i] + '=' + env[keys[i]]);
  }

  return pairs;
}

/**
 * Expose
 */

exports = Terminal;
exports.Terminal = Terminal;
exports.native = pty;
module.exports = exports;
