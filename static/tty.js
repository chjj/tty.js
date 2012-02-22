/**
 * tty.js
 * Copyright (c) 2012, Christopher Jeffrey (MIT License)
 */

;(function() {

/**
 * Elements
 */

var doc = this.document
  , win = this
  , root
  , body;

/**
 * Open
 */

var socket
  , terms;

function open() {
  if (socket) return;

  root = doc.documentElement;
  body = doc.body;

  bindGlobal();

  socket = io.connect();
  terms = [];

  var open = doc.getElementById('open')
    , lights = doc.getElementById('lights');

  on(open, 'click', function() {
    requestTerminal();
  });

  on(lights, 'click', function() {
    root.className = !root.className
      ? 'dark'
      : '';
  });

  socket.on('connect', function() {
    requestTerminal();
  });

  socket.on('data', function(data, id) {
    terms[id].write(data);
  });

  socket.on('kill', function(id) {
    destroyTerminal(terms[id]);
  });
}

/**
 * Terminal
 */

function requestTerminal() {
  var id = terms.length;

  var term = new Terminal(80, 30, function(data) {
    socket.emit('data', data, id);
  });

  term.open();
  term.id = id;

  bindMouse(term);

  terms.push(term);

  socket.emit('create');
}

function destroyTerminal(term) {
  if (!term) return;
  terms[term.id] = null; // don't splice!
  var wrap = term.element.parentNode;
  wrap.parentNode.removeChild(wrap);
  if (Terminal.focus === term) {
    var i = terms.length;
    while (i--) {
      if (terms[i]) return terms[i].focus();
    }
  }
}

/**
 * Window Behavior
 */

function bindGlobal() {
  // Alt-` to quickly swap between terminals.
  var kd = Terminal.prototype.keyDownHandler;
  Terminal.prototype.keyDownHandler = function(ev) {
    if (ev.keyCode === 192
        && ((!isMac && ev.altKey)
        || (isMac && ev.metaKey))) {
      var i = Terminal.focus.id;

      for (i++; i < terms.length; i++) {
        if (terms[i]) return focus_(terms[i], ev);
      }

      for (i = 0; i < terms.length; i++) {
        if (terms[i]) return focus_(terms[i], ev);
      }

      return focus_(Terminal.focus, ev);
    }
    return kd.call(this, ev);
  };

  function focus_(term, ev) {
    term.wrapper.style.borderColor = 'orange';
    setTimeout(function() {
      term.wrapper.style.borderColor = '';
    }, 200);
    term.focus();
    cancel(ev);
  }
}

function bindMouse(term) {
  var grip
    , el;

  el = document.createElement('div');
  el.className = 'wrapper';

  grip = document.createElement('div');
  grip.className = 'grip';

  el.appendChild(term.element);
  el.appendChild(grip);
  body.appendChild(el);

  term.wrapper = el;
  term.grip = grip;

  on(grip, 'mousedown', function(ev) {
    term.focus();

    cancel(ev);

    if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey) {
      socket.emit('kill', term.id);
      destroyTerminal(term);
    } else {
      resize(ev, term);
    }
  });

  on(el, 'mousedown', function(ev) {
    if (ev.target !== el) return;

    term.focus();

    cancel(ev);

    drag(ev, term);
  });
}

function drag(ev, term) {
  var el = term.wrapper;

  var drag = {
    left: el.offsetLeft,
    top: el.offsetTop,
    pageX: ev.pageX,
    pageY: ev.pageY
  };

  el.style.opacity = '0.60';
  el.style.cursor = 'move';
  root.style.cursor = 'move';

  function move(ev) {
    el.style.left =
      (drag.left + ev.pageX - drag.pageX) + 'px';
    el.style.top =
      (drag.top + ev.pageY - drag.pageY) + 'px';
  }

  function up(ev) {
    el.style.opacity = '';
    el.style.cursor = '';
    root.style.cursor = '';

    off(doc, 'mousemove', move);
    off(doc, 'mouseup', up);
  }

  on(doc, 'mousemove', move);
  on(doc, 'mouseup', up);
}

function resize(ev, term) {
  var el = term.wrapper;

  var resize = {
    w: el.offsetWidth,
    h: el.offsetHeight
  };

  el.style.overflow = 'hidden';
  el.style.opacity = '0.70';
  el.style.cursor = 'se-resize';
  root.style.cursor = 'se-resize';
  term.element.style.height = '100%';

  function move(ev) {
    var x, y;
    x = ev.pageX - el.offsetLeft;
    y = ev.pageY - el.offsetTop;
    el.style.width = x + 'px';
    el.style.height = y + 'px';
  }

  function up(ev) {
    var x, y;

    x = el.offsetWidth / resize.w;
    y = el.offsetHeight / resize.h;
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
    term.element.style.height = '';

    off(doc, 'mousemove', move);
    off(doc, 'mouseup', up);
  }

  on(doc, 'mousemove', move);
  on(doc, 'mouseup', up);
}

var focus_ = Terminal.prototype.focus;
Terminal.prototype.focus = function() {
  if (Terminal.focus === this) return;

  if (this.wrapper) {
    var i = terms.length;
    while (i--) {
      if (!terms[i]) continue;
      terms[i].wrapper.style.zIndex = terms[i] === this
        ? '1000'
        : '0';
    }
  }

  return focus_.call(this);
};

/**
 * Helpers
 */

function on(el, type, handler, capture) {
  el.addEventListener(type, handler, capture || false);
}

function off(el, type, handler, capture) {
  el.removeEventListener(type, handler, capture || false);
}

function cancel(ev) {
  if (ev.preventDefault) ev.preventDefault();
  ev.returnValue = false;
  if (ev.stopPropagation) ev.stopPropagation();
  ev.cancelBubble = true;
  return false;
}

var isMac = ~navigator.userAgent.indexOf('Mac');

/**
 * Load
 */

function load() {
  off(doc, 'load', load);
  off(doc, 'DOMContentLoaded', load);
  open();
}

on(doc, 'load', load);
on(doc, 'DOMContentLoaded', load);
setTimeout(load, 200);

}).call(this);
