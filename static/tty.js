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

  socket = io.connect();
  terms = [];

  var open = doc.getElementById('open')
    , lights = doc.getElementById('lights');

  on(open, 'click', function() {
    new Window();
  });

  on(lights, 'click', function() {
    root.className = !root.className
      ? 'dark'
      : '';
  });

  socket.on('connect', function() {
    new Window();
  });

  socket.on('data', function(data, id) {
    terms[id].write(data);
  });

  socket.on('kill', function(id) {
    if (!terms[id]) return;
    terms[id].destroy();
  });
}

/**
 * Window
 */

var dummy = document.createElement('div');

var windows = [];

function Window() {
  var self = this;

  var bar
    , grip
    , el;

  el = document.createElement('div');
  el.className = 'window';

  grip = document.createElement('div');
  grip.className = 'grip';

  bar = document.createElement('div');
  bar.className = 'bar';

  this.element = el;
  this.grip = grip;
  this.bar = bar;
  this.tabs = [];
  this.focused = null;

  this.cols = 80;
  this.rows = 30;

  el.appendChild(grip);
  el.appendChild(bar);
  body.appendChild(el);

  var button = document.createElement('div');
  button.className = 'tab';
  button.innerHTML = '~';
  on(button, 'click', function(ev) {
    self.createTab();
  });
  this.bar.appendChild(button);

  windows.push(this);

  this.createTab();
  this.focus();
  this.bind();
}

Window.prototype.bind = function() {
  var self = this
    , el = this.element
    , bar = this.bar
    , grip = this.grip
    , last = 0;

  on(grip, 'mousedown', function(ev) {
    self.focus();

    cancel(ev);

    if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey) {
      self.destroy();
    } else {
      self.resizing(ev);
    }
  });

  on(el, 'mousedown', function(ev) {
    if (ev.target !== el && ev.target !== bar) return;

    self.focus();

    cancel(ev);

    if (new Date - last < 600) {
      return self.maximize();
    }
    last = new Date;

    self.drag(ev);
  });
};

Window.prototype.focus = function() {
  var i = windows.length;
  while (i--) {
    windows[i].element.style.zIndex = windows[i] === this
      ? '1000'
      : '0';
  }

  this.focused.focus();
};

Window.prototype.destroy = function() {
  if (this.destroyed) return;
  this.destroyed = true;

  if (this.minimize) this.minimize();

  splice(windows, this);
  if (windows.length) windows[0].focus();

  this.element.parentNode.removeChild(this.element);

  this.each(function(term) {
    term.kill();
  });
};

Window.prototype.drag = function(ev) {
  var el = this.element;

  if (this.minimize) return;

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
};

Window.prototype.resizing = function(ev) {
  var self = this
    , el = this.element
    , term = this.focused;

  if (this.minimize) delete this.minimize;

  var resize = {
    w: el.clientWidth,
    h: el.clientHeight
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
    y -= 15;
    el.style.width = x + 'px';
    el.style.height = y + 'px';
  }

  function up(ev) {
    var x, y;

    x = el.clientWidth / resize.w;
    y = el.clientHeight / resize.h;
    x = (x * term.cols) | 0;
    y = (y * term.rows) | 0;

    self.resize(x, y);

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
};

Window.prototype.maximize = function() {
  if (this.minimize) return this.minimize();

  var self = this
    , el = this.element
    , term = this.focused
    , x
    , y;

  var m = {
    cols: term.cols,
    rows: term.rows,
    left: el.offsetLeft,
    top: el.offsetTop,
    root: root.className
  };

  this.minimize = function() {
    delete this.minimize;

    el.style.left = m.left + 'px';
    el.style.top = m.top + 'px';
    el.style.width = '';
    el.style.height = '';
    el.style.boxSizing = '';
    self.grip.style.display = '';
    root.className = m.root;

    self.resize(m.cols, m.rows);
  };


  x = el.offsetWidth - term.element.clientWidth;
  y = el.offsetHeight - term.element.clientHeight;
  x = (root.clientWidth - x) / term.element.clientWidth;
  y = (root.clientHeight - y) / term.element.clientHeight;
  x = (x * term.cols) | 0;
  y = (y * term.rows) | 0;

  el.style.left = '0px';
  el.style.top = '0px';
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.boxSizing = 'border-box';
  this.grip.style.display = 'none';
  root.className = 'maximized';

  this.resize(x, y);
};

Window.prototype.resize = function(cols, rows) {
  this.cols = cols;
  this.rows = rows;
  this.each(function(term) {
    socket.emit('resize', cols, rows, term.id);
    term.resize(cols, rows);
  });
};

Window.prototype.each = function(func) {
  var i = this.tabs.length;
  while (i--) {
    if (this.tabs[i]) func(this.tabs[i], i);
  }
};

Window.prototype.createTab = function() {
  new Tab(this);
};

/**
 * Tab
 */

function Tab(win) {
  var self = this;

  var id = terms.length
    , cols = win.cols
    , rows = win.rows;

  Terminal.call(this, cols, rows, function(data) {
    socket.emit('data', data, id);
  });

  var button = document.createElement('div');
  button.className = 'tab';
  button.innerHTML = '\u2022';
  win.bar.appendChild(button);

  on(button, 'click', function(ev) {
    if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey) {
      self.kill();
    } else {
      self.focus();
    }
    return cancel(ev);
  });

  this.id = id;
  this.window = win;
  this.button = button;
  this.element = null;
  this.open();

  win.tabs.push(this);
  terms.push(this);

  socket.emit('create', cols, rows);
};

inherits(Tab, Terminal);

Tab.prototype.focus = function() {
  if (Terminal.focus === this) return;

  var win = this.window;

  // maybe move to Tab.prototype.switch
  if (win.focused !== this) {
    if (win.focused) {
      dummy.appendChild(win.focused.element);
      win.focused.button.style.fontWeight = '';
    }

    win.element.appendChild(this.element);
    win.focused = this;

    this.button.style.fontWeight = 'bold';
  }

  Terminal.prototype.focus.call(this);

  win.focus();
};

Tab.prototype.destroy = function() {
  if (this.destroyed) return;
  this.destroyed = true;

  var win = this.window;

  this.button.parentNode.removeChild(this.button);
  this.element.parentNode.removeChild(this.element);

  terms[this.id] = null; // don't splice!
  splice(win.tabs, this);

  if (this.window.focused === this) {
    var i = win.tabs.length;
    while (i--) {
      if (win.tabs[i]) return win.tabs[i].focus();
    }
  }

  if (!win.tabs.length) {
    this.window.destroy();
  }
};

Tab.prototype.kill = function() {
  if (this.destroyed) return;
  socket.emit('kill', this.id);
  this.destroy();
};

Tab.prototype.keyDownHandler = function(ev) {
  if (this.pendingKey) {
    this.pendingKey = false;
    return this.specialKeyHandler(ev);
  }

  //if (Terminal.specialKey && ev.ctrlKey && ev.keyCode === 65) {
  if (ev.ctrlKey && ev.keyCode === 65) {
    this.pendingKey = true;
    return cancel(ev);
  }

  // Alt-` to quickly swap between terminals.
  if (ev.keyCode === 192
      && ((!isMac && ev.altKey)
      || (isMac && ev.metaKey))) {
    var i = indexOf(windows, this.window)
      , l = windows.length;

    cancel(ev);

    for (i++; i < l; i++) {
      if (windows[i]) return focus_(windows[i], ev);
    }

    for (i = 0; i < l; i++) {
      if (windows[i]) return focus_(windows[i], ev);
    }

    return focus_(this.window, ev);
  }

  // URXVT Keys for tab navigation and creation.
  // Shift-Left, Shift-Right, Shift-Down
  if (ev.shiftKey && (ev.keyCode >= 37 && ev.keyCode <= 40)) {
    var tabs = this.window.tabs
      , i = indexOf(tabs, this)
      , l = tabs.length;

    cancel(ev);

    if (ev.keyCode === 37) {
      while (i--) if (tabs[i]) return tabs[i].focus();
      while (l--) if (tabs[l]) return tabs[l].focus();
      return this.focus();
    } else if (ev.keyCode === 39) {
      for (i++; i < l; i++) {
        if (tabs[i]) return tabs[i].focus();
      }
      for (i = 0; i < l; i++) {
        if (tabs[i]) return tabs[i].focus();
      }
      return this.focus();
    }

    return this.window.createTab();
  }

  // Pass to terminal key handler.
  return Terminal.prototype.keyDownHandler.call(this, ev);
};

function focus_(win, ev) {
  win.element.style.borderColor = 'orange';
  setTimeout(function() {
    win.element.style.borderColor = '';
  }, 200);
  win.focus();
}

// tmux/screen-like keys
Tab.prototype.specialKeyHandler = function(ev) {
  var win = this.window
    , key = ev.keyCode;

  switch (key) {
    case 67: // c
      win.createTab();
      break;
    case 75: // k
      win.focused.kill();
      break;
    case 87: // w (tmux key)
    case 222: // " - mac (screen key)
    case 192: // " - windows (screen key)
      break;
    default: // 0 - 9
      if (key >= 48 && key <= 57) {
        key -= 48;
        // 1-indexed
        key--;
        if (!~key) key = 10;
        if (win.tabs[key]) {
          win.tabs[key].focus();
        }
      }
      break;
  }

  return cancel(ev);
};

/**
 * Helpers
 */

function inherits(child, parent) {
  function f() {
    this.constructor = child;
  }
  f.prototype = parent.prototype;
  child.prototype = new f();
}

function indexOf(obj, el) {
  var i = obj.length;
  while (i--) {
    if (obj[i] === el) return i;
  }
  return -1;
}

function splice(obj, el) {
  var i = indexOf(obj, el);
  if (~i) obj.splice(i, 1);
}

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
