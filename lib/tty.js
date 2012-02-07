/**
 * tty.js
 */

process.title = 'tty.js';

var fs = require('fs')
  , express = require('express')
  , io = require('socket.io');

/**
 * Terminal
 */

var pty = require('../build/Release/pty.node');

var createShell = function() {
  var path = process.env.SHELL || 'sh';
  var shell = pty.forkPty(path, 'vt100', 80, 30);

  return {
    stdin: fs.createWriteStream(null, { fd: shell.fd }),
    stdout: fs.createReadStream(null, { fd: shell.fd }),
    pid: shell.pid,
    fd: shell.fd
  };
};

var shell = createShell();

var buff = []
  , socket;

var outputHandler = function(data) {
  if (!socket) {
    buff.push(data);
  } else {
    socket.send(data);
  }
};

shell.stdout.setEncoding('utf8');
shell.stdout.on('data', outputHandler);
shell.stdout._read();

console.log(''
  + 'Created shell with master/slave'
  + ' pair (master: %d, pid: %d)',
  shell.fd, shell.pid);

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
    shell.stdin.write(data);
  });

  socket.on('disconnect', function() {
    ;
  });

  while (buff.length) {
    outputHandler(buff.shift());
  }
});
