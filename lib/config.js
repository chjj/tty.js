var path = require('path')
  , fs = require('fs');

/**
 * Default Config
 */

var schema = {
  auth: {
    username: null,
    password: null
  },
  https: {
    key: null,
    cert: null
  },
  port: 8080,
  term: {}
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
    dir = path.resolve(opt.config, '..');
    json = opt.name;
  } else {
    dir = path.join(home, '.tty.js');
    json = path.join(dir, 'config.json');
  }

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
    ensure(schema, conf);
  } else {
    if (!exists(dir)) {
      fs.mkdirSync(dir, 0700);
    }
    ensure(schema, conf);
    fs.writeFileSync(json, JSON.stringify(conf, null, 2));
    fs.chmodSync(json, 0600);
  }

  merge(opt, conf);

  return conf;
}

/**
 * Parse Arguments
 */

function parseArg() {
  var argv = process.argv.slice()
    , opt = {}
    , arg;

  while (argv.length) {
    arg = argv.shift();
    switch (arg) {
      case '-p':
      case '--port':
        opt.port = +argv.shift();
        break;
      case '-c':
      case '--config':
        opt.config = argv.shift();
        break;
      case '-h':
      case '--help':
        process.exit(1);
      case '--path':
        break;
      case 'production':
      case '--production':
      case '-d':
      case '--daemonize':
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

  var def = /#\s*define\s+([^\s]+)\s+([^\s]+)/g;
  text = text.replace(def, function(__, name, val) {
    defs[name] = val;
    return '';
  });

  text = text.replace(/\w+/g, function(name) {
    return defs[name] || name;
  });

  text.replace(/^[^\s]*\*color(\d+):([^\n]+)/gm, function(__, no, color) {
    if (!colors[no]) colors[no] = color.trim();
  });

  return colors;
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
