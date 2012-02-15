var path = require('path')
  , fs = require('fs');

/**
 * Read Config
 */

function readConfig(name) {
  var home = process.env.HOME
    , conf = {}
    , dir
    , json;

  parseArg(conf);

  if (conf.name) {
    conf.name = path.resolve(process.cwd(), conf.name);
    dir = path.resolve(conf.name, '..');
    json = conf.name;
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
      port: conf.port || 8080
    };
    fs.writeFileSync(json, JSON.stringify(conf, null, 2));
    fs.chmodSync(json, 0600);
  }

  return conf;
}

/**
 * Parse Arguments
 */

function parseArg(conf) {
  var argv = process.argv.slice()
    , other = []
    , arg;

  while (argv.length) {
    arg = argv.shift();
    switch (arg) {
      case '-p':
      case '--port':
        conf.port = +argv.shift();
        break;
      case '-c':
      case '--config':
        conf.name = argv.shift();
        break;
      case '-h':
      case '--help':
        process.exit(1);
      case '--path':
      default:
        other.push(argv.shift());
        break;
    }
  }
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

/**
 * Expose
 */

module.exports = readConfig();
