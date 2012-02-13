/**
 * tty.js
 */

process.title = 'tty.js';

/**
 * Modules
 */

var net = require('net')
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

io.sockets.on('connection', function(socket) {
  var terms = [];

  socket.on('create', create);

  // can't use this right now
  // some error handling for a bad 'init'
  socket.on('init', function() {
    // need a new terminal
    if (!terms.length) return create();

    var i = terms.length
      , term = terms[0];

    term.socket.removeAllListeners();
    term.on('data', function(data) {
      socket.emit('data', data, i);
    });

    // kill all the other terms
    while (terms.length > 1) {
      terms.pop().destroy();
    }
  });

  function create() {
    var i = terms.length;

    var term = new Terminal(shellPath, termName, 80, 30);
    terms.push(term);

    term.on('data', function(data) {
      socket.emit('data', data, i);
    });

    console.log(''
      + 'Created shell with pty master/slave'
      + ' pair (master: %d, pid: %d)',
      term.fd, term.pid);
  }

  socket.on('data', function(data, i) {
    terms[i].write(data);
  });

  socket.on('kill', function(i) {
    console.log('Killed pty: %d.', terms[i].fd);
    terms[i].destroy();
    terms[i] = null; // don't splice!
  });

  socket.on('resize', function(cols, rows, i) {
    terms[i].resize(cols, rows);
  });

  socket.on('disconnect', function() {
    // should we keep the terminal state
    // persistent throughout the node's
    // lifetime?
    // this is a tough decision because
    // if a person kills the page during
    // use of a curses app, the terminal
    // screen wont have fully rendered
    // by the time the page reloads.
    // kill every terminal for now.
    // make terminals local to each socket.
    var term;
    while (terms.length) {
      term = terms.pop();
      if (term) term.destroy();
    }
    console.log('Client disconnected. Killed all pty\'s.');
  });
});
