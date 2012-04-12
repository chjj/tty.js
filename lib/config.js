/**
 * tty.js: config.js
 * Copyright (c) 2012, Christopher Jeffrey (MIT License)
 */

var path = require('path')
  , fs = require('fs');

/**
 * Default Config
 */

var schema = {
  users: {},
  https: {
    key: null,
    cert: null
  },
  port: 8080,
  // hostname: '0.0.0.0',
  // shell: 'sh',
  // shellArgs: ['arg1', 'arg2'],
  // static: './static',
  // limitGlobal: 10000,
  // limitPerUser: 1000,
  // hooks: './hooks.js',
  // cwd: '.',
  term: {
    // termName: 'xterm',
    // geometry: [80, 30],
    // visualBell: false,
    // popOnBell: false,
    // cursorBlink: true,
    // scrollback: 1000,
    // screenKeys: false,
    // colors: [],
    // programFeatures: false,
    // debug: false
  }
};

/**
 * Read Config
 */

function readConfig(name) {
  var home = process.env.HOME
    , conf = {}
    , opt
    , dir
    , json;

  opt = parseArg();

  if (opt.config) {
    opt.config = path.resolve(process.cwd(), opt.config);
    dir = path.dirname(opt.config);
    json = opt.config;
  } else {
    dir = path.join(home, '.tty.js');
    json = path.join(dir, 'config.json');
  }

  if (exists(dir) && exists(json)) {
    if (!fs.statSync(dir).isDirectory()) {
      json = dir;
      dir = home;
      tryRead = function() {};
    }

    // read conf
    conf = JSON.parse(fs.readFileSync(json, 'utf8'));

    // ensure schema
    ensure(schema, conf);
  } else {
    if (!exists(dir)) {
      fs.mkdirSync(dir, 0700);
    }

    // ensure schema
    ensure(schema, conf);

    fs.writeFileSync(json, JSON.stringify(conf, null, 2));
    fs.chmodSync(json, 0600);
  }

  // expose paths
  conf.dir = dir;
  conf.json = json;

  // merge options
  merge(opt, conf);

  // check legacy features
  checkLegacy(conf);

  // key and cert
  conf.https = {
    key: tryRead(dir, 'server.key'),
    cert: tryRead(dir, 'server.crt')
  };

  // shell, process name
  if (conf.shell && ~conf.shell.indexOf('/')) {
    conf.shell = path.resolve(dir, conf.shell);
  }

  // static directory
  conf.static = tryResolve(dir, 'static');

  // Path to shell, or the process to execute in the terminal.
  conf.shell = conf.shell || process.env.SHELL || 'sh';

  // Arguments to shell, if they exist
  conf.shellArgs = conf.shellArgs || [];

  // $TERM
  conf.term.termName = conf.termName || conf.term.termName;
  if (!conf.term.termName) {
    // tput -Txterm-256color longname
    conf.term.termName = exists('/usr/share/terminfo/x/xterm+256color')
      ? 'xterm-256color'
      : 'xterm';
  }
  conf.termName = conf.term.termName;

  // limits
  conf.limitPerUser = conf.limitPerUser || Infinity;
  conf.limitGlobal = conf.limitGlobal || Infinity;

  // users
  if (conf.users && !Object.keys(conf.users).length) delete conf.users;

  // hooks
  conf.hooks = tryRequire(dir, 'hooks.js');

  // cwd
  if (conf.cwd) {
    conf.cwd = path.resolve(dir, conf.cwd);
  }

  return conf;
}

/**
 * Check Legacy
 */

function checkLegacy(conf) {
  var out = [];

  if (conf.auth) {
    if (conf.auth && conf.auth.username && !conf.auth.disabled) {
      conf.users[conf.auth.username] = conf.auth.password;
    }
    // out.push('`auth` is deprecated, please use `users` instead.');
    console.error('`auth` is deprecated, please use `users` instead.');
  }

  if (conf.https && conf.https.key) {
    conf.https = {
      key: tryRead(conf.dir, conf.https.key),
      cert: tryRead(conf.dir, conf.https.cert)
    };
    // out.push(''
    //   + '`https` is deprecated, pleased include '
    //   + '`~/.tty.js/server.crt`, and `~/.tty.js/server.key` instead.');
  }

  if (conf.userScript) {
    out.push(''
      + '`userScript` is deprecated, please place '
      + '`user.js` in `~/.tty.js/static/user.js` instead.');
  }

  if (conf.userStylesheet) {
    out.push(''
      + '`userStylesheet` is deprecated, please '
      + 'place `user.js` in `~/.tty.js/static/user.js` instead.');
  }

  if (conf.stylesheet) {
    out.push(''
      + '`stylesheet` is deprecated, please place '
      + '`user.css` in `~/.tty.js/static/user.css` instead.');
  }

  if (conf.static) {
    conf.static = tryResolve(conf.dir, conf.static);
    // out.push(''
    //   + '`static` is deprecated, please place a '
    //   + 'directory called `static` in `~/.tty.js` instead.');
  }

  if (conf.hooks) {
    conf.hooks = tryRequire(conf.dir, conf.hooks);
    // out.push(''
    //   + '`hooks` is deprecated, please place '
    //   + '`hooks.js` in `~/.tty.js/hooks.js` instead.');
  }

  if (out.length) {
    out = out.join('\n');
    console.error(out);
    console.error('Exiting...');
    process.exit(1);
  }
}

/**
 * Daemonize
 */

function daemonize() {
  if (process.env.IS_DAEMONIC) return;

  var argv = process.argv.slice()
    , spawn = require('child_process').spawn
    , code;

  argv = argv.map(function(arg) {
    arg = arg.replace(/(["$\\])/g, '\\$1');
    return '"' + arg + '"';
  }).join(' ');

  code = '(IS_DAEMONIC=1 setsid ' + argv + ' > /dev/null 2>& 1 &)';
  spawn('/bin/sh', [ '-c', code ]).on('exit', function(code) {
    process.exit(code || 0);
  });

  process.once('uncaughtException', function() {});
  throw 'stop';
}

/**
 * Help
 */

function help() {
  var spawn = require('child_process').spawn;

  var options = {
    cwd: process.cwd(),
    env: process.env,
    setsid: false,
    customFds: [0, 1, 2]
  };

  spawn('man',
    [__dirname + '/../man/tty.js.1'],
    options);

  // kill current stack
  process.once('uncaughtException', function() {});
  throw 'stop';
}

/**
 * Parse Arguments
 */

function parseArg() {
  var argv = process.argv.slice()
    , opt = {}
    , arg;

  function getarg() {
    var arg = argv.shift();
    if (arg && arg.indexOf('--') === 0) {
      arg = arg.split('=');
      if (arg.length > 1) {
        argv.unshift(arg.slice(1).join('='));
      }
      return arg[0];
    }
    return arg;
  }

  while (argv.length) {
    arg = getarg();
    switch (arg) {
      case '-p':
      case '--port':
        opt.port = +argv.shift();
        break;
      case '-c':
      case '--config':
        opt.config = argv.shift();
        break;
      case '--path':
        break;
      case '-h':
      case '--help':
        help();
        break;
      case 'production':
      case '--production':
      case '-d':
      case '--daemonize':
        daemonize();
        break;
      default:
        break;
    }
  }

  return opt;
}

/**
 * Xresources
 */

function readResources() {
  var home = process.env.HOME
    , colors = []
    , defs = {}
    , text;

  try {
    text = fs.readFileSync(path.join(home, '.Xresources'), 'utf8');
  } catch(e) {
    return colors;
  }

  var def = /#\s*define\s+((?:[^\s]|\\\s)+)\s+((?:[^\n]|\\\n)+)/g;
  text = text.replace(def, function(__, name, val) {
    name = name.replace(/\\\s/g, '');
    defs[name] = val.replace(/\\\n/g, '');
    return '';
  });

  text = text.replace(/[^\s]+/g, function(name) {
    return defs[name] || name;
  });

  var color = /(?:^|\n)[^\s]*(?:\*|\.)color(\d+):([^\n]+)/g;
  text.replace(color, function(__, no, color) {
    if (!colors[no]) colors[no] = color.trim();
  });

  return colors;
}

/**
 * Helpers
 */

function tryRequire() {
  try {
    return require(path.resolve.apply(path, arguments));
  } catch (e) {
    ;
  }
}

function tryResolve() {
  var file = path.resolve.apply(path, arguments);
  if (exists(file)) return file;
}

function tryRead() {
  try {
    var file = path.resolve.apply(path, arguments);
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    ;
  }
}

function exists(file) {
  try {
    fs.statSync(file);
    return true;
  } catch (e) {
    return false;
  }
}

function merge(i, o) {
  Object.keys(i).forEach(function(key) {
    o[key] = i[key];
  });
}

function ensure(i, o) {
  Object.keys(i).forEach(function(key) {
    if (!o[key]) o[key] = i[key];
  });
}

/**
 * Expose
 */

module.exports = readConfig();
