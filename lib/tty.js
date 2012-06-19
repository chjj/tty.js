/**
 * tty.js
 * Copyright (c) 2012, Christopher Jeffrey (MIT License)
 */

/**
 * Modules
 */

var path = require('path')
  , fs = require('fs')
  , Stream = require('stream').Stream;

var express = require('express')
  , io = require('socket.io')
  , pty = require('pty.js');

var config = require('./config')
  , logger = require('./logger');

/**
 * Server
 */

function Server(conf) {
  if (!(this instanceof Server)) {
    return new Server(conf);
  }

  conf = config.checkConfig(conf);

  var self = this;
  var app = conf.https && conf.https.key
    ? express.createServer(conf.https)
    : express.createServer();

  // Inherit from express >= 3.0.
  Object.getOwnPropertyNames(app).forEach(function(key) {
    // A function here that has the original app
    // closure-scoped would be a problem.
    Object.defineProperty(self, key, Object.getOwnPropertyDescriptor(app, key));
  });

  // Call init again for good measure,
  // to potentially get rid of
  // closure-scoped references
  // to the original app.
  this.init();

  this.sessions = {};
  this.conf = conf;
  this._auth = this._basicAuth();
  this.io = io.listen(this, {
    log: false
  });

  this._init();

  this.on('listening', function() {
    self.log('Listening on port %s.', self.conf.port);
  });
}

Server.prototype.__proto__ = express.createServer().__proto__;

Server.prototype._init = function() {
  this._init = function() {};
  this.initMiddleware();
  this.initRoutes();
  this.initIO();
};

Server.prototype.initMiddleware = function() {
  var self = this;
  var conf = this.conf;

  this.use(function(req, res, next) {
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

  this.use(function(req, res, next) {
    return self._auth(req, res, next);
  });

  if (conf.static) {
    this.use(express.static(conf.static));
  }

  // If there is a custom favicon in the custom
  // static directory, this will be ignored.
  this.use(express.favicon(__dirname + '/../static/favicon.ico'));

  this.use(this.router);

  this.use(express.static(__dirname + '/../static'));
};

Server.prototype.setAuth = function(func) {
  this._auth = func;
};

Server.prototype.initRoutes = function() {
  var self = this;
  this.get('/options.js', function(req, res, next) {
    return self.handleOptions(req, res, next);
  });
};

Server.prototype.handleOptions = function(req, res, next) {
  var self = this;
  var conf = this.conf;

  res.contentType('.js');
  fs.readFile(conf.json, 'utf8', function(err, data) {
    try {
      data = JSON.parse(data) || {};
    } catch(e) {
      data = {};
    }

    if (data.term) {
      Object.keys(data.term).forEach(function(key) {
        conf.term[key] = data.term[key];
      });
    }

    res.send('Terminal.options = '
      + JSON.stringify(conf.term, null, 2)
      + ';\n'
      + '('
      + applyConfig
      + ')();');
  });
};

Server.prototype.initIO = function() {
  var self = this;
  var io = this.io;

  io.configure(function() {
    io.disable('log');
  });

  io.set('authorization', function(data, next) {
    return self.handleAuth(data, next);
  });

  io.sockets.on('connection', function(socket) {
    return self.handleConnection(socket);
  });
};

Server.prototype.handleAuth = function(data, next) {
  var io = this.io;
  data.__proto__ = Stream.prototype;
  this._auth(data, null, function(err) {
    data.user = data.remoteUser || data.user;
    return !err
      ? next(null, true)
      : next(err);
  });
};

Server.prototype.handleConnection = function(socket) {
  var session = new Session(this, socket);

  socket.on('create', function(cols, rows, func) {
    return session.handleCreate(cols, rows, func);
  });

  socket.on('data', function(id, data) {
    return session.handleData(id, data);
  });

  socket.on('kill', function(id) {
    return session.handleKill(id);
  });

  socket.on('resize', function(id, cols, rows) {
    return session.handleResize(id, cols, rows);
  });

  socket.on('process', function(id, func) {
    return session.handleProcess(id, func);
  });

  socket.on('disconnect', function() {
    return session.handleDisconnect();
  });
};

Server.prototype._basicAuth = function() {
  var self = this;
  var conf = this.conf;

  if (!conf.users) {
    return function(req, res, next) {
      next();
    };
  }

  var crypto = require('crypto')
    , users = conf.users
    , hashedUsers = {}
    , saidWarning;

  function sha1(text) {
    return crypto
      .createHash('sha1')
      .update(text)
      .digest('hex');
  }

  function hashed(hash) {
    if (!hash) return;
    return hash.length === 40 && !/[^a-f0-9]/.test(hash);
  }

  function verify(user, pass, next) {
    var username = sha1(user)
      , password;

    if (!Object.hasOwnProperty.call(hashedUsers, username)) {
      return next();
    }

    password = hashedUsers[username];

    if (sha1(pass) !== password) return next(true);

    next(null, user);
  }

  // Hash everything for consistency.
  Object.keys(users).forEach(function(name) {
    if (!saidWarning && !hashed(users[name])) {
      self.warning('You should sha1 your user information.');
      saidWarning = true;
    }

    var username = !hashed(name)
      ? sha1(name)
      : name;

    hashedUsers[username] = !hashed(users[name])
      ? sha1(users[name])
      : users[name];
  });

  return express.basicAuth(verify);
};

Server.prototype.log = function() {
  return this._log('log', slice.call(arguments));
};

Server.prototype.error = function() {
  return this._log('error', slice.call(arguments));
};

Server.prototype.warning = function() {
  return this._log('warning', slice.call(arguments));
};

Server.prototype._log = function(level, args) {
  if (this.conf.log === false) return;
  args.unshift(level);
  return logger.apply(null, args);
};

Server.prototype._listen = express.createServer().listen;
Server.prototype.listen = function(port, hostname, func) {
  port = port || this.conf.port || 8080;
  hostname = hostname || this.conf.hostname;
  return this._listen(port, hostname, func);
};

/**
 * Session
 */

function Session(server, socket) {
  this.server = server;
  this.socket = socket;
  this.terms = {};
  this.req = socket.handshake;

  var conf = this.server.conf;
  var terms = this.terms;
  var sessions = this.server.sessions;
  var req = socket.handshake;

  this.user = req.user;
  this.id = req.user || this.uid();

  // Kill/sync older session.
  if (conf.syncSession) {
    if (sessions[this.id]) {
      this.sync(sessions[this.id].terms);
      sessions[this.id].destroy();
    }
  }

  sessions[this.id] = this;

  this.log('Session \x1b[1m%s\x1b[m created.', this.id);
}

Session.uid = 0;
Session.prototype.uid = function() {
  if (this.server.conf.syncSession) {
    var req = this.req;
    return req.address.address
      + ':' + req.address.port
      + ':' + req.headers['user-agent'];
  }
  return Session.uid++ + '';
};

Session.prototype.destroy = function() {
  try {
    this.socket.disconnect();
  } catch (e) {
    ;
  }
};

Session.prototype.log = function() {
  return this._log('log', slice.call(arguments));
};

Session.prototype.error = function() {
  return this._log('error', slice.call(arguments));
};

Session.prototype.warning = function() {
  return this._log('warning', slice.call(arguments));
};

Session.prototype._log = function(level, args) {
  if (typeof args[0] !== 'string') args.unshift('');
  var id = this.id.split(':')[0];
  //args[0] = '\x1b[35m(' + id + ')\x1b[m ' + args[0];
  args[0] = '\x1b[1m' + id + '\x1b[m ' + args[0];
  return this.server._log(level, args);
};

Session.prototype.sync = function(terms) {
  if (terms) this.terms = terms;
  this.socket.emit('sync', this.terms);
};

Session.prototype.handleCreate = function(cols, rows, func) {
  var self = this;
  var terms = this.terms;
  var conf = this.server.conf;
  var socket = this.socket;

  var len = Object.keys(terms).length
    , term
    , id;

  if (len >= conf.limitPerUser || pty.total >= conf.limitGlobal) {
    this.warning('Terminal limit reached.');
    return func({ error: 'Terminal limit.' });
  }

  term = pty.fork(conf.shell, conf.shellArgs, {
    name: conf.termName,
    cols: cols,
    rows: rows,
    cwd: conf.cwd || process.env.HOME
  });

  id = term.pty;
  terms[id] = term;

  term.on('data', function(data) {
    socket.emit('data', id, data);
  });

  term.on('close', function() {
    // Make sure it closes
    // on the clientside.
    socket.emit('kill', id);

    // Ensure removal.
    if (terms[id]) delete terms[id];

    self.log(
      'Closed pty (%s): %d.',
      term.pty, term.fd);
  });

  this.log(
    'Created pty (id: %s, master: %d, pid: %d).',
    id, term.fd, term.pid);

  return func(null, {
    id: id,
    pty: term.pty,
    process: sanitize(conf.shell)
  });
};

Session.prototype.handleData = function(id, data) {
  var terms = this.terms;
  if (!terms[id]) {
    this.warning(''
      + 'Client attempting to'
      + ' write to a non-existent terminal.'
      + ' (id: %s)', id);
    return;
  }
  terms[id].write(data);
};

Session.prototype.handleKill = function(id) {
  var terms = this.terms;
  if (!terms[id]) return;
  terms[id].destroy();
  delete terms[id];
};

Session.prototype.handleResize = function(id, cols, rows) {
  var terms = this.terms;
  if (!terms[id]) return;
  terms[id].resize(cols, rows);
};

Session.prototype.handleProcess = function(id, func) {
  var terms = this.terms;
  if (!terms[id]) return;
  var name = terms[id].process;
  return func(null, sanitize(name));
};

Session.prototype.handleDisconnect = function() {
  var self = this;
  var terms = this.terms;
  var req = this.req;
  var sessions = this.server.sessions;

  var key = Object.keys(terms)
    , i = key.length
    , term;

  while (i--) {
    term = terms[key[i]];
    term.destroy();
  }

  if (!this.server.conf.syncSession) {
    if (sessions[req.user]) {
      delete sessions[this.id];
    }
  } else {
    // XXX This could be done differently.
    var timeout = this.server.conf.sessionTimeout || 10 * 60 * 1000;
    setTimeout(function() {
      if (sessions[req.user]) {
        delete sessions[self.id];
      }
    }, timeout);
  }

  this.log('Client disconnected. Killing all pty\'s.');
};

/**
 * Helpers
 */

var slice = Array.prototype.slice;

function sanitize(file) {
  if (!file) return '';
  file = file.split(' ')[0] || '';
  return path.basename(file) || '';
}

function applyConfig() {
  for (var key in Terminal.options) {
    if (!Object.prototype.hasOwnProperty.call(Terminal.options, key)) continue;
    if (key === 'colors') {
      var l = Terminal.options.colors.length
        , i = 0;

      for (; i < l; i++) {
        Terminal.colors[i] = Terminal.options.colors[i];
      }
    } else {
      Terminal[key] = Terminal.options[key];
    }
  }
  delete Terminal.options;
}

/**
 * Expose
 */

exports = Server;
exports.Server = Server;
exports.Session = Session;
exports.config = config;
exports.logger = logger;
exports.createServer = Server;

module.exports = exports;
