/**
 * tty.js
 */

process.title = 'tty.js';

/**
 * Modules
 */

var fs = require('fs')
  , express = require('express')
  , io = require('socket.io');

var pty = require('../build/Release/pty.node');

/**
 * Parameters
 */

var shellPath = process.env.SHELL || 'sh';

// linux console support is very stable, but
// the linux console doesn't have an alternate
// screen buffer.
// var termName = 'linux';

// xterm - more robust, but less tested.
var termName = 'xterm';

// easy to support, but no color.
// var termName = 'vt100';

/**
 * Terminal
 */

var Terminal = function(process, name, cols, rows) {
  process = process || 'sh';
  name = name || 'vt100';
  cols = cols || 80;
  rows = rows || 30;

  var term = pty.fork(process, name, cols, rows);

  this.input = fs.createWriteStream(null, { fd: term.fd });
  this.output = fs.createReadStream(null, { fd: term.fd });

  this.output.setEncoding('utf8');
  this.output._read();

  this.pid = term.pid;
  this.fd = term.fd;

  this.cols = cols;
  this.rows = rows;
};

Terminal.prototype.write = function(data) {
  return this.input.write(data);
};

Terminal.prototype.pipe = function(dest, options) {
  return this.output.pipe(dest, options);
};

Terminal.prototype.on = function(type, func) {
  this.output.on(type, func);
  return this;
};

Terminal.prototype.resize = function(cols, rows) {
  this.cols = cols;
  this.rows = rows;

  pty.resize(this.fd, cols, rows);
};

Terminal.prototype.destroy = function() {
  var self = this;

  this.input.writable = false;
  this.write = function() {};
  this.writable = false;

  // Need to close the read stream so
  // node stops reading a dead file descriptor.
  // Then we can safely SIGINT the shell
  // or whatever process was in the terminal.
  // SIGKILL makes libuv throw an UNKNOWN error.
  this.output.on('close', function() {
    process.kill(self.pid, 'SIGINT');
  });

  this.output.destroy();
};

/**
 * Open Terminal & Fork Shell
 */

var buff = []
  , socket
  , term;

term = new Terminal(shellPath, termName, 80, 30);
term.on('data', outputHandler);

console.log(''
  + 'Created shell with pty master/slave'
  + ' pair (master: %d, pid: %d)',
  term.fd, term.pid);

function outputHandler(data) {
  if (!socket) {
    buff.push(data);
  } else {
    socket.send(data);
  }
}

/**
 * App
 */

var app = express.createServer();

app.use(function(req, res, next) {
  var setHeader = res.setHeader;
  res.setHeader = function(name) {
    switch (name) {
      case 'Cache-Control':
      case 'Last-Modified':
      case 'ETag':
        return;
    }
    return setHeader.apply(res, arguments);
  };
  next();
});

app.use(express.static(__dirname + '/../static'));

app.listen(8080);

/**
 * Sockets
 */

io = io.listen(app);

io.configure(function() {
  io.disable('log');
});

io.sockets.on('connection', function(sock) {
  socket = sock;

  socket.on('message', function(data) {
    term.write(data);
  });

  socket.on('disconnect', function() {
    ;
  });

  while (buff.length) {
    outputHandler(buff.shift());
  }
});
