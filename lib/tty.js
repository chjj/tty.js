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
  , io = require('socket.io')
  , pty = require('pty.js');

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

app.get('/options.js', function(req, res, next) {
  res.contentType('.js');
  fs.readFile(conf.json, 'utf8', function(err, data) {
    try {
      data = JSON.parse(data) || {};
    } catch(e) {
      data = {};
    }
    res.send('Terminal.options = '
      + JSON.stringify(data.term || {})
      + ';\n'
      + '('
      + applyConfig
      + ')();');
  });
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
  var terms = {}
    , uid = 0;

  socket.on('create', function(cols, rows, func) {
    var id = uid++
      , term;

    term = pty.fork(shellPath, [], {
      name: termName,
      cols: cols,
      rows: rows,
      cwd: process.env.HOME
    });

    terms[id] = term;

    term.on('data', function(data) {
      socket.emit('data', id, data);
    });

    term.on('close', function() {
      // make sure it closes
      // on the clientside
      socket.emit('kill', id);

      // ensure removal
      if (terms[id]) delete terms[id];

      console.log(
        'Closed pty (%s): %d.',
        term.pty, term.fd);
    });

    console.log(''
      + 'Created shell with pty (%s) master/slave'
      + ' pair (master: %d, pid: %d)',
      term.pty, term.fd, term.pid);

    func(term.pty, sanitize(shellPath));
  });

  socket.on('data', function(id, data) {
    if (!terms[id]) {
      console.error(''
        + 'Warning: Client attempting to'
        + ' write to a non-existent terminal.'
        + ' (id: %s)', id);
      return;
    }
    terms[id].write(data);
  });

  socket.on('kill', function(id) {
    if (!terms[id]) return;
    terms[id].destroy();
    delete terms[id];
  });

  socket.on('resize', function(id, cols, rows) {
    if (!terms[id]) return;
    terms[id].resize(cols, rows);
  });

  socket.on('process', function(id, func) {
    if (!terms[id]) return;
    var name = terms[id].process;
    func(sanitize(name));
  });

  socket.on('disconnect', function() {
    var key = Object.keys(terms)
      , i = key.length
      , term;

    while (i--) {
      term = terms[key[i]];
      term.destroy();
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

function sanitize(file) {
  file = (file || '').split(' ')[0];
  return path.basename(file);
}
