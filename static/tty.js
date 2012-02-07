;(function() {

var socket
  , term;

function start() {
  term = new Term(80, 30, handler);
  // term.convertEol = true;

  term.open();
}

function handler(ch) {
  socket.send(ch);
}

start();

socket = io.connect('http://127.0.0.1:8080');

socket.on('connect', function() {
  socket.on('message', function(data) {
    term.write(data);
  });
});

}).call(this);
