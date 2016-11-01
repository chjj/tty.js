#!/usr/bin/env node

/**
 * tty.js
 * Copyright (c) 2012-2014, Christopher Jeffrey (MIT License)
 */

process.title = 'tty.js';

var tty = require('../');

var conf = tty.config.readConfig()
  , app = tty.createServer(conf);

app.listen();
