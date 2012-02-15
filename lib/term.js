/**
 * term.js
 * Copyright (c) 2012, Christopher Jeffrey (MIT License)
 * Binding to the pseudo terminals.
 */

var net = require('net');

var pty = require('../pty.node');

/**
 * Terminal
 */

var Terminal = function(process, name, cols, rows) {
  var self = this;

  process = process || 'sh';
  name = name || 'vt100';
  cols = cols || 80;
  rows = rows || 30;

  var term = pty.fork(process, name, cols, rows);

  this.socket = new net.Socket(term.fd);
  this.socket.setEncoding('utf8');
  this.socket.resume();

  this.socket.on('error', function(err) {
    self.write = function() {};
    self.writeable = false;

    // EIO, happens when someone closes our child
    // process: the only process in the terminal.
    // ideally, we should emit an event to the websocket
    // notifying the browser that the terminal has closed.
    if (err.code && ~err.code.indexOf('errno 5')) return;

    // throw anything else
    throw err;
  });

  this.pid = term.pid;
  this.fd = term.fd;
  this.pty = term.name;

  this.process = process;
  this.name = name;
  this.cols = cols;
  this.rows = rows;
};

Terminal.prototype.write = function(data) {
  return this.socket.write(data);
};

Terminal.prototype.pipe = function(dest, options) {
  return this.socket.pipe(dest, options);
};

Terminal.prototype.on = function(type, func) {
  this.socket.on(type, func);
  return this;
};

Terminal.prototype.resize = function(cols, rows) {
  this.cols = cols;
  this.rows = rows;

  pty.resize(this.fd, cols, rows);
};

Terminal.prototype.destroy = function() {
  var self = this;

  this.socket.writable = false;
  this.write = function() {};
  this.writable = false;

  // Need to close the read stream so
  // node stops reading a dead file descriptor.
  // Then we can safely SIGINT the shell
  // or whatever process was in the terminal.
  // SIGKILL makes libuv throw an UNKNOWN error.
  this.socket.on('close', function() {
    process.kill(self.pid, 'SIGINT');
  });

  this.socket.destroy();
};

module.exports = Terminal;
