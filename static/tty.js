;(function() {

var socket
  , term;

function start() {
  term = new Term(120, 45, handler);
  // term.convertEol = true;

  term.open();
}

function handler(ch) {
  socket.send(ch);
}

start();

//socket = io.connect('https://127.0.0.1:8080', {secure: true});
socket = io.connect('https://' + window.location.hostname + ':8080', {secure: true});

socket.on('connect', function() {
  socket.on('message', function(data) {
    term.write(data);
  });
});

}).call(this);
