/**
 * tty.js
 * Copyright (c) 2012, Christopher Jeffrey (MIT License)
 */

/**
 * Modules
 */

var path = require('path')
  , fs = require('fs')
  , EventEmitter = require('events').EventEmitter;

var express = require('express')
  , io = require('socket.io')
  , pty = require('pty.js');

var config = require('./config');

/**
 * Server
 */

function Server(conf) {
  conf = config.checkConfig(conf);

  var self = conf.https && conf.https.key
    ? express.createServer(conf.https)
    : express.createServer();

  // We can't inherit from express
  // javascript-style, so we need to
  // do it this way...
  Object.keys(Server.prototype).forEach(function(key) {
    self[key] = Server.prototype[key];
  });

  self.sessions = {};
  self.conf = conf;
  self._auth = self._basicAuth();
  self.io = io.listen(self, {
    log: false
  });

  self.init();

  return self;
}

Server.createServer = Server;

Server.prototype.init = function() {
  this.init = function() {};
  this.initMiddleware();
  this.initRoutes();
  this.initIO();
};

Server.prototype.initMiddleware = function() {
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

  this.use(this._auth);

  if (conf.static) {
    this.use(express.static(conf.static));
  }

  // var icon = conf.static + '/favicon.ico';
  // if (!conf.static || !path.existsSync(icon)) {
  //   icon = __dirname + '/../static/favicon.ico';
  // }
  // this.use(express.favicon(icon));

  // If there is a custom favicon in the custom
  // static directory, this will be ignored.
  this.use(express.favicon(__dirname + '/../static/favicon.ico'));

  this.use(this.router);

  this.use(express.static(__dirname + '/../static'));
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
  data.__proto__ = EventEmitter.prototype;
  this._auth(data, null, function(err) {
    data.user = data.remoteUser || data.user;
    return !err
      ? next(null, true)
      : next(err);
  });
};

Server.prototype.handleConnection = function(socket) {
  var session = new Session(this, socket);

  //this.sessions[session.id] = session;
  //this.sessions.push(session);

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
    //delete sessions[session.id];
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

  if (conf.hooks && conf.hooks.auth) {
    return express.basicAuth(conf.hooks.auth);
  }

  var crypto = require('crypto')
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
    var user = sha1(user)
      , password;

    if (!Object.hasOwnProperty.call(conf.users, user)) {
      return next();
    }

    password = conf.users[user];

    next(null, sha1(pass) === password);
  }

  // Hash everything for consistency.
  Object.keys(conf.users).forEach(function(name) {
    if (!saidWarning && !hashed(conf.users[name])) {
      self.log('Warning: You should sha1 your usernames/passwords.');
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

  return express.basicAuth(verify);
};

Server.prototype.log = function() {
  if (this.conf.log === false) return;
  var args = Array.prototype.slice.call(arguments);
  args[0] = 'tty.js: ' + args[0];
  console.log.apply(console, args);
};

Server.prototype.error = function() {
  if (this.conf.log === false) return;
  var args = Array.prototype.slice.call(arguments);
  args[0] = 'tty.js: ' + args[0];
  console.error.apply(console, args);
};

Server.prototype._listen = express.createServer().listen;
Server.prototype.listen = function(port, hostname, func) {
  return this._listen(
    port || this.conf.port || 8080,
    hostname || this.conf.hostname,
    func);
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

  this.id = req.user || Math.random() + '';

  // Kill older session.
  if (conf.sessions && conf.users) {
    if (sessions[this.id]) {
      try {
        sessions[this.id].socket.disconnect();
      } catch (e) {
        ;
      }
    }
    sessions[this.id] = session;
  }
}

Session.prototype.log = function() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = 'Session [' + this.id + ']: ' + args[0];
  return this.server.log.apply(this.server, arguments);
};

Session.prototype.error = function() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = 'Session [' + this.id + ']: ' + args[0];
  return this.server.log.apply(this.server, arguments);
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
    return func('Terminal limit.');
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
    // make sure it closes
    // on the clientside
    socket.emit('kill', id);

    // ensure removal
    if (terms[id]) delete terms[id];

    self.log(
      'Closed pty (%s): %d.',
      term.pty, term.fd);
  });

  this.log(''
    + 'Created shell with pty (%s) master/slave'
    + ' pair (master: %d, pid: %d)',
    term.pty, term.fd, term.pid);

  return func(null, {
    id: id,
    pty: term.pty,
    process: sanitize(conf.shell)
  });
};

Session.prototype.handleData = function(id, data) {
  var terms = this.terms;
  if (!terms[id]) {
    this.error(''
      + 'Warning: Client attempting to'
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

  if (sessions[req.user]) delete sessions[this.id];

  this.log('Client disconnected. Killing all pty\'s...');
};

/**
 * Helpers
 */

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
exports.config = config;
module.exports = exports;
