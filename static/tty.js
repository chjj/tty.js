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
  , terms
  , conf;

function open() {
  if (socket) return;

  root = doc.documentElement;
  body = doc.body;

  bindGlobal();

  socket = io.connect();
  terms = [];
  conf = {};

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

  socket.on('config', function(conf_) {
    if (!conf_) return;

    conf = conf_;

    var i = terms.length;
    while (i--) {
      if (terms[i]) applyConfig(terms[i]);
    }
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
}

function applyConfig(term) {
  if (term._configApplied) return;
  term._configApplied = true;

  if (conf.fgColors && conf.fgColors.length === 8) {
    term.fgColors = conf.fgColors;
  }

  if (conf.bgColors && conf.bgColors.length === 8) {
    term.bgColors = conf.bgColors;
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
        && ((!this.isMac && ev.altKey)
        || (this.isMac && ev.metaKey))) {
      var i = Terminal.focus.id;

      for (i++; i < terms.length; i++) {
        if (terms[i]) return focus_(terms[i]);
      }

      for (i = 0; i < terms.length; i++) {
        if (terms[i]) return focus_(terms[i]);
      }

      return cancel(ev);
    }
    return kd.call(this, ev);
  };

  function focus_(term) {
    term.wrapper.style.borderColor = 'orange';
    setTimeout(function() {
      term.wrapper.style.borderColor = '';
    }, 200);
    focus(term);
  }
}

function bindMouse(term) {
  var grip
    , el;

  el = document.createElement('div');
  el.className = 'wrapper';

  grip = document.createElement('div');
  grip.className = 'grip';

  el.appendChild(grip);
  el.appendChild(term.element);
  body.appendChild(el);

  term.wrapper = el;
  term.grip = grip;

  on(grip, 'mousedown', function(ev) {
    focus(term);

    cancel(ev);

    if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey) {
      socket.emit('kill', term.id);
      destroyTerminal(term);
    } else {
      resize(ev, term);
    }
  });

  on(el, 'mousedown', function(ev) {
    focus(term);

    if (ev.target !== el) return;

    cancel(ev);

    drag(ev, term);
  });
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

    off(doc, 'mousemove', move);
    off(doc, 'mouseup', up);
  };

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

  var move = function(ev) {
    var x, y;
    x = ev.pageX - el.offsetLeft;
    y = ev.pageY - el.offsetTop;
    el.style.width = x + 'px';
    el.style.height = y + 'px';
  };

  var up = function(ev) {
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

    off(doc, 'mousemove', move);
    off(doc, 'mouseup', up);
  };

  on(doc, 'mousemove', move);
  on(doc, 'mouseup', up);
}

function focus(term) {
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

/**
 * Helpers
 */

function on(el, type, handler) {
  el.addEventListener(type, handler, false);
}

function off(el, type, handler) {
  el.removeEventListener(type, handler, false);
}

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
