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
 * App
 */

var app = conf.https && conf.https.key && !conf.https.disabled
  ? express.createServer(conf.https)
  : express.createServer();

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

var auth = basicAuth();
app.use(auth);

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

var io = io.listen(app)
  , state = {};

io.configure(function() {
  io.disable('log');
});

io.set('authorization', function(data, next) {
  auth(data, null, function(err) {
    data.user = data.remoteUser || data.user;
    return !err
      ? next(null, true)
      : next(err);
  });
});

io.sockets.on('connection', function(socket) {
  var req = socket.handshake
    , terms = {}
    , uid = 0;

  // User sessions, something like:
  // Possibly allow for a key other than req.user.
  if (conf.sessions_never_use && conf.users) {
    var session = state[req.user];
    if (session) {
      terms = session.terms;
      uid = session.uid;
      socket.emit('sync', {
        terms: Object.keys(terms),
        uid: uid
      });
    } else {
      session = {
        terms: terms,
        uid: uid
      };
      state[req.user] = session;
    }
  }

  socket.on('create', function(cols, rows, func) {
    var id = uid++
      , len = Object.keys(terms).length
      , term;

    // Sync session.uid
    if (session) session.uid = uid;

    if (len >= conf.limitPerUser || pty.total >= conf.limitGlobal) {
      return func('Terminal limit.');
    }

    term = pty.fork(conf.shell, conf.shellArgs, {
      name: conf.termName,
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

    return func(null, {
      pty: term.pty,
      process: sanitize(conf.shell)
    });
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
    return func(null, sanitize(name));
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

// Todo: allow custom hooks for user lookup.
function basicAuth() {
  if (!conf.users) {
    return function(req, res, next) {
      next();
    };
  }

  var crypto = require('crypto')
    , saidWarning;

  var sha1 = function(text) {
    return crypto
      .createHash('sha1')
      .update(text)
      .digest('hex');
  };

  var hashed = function(hash) {
    if (!hash) return;
    return hash.length === 40 && !/[^a-f0-9]/.test(hash);
  };

  // Hash everything for consistency.
  Object.keys(conf.users).forEach(function(name) {
    if (!saidWarning && !hashed(conf.users[name])) {
      console.log('Warning: You should sha1 your usernames/passwords.');
      saidWarning = true;
    }

    var username = !hashed(name)
      ? sha1(name)
      : name;

    conf.users[username] = !hashed(conf.users[name])
      ? sha1(conf.users[name])
      : conf.users[name];

    if (username !== name) delete conf.users[name];
  });

  return express.basicAuth(function(user, pass) {
    var user = sha1(user)
      , password;

    if (!Object.hasOwnProperty.call(conf.users, user)) {
      return next();
    }

    password = conf.users[user];

    return sha1(pass) === password;
  });
}

function sanitize(file) {
  if (!file) return '';
  file = file.split(' ')[0] || '';
  return path.basename(file) || '';
}
