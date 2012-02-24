/**
 * tty.js
 * Copyright (c) 2012, Christopher Jeffrey (MIT License)
 */

process.title = 'tty.js';

/**
 * Modules
 */

var path = require('path')
  , fs = require('fs');

var express = require('express')
  , io = require('socket.io');

var Terminal = require('./term');

/**
 * Config
 */

var conf = require('./config');

/**
 * Parameters
 */

// Path to shell, or the process to execute in the terminal.
var shellPath = conf.shell || process.env.SHELL || 'sh';

// $TERM
var termName = 'xterm';
termName = conf.term.termName || termName;
conf.term.termName = termName;

/**
 * App
 */

var app;

if (conf.https && conf.https.key && !conf.https.disabled) {
  app = express.createServer(conf.https);
} else {
  app = express.createServer();
}

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

if (conf.auth && conf.auth.username && !conf.auth.disabled) {
  app.use(basicAuth());
}

app.use(express.favicon(__dirname + '/../static/favicon.ico'));

app.use(app.router);

if (conf.static) {
  app.use(express.static(conf.static));
}

app.use(express.static(__dirname + '/../static'));

/**
 * Stylesheets
 */

app.get('/style.css', function(req, res, next) {
  res.contentType('.css');
  res.sendfile(conf.stylesheet);
});

app.get('/user.css', function(req, res, next) {
  res.contentType('.css');
  return conf.userStylesheet
    ? res.sendfile(conf.userStylesheet)
    : res.send('\n');
});

/**
 * Expose Terminal Options
 */

var options = JSON.stringify(conf.term);

app.get('/options.js', function(req, res, next) {
  res.contentType('.js');
  res.send('Terminal.options = '
    + options
    + ';\n'
    + '('
    + applyConfig
    + ')();');
});

function applyConfig() {
  for (var key in Terminal.options) {
    if (Object.prototype.hasOwnProperty.call(Terminal.options, key)) {
      Terminal[key] = Terminal.options[key];
    }
  }
  delete Terminal.options;
}

/**
 * Sockets
 */

io = io.listen(app);

io.configure(function() {
  io.disable('log');
});

io.sockets.on('connection', function(socket) {
  var terms = [];

  socket.on('create', function(cols, rows, func) {
    var id = terms.length
      , cols = cols || 80
      , rows = rows || 30;

    var term = new Terminal(shellPath, termName, cols, rows);
    terms.push(term);

    term.on('data', function(data) {
      socket.emit('data', data, id);
    });

    term.on('close', function() {
      // make sure it closes
      // on the clientside
      socket.emit('kill', id);
      console.log(
        'Closed pty (%s): %d.',
        term.pty, term.fd);
    });

    console.log(''
      + 'Created shell with pty (%s) master/slave'
      + ' pair (master: %d, pid: %d)',
      term.pty, term.fd, term.pid);

    func(term.pty, path.basename(shellPath));
  });

  socket.on('data', function(data, id) {
    terms[id].write(data);
  });

  socket.on('kill', function(id) {
    // failsafe. in case the browser
    // sends this event twice. this
    // shouldn't happen, but it could.
    if (!terms[id]) return;

    terms[id].destroy();
    terms[id] = null; // don't splice!
  });

  socket.on('resize', function(cols, rows, id) {
    terms[id].resize(cols, rows);
  });

  socket.on('process', function(id, func) {
    var name = terms[id].getProcessName();
    func(name);
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
    console.log('Client disconnected. Killing all pty\'s...');
  });
});

/**
 * Listen
 */

app.listen(conf.port || 8080, conf.hostname);

/**
 * Basic Auth
 */

function basicAuth() {
  var crypto = require('crypto');

  var sha1 = function(text) {
    return crypto
      .createHash('sha1')
      .update(text)
      .digest('hex');
  };

  var hash = conf.auth.username + conf.auth.password;
  if (hash.length !== 80 || /[^a-f0-9]/i.test(hash)) {
    sha1 = function(s) { return s; };
    console.error('Warning: You should sha1 your auth info.');
  }

  return express.basicAuth(function(user, pass, next) {
    user = sha1(user);
    pass = sha1(pass);

    var verified = user === conf.auth.username
                && pass === conf.auth.password;

    next(null, verified);
  });
}
