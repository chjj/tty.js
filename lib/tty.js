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

var conf = readConfig();

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

app.use(express.static(__dirname + '/../static'));

app.listen(conf.port || 8080);

/**
 * Sockets
 */

io = io.listen(app);

io.configure(function() {
  io.disable('log');
});

io.sockets.on('connection', function(socket) {
  var terms = [];

  // placeholder for sending
  // clientside configuration
  socket.emit('config', conf.term);

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
    console.log('Killed pty: %d.', terms[id].fd);
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
    console.log('Client disconnected. Killed all pty\'s.');
  });
});

/**
 * Read Config
 */

function readConfig() {
  var home = process.env.HOME
    , dir = path.join(home, '.tty.js')
    , json = path.join(dir, 'config.json')
    , conf;

  if (exists(dir) && exists(json)) {
    if (!fs.statSync(dir).isDirectory()) {
      json = dir;
      dir = home;
    }
    conf = JSON.parse(fs.readFileSync(json, 'utf8'));
    if (conf.https && conf.https.key && !conf.https.disabled) {
      conf.https.key = fs.readFileSync(path.resolve(dir, conf.https.key));
      conf.https.cert = fs.readFileSync(path.resolve(dir, conf.https.cert));
    }
  } else {
    if (!exists(dir)) {
      fs.mkdirSync(dir, 0700);
    }
    conf = {
      auth: {
        username: null,
        password: null
      },
      https: {
        key: null,
        cert: null
      },
      port: 8080
    };
    fs.writeFileSync(json, JSON.stringify(conf, null, 2));
    fs.chmodSync(json, 0600);
  }

  return conf;
}

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

/**
 * Helpers
 */

function exists(file) {
  try {
    fs.statSync(file);
    return true;
  } catch(e) {
    return false;
  }
}
