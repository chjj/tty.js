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
 * Shared
 */

var socket
  , windows
  , terms
  , uid;

/**
 * Open
 */

function open() {
  if (socket) return;

  root = doc.documentElement;
  body = doc.body;

  socket = io.connect();
  windows = [];
  terms = {};
  uid = 0;

  var open = doc.getElementById('open')
    , lights = doc.getElementById('lights');

  on(open, 'click', function() {
    new Window;
  });

  on(lights, 'click', function() {
    root.className = !root.className
      ? 'dark'
      : '';
  });

  socket.on('connect', function() {
    reset();
    new Window;
  });

  socket.on('data', function(id, data) {
    terms[id].write(data);
  });

  socket.on('kill', function(id) {
    if (!terms[id]) return;
    terms[id]._destroy();
  });

  // The problem with syncing: we never inform the
  // server whether a terminal is in a tab
  // or a window. We just use windows here.
  // Possibly rename to 'login' (?)
  socket.on('sync', function(session) {
    var emit = socket.emit
      , terms_ = {}
      , uid_ = session.uid
      , keys = session.terms
      , l = keys.length
      , i = 0;

    // temporary hack
    socket.emit = function() {};

    reset();

    for (; i < l; i++) {
      terms_[keys[i]] = (new Window).focused;
      terms_[keys[i]].id = +keys[i];
    }

    socket.emit = emit;

    terms = terms_;
    uid = uid_;
  });

  // We would need to poll the os on the serverside
  // anyway. there's really no clean way to do this.
  // This is just easier to do on the
  // clientside, rather than poll on the
  // server, and *then* send it to the client.
  setInterval(function() {
    var i = windows.length;
    while (i--) {
      if (!windows[i].focused) continue;
      windows[i].focused.pollProcessName();
    }
  }, 2 * 1000);

  // Keep windows maximized.
  on(window, 'resize', function(ev) {
    var i = windows.length
      , win;

    while (i--) {
      win = windows[i];
      if (win.minimize) {
        win.minimize();
        win.maximize();
      }
    }
  });
}

function reset() {
  var i = windows.length;
  while (i--) {
    windows[i].destroy();
  }
  windows = [];
  terms = {};
  uid = 0;
}

/**
 * Window
 */

function Window() {
  var self = this;

  var el
    , grip
    , bar
    , button
    , title;

  el = document.createElement('div');
  el.className = 'window';

  grip = document.createElement('div');
  grip.className = 'grip';

  bar = document.createElement('div');
  bar.className = 'bar';

  button = document.createElement('div');
  button.innerHTML = '~';
  button.title = 'new/close';
  button.className = 'tab';

  title = document.createElement('div');
  title.className = 'title';
  title.innerHTML = '';

  this.element = el;
  this.grip = grip;
  this.bar = bar;
  this.button = button;
  this.title = title;

  this.tabs = [];
  this.focused = null;

  this.cols = Terminal.geometry[0];
  this.rows = Terminal.geometry[1];

  el.appendChild(grip);
  el.appendChild(bar);
  bar.appendChild(button);
  bar.appendChild(title);
  body.appendChild(el);

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
    , button = this.button
    , last = 0;

  on(button, 'click', function(ev) {
    if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey) {
      self.destroy();
    } else {
      self.createTab();
    }
  });

  on(grip, 'mousedown', function(ev) {
    self.focus();
    self.resizing(ev);
    cancel(ev);
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
  var parent = this.element.parentNode;
  if (parent) {
    parent.removeChild(this.element);
    parent.appendChild(this.element);
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
    term.destroy();
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
    y = el.offsetHeight - term.element.clientHeight;
    x = ev.pageX - el.offsetLeft;
    y = (ev.pageY - el.offsetTop) - y;
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

  window.scrollTo(0, 0);

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
  //this.grip.style.display = 'none';
  root.className = 'maximized';

  this.resize(x, y);
};

Window.prototype.resize = function(cols, rows) {
  this.cols = cols;
  this.rows = rows;
  this.each(function(term) {
    term.resize(cols, rows);
  });
};

Window.prototype.each = function(func) {
  var i = this.tabs.length;
  while (i--) {
    func(this.tabs[i], i);
  }
};

Window.prototype.createTab = function() {
  new Tab(this);
};

Window.prototype.highlight = function() {
  var self = this;
  this.element.style.borderColor = 'orange';
  setTimeout(function() {
    self.element.style.borderColor = '';
  }, 200);
  this.focus();
};

Window.prototype.focusTab = function(next) {
  var tabs = this.tabs
    , i = indexOf(tabs, this.focused)
    , l = tabs.length;

  if (!next) {
    if (tabs[--i]) return tabs[i].focus();
    if (tabs[--l]) return tabs[l].focus();
  } else {
    if (tabs[++i]) return tabs[i].focus();
    if (tabs[0]) return tabs[0].focus();
  }

  return this.focused && this.focused.focus();
};

Window.prototype.nextTab = function() {
  return this.focusTab(true);
};

Window.prototype.previousTab = function() {
  return this.focusTab(false);
};

/**
 * Tab
 */

function Tab(win) {
  var self = this;

  var id = uid++
    , cols = win.cols
    , rows = win.rows;

  Terminal.call(this, cols, rows, function(data) {
    socket.emit('data', self.id, data);
  });

  var button = document.createElement('div');
  button.className = 'tab';
  button.innerHTML = '\u2022';
  win.bar.appendChild(button);

  on(button, 'click', function(ev) {
    if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey) {
      self.destroy();
    } else {
      self.focus();
    }
    return cancel(ev);
  });

  this.id = id;
  this.window = win;
  this.button = button;
  this.element = null;
  this.process = '';
  this.open();

  win.tabs.push(this);
  terms[id] = this;

  socket.emit('create', cols, rows, function(err, data) {
    if (err) return self._destroy();
    self.pty = data.pty;
    self.process = data.process;
    win.title.innerHTML = data.process;
  });
};

inherits(Tab, Terminal);

Tab.prototype._write = Tab.prototype.write;

Tab.prototype.write = function(data) {
  if (this.window.focused !== this) this.button.style.color = 'red';
  return this._write(data);
};

Tab.prototype._focus = Tab.prototype.focus;

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

    win.title.innerHTML = this.process;
    this.button.style.fontWeight = 'bold';
    this.button.style.color = '';
  }

  this._focus();

  win.focus();
};

Tab.prototype._resize = Tab.prototype.resize;

Tab.prototype.resize = function(cols, rows) {
  socket.emit('resize', this.id, cols, rows);
  this._resize(cols, rows);
};

Tab.prototype._destroy = function() {
  if (this.destroyed) return;
  this.destroyed = true;

  var win = this.window;

  this.button.parentNode.removeChild(this.button);
  this.element.parentNode.removeChild(this.element);

  delete terms[this.id];
  splice(win.tabs, this);

  if (win.focused === this) {
    win.previousTab();
  }

  if (!win.tabs.length) {
    win.destroy();
  }
};

Tab.prototype.destroy = function() {
  if (this.destroyed) return;
  socket.emit('kill', this.id);
  this._destroy();
};

Tab.prototype._keyDownHandler = Tab.prototype.keyDownHandler;

Tab.prototype.keyDownHandler = function(ev) {
  if (this.pendingKey) {
    this.pendingKey = false;
    return this.specialKeyHandler(ev);
  }

  // ^A for screen-key-like prefix.
  if (Terminal.screenKeys && ev.ctrlKey && ev.keyCode === 65) {
    this.pendingKey = true;
    return cancel(ev);
  }

  // Alt-` to quickly swap between windows.
  if (ev.keyCode === 192
      && ((!isMac && ev.altKey)
      || (isMac && ev.metaKey))) {
    cancel(ev);

    var i = indexOf(windows, this.window) + 1;
    if (windows[i]) return windows[i].highlight();
    if (windows[0]) return windows[0].highlight();

    return this.window.highlight();
  }

  // URXVT Keys for tab navigation and creation.
  // Shift-Left, Shift-Right, Shift-Down
  if (ev.shiftKey && (ev.keyCode >= 37 && ev.keyCode <= 40)) {
    cancel(ev);

    if (ev.keyCode === 37) {
      return this.window.previousTab();
    } else if (ev.keyCode === 39) {
      return this.window.nextTab();
    }

    return this.window.createTab();
  }

  // Pass to terminal key handler.
  return this._keyDownHandler(ev);
};

// tmux/screen-like keys
Tab.prototype.specialKeyHandler = function(ev) {
  var win = this.window
    , key = ev.keyCode;

  switch (key) {
    case 65: // a
      if (ev.ctrlKey) {
        return this._keyDownHandler(ev);
      }
      break;
    case 67: // c
      win.createTab();
      break;
    case 75: // k
      win.focused.destroy();
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

Tab.prototype.pollProcessName = function(func) {
  var self = this;
  socket.emit('process', this.id, function(err, name) {
    self.process = name;
    self.button.title = name;
    if (self.window.focused === self) {
      self.window.title.innerHTML = name;
    }
    if (func) func(name);
  });
};

/**
 * Helpers
 */

function inherits(child, parent) {
  function f() {
    this.constructor = child;
  }
  f.prototype = parent.prototype;
  child.prototype = new f;
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

var dummy = document.createElement('div');

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
