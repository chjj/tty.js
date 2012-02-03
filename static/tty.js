;(function() {

var term;

function start() {
  term = new Term(80, 30, handler);
  // term.convert_lf_to_crlf = true;
  // term.convertEol = true;

  term.open();
}

function handler(ch) {
  // console.log(JSON.stringify(ch));
  socket.send(ch);
}

start();

var socket = io.connect('http://127.0.0.1:8080');
socket.on('connect', function() {
  socket.on('message', function(data) {
    term.write(data);
    // console.log(data);
  });
});

}).call(this);
