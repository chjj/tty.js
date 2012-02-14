/**
 * tty.js
 * Copyright (c) 2012, Christopher Jeffrey (MIT License)
 */

;(function() {

/**
 * Elements
 */

var root = this.documentElement
  , body = this.document.body
  , doc = this.document
  , win = this;

/**
 * Terminal
 */

var socket = io.connect()
  , terms = [];

var open = doc.getElementById('open');

open.addEventListener('click', function() {
  requestTerminal();
}, false);

socket.on('connect', function() {
  requestTerminal();
});

socket.on('data', function(data, i) {
  terms[i].write(data);
});

socket.on('kill', function(i) {
  destroyTerminal(terms[i]);
});

function requestTerminal() {
  var i = terms.length;

  var term = new Term(80, 30, function(data) {
    socket.emit('data', data, i);
  });

  term.open();
  term.id = i;

  bindMouse(term, socket);

  terms.push(term);

  socket.emit('create');
}

function destroyTerminal(term) {
  terms[term.id] = null; // don't splice!
  var wrap = term.element.parentNode;
  wrap.parentNode.removeChild(wrap);
}

/**
 * Resize & Drag
 */

function bindMouse(term) {
  var grip
    , el;

  root = doc.documentElement;
  body = doc.body;

  el = document.createElement('div');
  el.className = 'wrapper';

  grip = document.createElement('div');
  grip.className = 'grip';

  el.appendChild(grip);
  el.appendChild(term.element);
  body.appendChild(el);

  term.wrapper = el;
  term.grip = grip;

  grip.addEventListener('mousedown', function(ev) {
    swapIndex(term);

    cancel(ev);

    if (ev.ctrlKey || ev.altKey || ev.metaKey) {
      socket.emit('kill', term.id);
    } else {
      resize(ev, term);
    }
  }, false);

  el.addEventListener('mousedown', function(ev) {
    swapIndex(term);

    if (ev.target !== el) return;

    cancel(ev);

    drag(ev, term);
  }, false);
}

function drag(ev, term) {
  var el = term.wrapper;

  var drag = {
    left: el.offsetLeft,
    top: el.offsetTop,
    x: ev.pageX - el.offsetLeft,
    y: ev.pageY - el.offsetTop,
    pageX: ev.pageX,
    pageY: ev.pageY
  };

  el.style.opacity = '0.60';
  el.style.cursor = 'move';
  root.style.cursor = 'move';

  var move = function(ev) {
    el.style.left =
      (drag.left + ev.pageX - drag.pageX) + 'px';
    el.style.top =
      (drag.top + ev.pageY - drag.pageY) + 'px';
  };

  var up = function(ev) {
    el.style.opacity = '';
    el.style.cursor = '';
    root.style.cursor = '';

    doc.removeEventListener('mousemove', move, false);
    doc.removeEventListener('mouseup', up, false);
  };

  doc.addEventListener('mousemove', move, false);
  doc.addEventListener('mouseup', up, false);
}

function resize(ev, term) {
  var el = term.wrapper;

  var resize = {
    x: ev.pageX,
    y: ev.pageY
  };

  el.style.overflow = 'hidden';
  el.style.opacity = '0.70';
  el.style.cursor = 'se-resize';
  root.style.cursor = 'se-resize';

  var move = function(ev) {
    var x, y;
    x = ev.pageX - el.offsetLeft;
    y = ev.pageY - el.offsetTop;
    el.style.width = x + 'px';
    el.style.height = y + 'px';
  };

  var up = function(ev) {
    var x, y;

    x = ev.pageX - resize.x + term.element.offsetWidth;
    y = ev.pageY - resize.y + term.element.offsetHeight;
    x = x / term.element.offsetWidth;
    y = y / term.element.offsetHeight;
    x = (x * term.cols) | 0;
    y = (y * term.rows) | 0;

    socket.emit('resize', x, y, term.id);
    term.resize(x, y);

    el.style.width = '';
    el.style.height = '';

    el.style.overflow = '';
    el.style.opacity = '';
    el.style.cursor = '';
    root.style.cursor = '';

    doc.removeEventListener('mousemove', move, false);
    doc.removeEventListener('mouseup', up, false);
  };

  doc.addEventListener('mousemove', move, false);
  doc.addEventListener('mouseup', up, false);
}

function swapIndex(term) {
  var el = term.wrapper;

  // focus the terminal
  term.focus();

  el.style.zIndex = '1000';

  var e = document.getElementsByTagName('div')
    , i = e.length;

  while (i--) {
    if (e[i].className === 'wrapper'
        && e[i] !== el) e[i].style.zIndex = '0';
  }
}

function cancel(ev) {
  if (ev.preventDefault) ev.preventDefault();
  ev.returnValue = false;
  if (ev.stopPropagation) ev.stopPropagation();
  ev.cancelBubble = true;
  return false;
}

}).call(this);
