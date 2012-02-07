/**
 * tty.js
 */

process.title = 'tty.js';

/**
 * Modules
 */

var fs = require('fs')
, express = require('express')
, io = require('socket.io');

var pty = require('../build/Release/pty.node');

/**
 * Paramaters
 */

var shellPath = process.env.SHELL || 'sh';
var termName = 'linux';

/**
 * Terminal
 */

var Terminal = function(process, name, cols, rows) {
    process = process || 'sh';
    name = name || 'vt100';
    cols = cols || 80;
    rows = rows || 30;

    var term = pty.forkPty(process, name, cols, rows);

    this.input = fs.createWriteStream(null, { fd: term.fd });
    this.output = fs.createReadStream(null, { fd: term.fd });

    this.output.setEncoding('utf8');
    this.output._read();

    this.pid = term.pid;
    this.fd = term.fd;
};

Terminal.prototype.write = function(data) {
    return this.input.write(data);
};

Terminal.prototype.pipe = function(dest, options) {
    return this.output.pipe(dest, options);
};

Terminal.prototype.on = function(type, func) {
    this.output.on(type, func);
    return this;
};

Terminal.prototype.destroy = function() {
    var self = this;

    this.input.writable = false;
    this.write = function() {};
    this.writable = false;

    // Need to close the read stream so
    // node stops reading a dead file descriptor.
    // Then we can safely SIGINT the shell
    // or whatever process was in the terminal.
    // SIGKILL makes libuv throw an UNKNOWN error.
    this.output.on('close', function() {
        console.log('terming ' + self.pid);
        process.kill(self.pid, 'SIGINT');
    });

    this.output.destroy();
};


/**
 * Open Terminal & Fork Shell
 */
/*
var buff = []
, socket
    , term;

    term = new Terminal(shellPath, termName, 120, 45);
term.on('data', outputHandler);

console.log(''
            + 'Created shell with pty master/slave'
            + ' pair (master: %d, pid: %d)',
            term.fd, term.pid);

function outputHandler(data) {
    if (!socket) {
        buff.push(data);
    } else {
        socket.send(data);
    }
}
*/

var pam_auth = require('pam-auth');

/**
 * App
 */


var options = {
 key: fs.readFileSync('./privatekey.pem'),
 cert: fs.readFileSync('./certificate.pem')
};

var app = express.createServer(options);

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

app.use(pam_auth('ttyjs'));
app.use(express.static(__dirname + '/../static'));

app.listen(8080);

/**
 * Sockets
 */

io = io.listen(app);

io.configure(function() {
    io.disable('log');
});

io.sockets.on('connection', function(sock) {
    var buff = []
    , socket
    , term;
    socket = sock;

    term = new Terminal(shellPath, termName, 80, 30);
    term.on('data', outputHandler);

    console.log(''
                + 'Created shell with pty master/slave'
                + ' pair (master: %d, pid: %d)',
                term.fd, term.pid);

    function outputHandler(data) {
        if (!socket) {
            buff.push(data);
        } else {
            socket.send(data);
        }
    }

    socket.on('message', function(data) {
        term.write(data);
    });

    socket.on('disconnect', function() {
        term.destroy();
    });

    while (buff.length) {
        outputHandler(buff.shift());
    }
});
