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

var shellPath = process.env.SHELL || 'sh';
var termName = 'xterm';

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

app.use(express.static(__dirname + '/../static'));

/**
 * Stylesheet
 */

if (!conf.stylesheet) {
  conf.stylesheet = __dirname + '/../static/style.css';
}

conf.stylesheet = fs.readFileSync(conf.stylesheet);
app.get('/style.css', function(req, res, next) {
  res.contentType('.css');
  res.send(conf.stylesheet);
});

/**
 * Expose Options
 */

conf.term = JSON.stringify(conf.term || {});

app.get('/options.js', function(req, res, next) {
  res.contentType('.js');
  res.send('Terminal.options = ' + conf.term
    + ';\n' + '(' + applyConfig + ')();');
});

var applyConfig = function() {
  for (var key in Terminal.options) {
    if (Object.prototype.hasOwnProperty(Terminal.options, key)) {
      Terminal[key] = Terminal.options[key];
    }
  }
  delete Terminal.options;
} + '';

/**
 * Sockets
 */

io = io.listen(app);

io.configure(function() {
  io.disable('log');
});

io.sockets.on('connection', function(socket) {
  var terms = [];

  socket.on('create', function() {
    var id = terms.length;

    var term = new Terminal(shellPath, termName, 80, 30);
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

app.listen(conf.port || 8080);

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

  if (conf.auth.username.length !== 40) {
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
