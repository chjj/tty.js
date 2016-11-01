/**
 * tty.js
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 */

;(function() {

/**
 * Elements
 */

var document = this.document
  , window = this
  , root
  , body
  , h1
  , open
  , lights;

/**
 * Initial Document Title
 */

var initialTitle = document.title;

/**
 * Helpers
 */

var EventEmitter = Terminal.EventEmitter
  , inherits = Terminal.inherits
  , on = Terminal.on
  , off = Terminal.off
  , cancel = Terminal.cancel;

/**
 * tty
 */

var tty = new EventEmitter;

/**
 * Shared
 */

tty.socket;
tty.windows;
tty.terms;
tty.elements;

/**
 * Open
 */

tty.open = function() {
  if (document.location.pathname) {
    var parts = document.location.pathname.split('/')
      , base = parts.slice(0, parts.length - 1).join('/') + '/'
      , resource = base.substring(1) + 'socket.io';

    tty.socket = io.connect(null, { resource: resource });
  } else {
    tty.socket = io.connect();
  }

  tty.windows = [];
  tty.terms = {};

  tty.elements = {
    root: document.documentElement,
    body: document.body,
    h1: document.getElementsByTagName('h1')[0],
    open: document.getElementById('open'),
    lights: document.getElementById('lights')
  };

  root = tty.elements.root;
  body = tty.elements.body;
  h1 = tty.elements.h1;
  open = tty.elements.open;
  lights = tty.elements.lights;

  if (open) {
    on(open, 'click', function() {
      new Window;
    });
  }

  if (lights) {
    on(lights, 'click', function() {
      tty.toggleLights();
    });
  }

  tty.socket.on('connect', function() {
    tty.reset();
    tty.emit('connect');
  });

  tty.socket.on('data', function(id, data) {
    if (!tty.terms[id]) return;
    tty.terms[id].write(data);
  });

  tty.socket.on('kill', function(id) {
    if (!tty.terms[id]) return;
    tty.terms[id]._destroy();
  });

  // XXX Clean this up.
  tty.socket.on('sync', function(terms) {
    console.log('Attempting to sync...');
    console.log(terms);

    tty.reset();

    var emit = tty.socket.emit;
    tty.socket.emit = function() {};

    Object.keys(terms).forEach(function(key) {
      var data = terms[key]
        , win = new Window
        , tab = win.tabs[0];

      delete tty.terms[tab.id];
      tab.pty = data.pty;
      tab.id = data.id;
      tty.terms[data.id] = tab;
      win.resize(data.cols, data.rows);
      tab.setProcessName(data.process);
      tty.emit('open tab', tab);
      tab.emit('open');
    });

    tty.socket.emit = emit;
  });

  // We would need to poll the os on the serverside
  // anyway. there's really no clean way to do this.
  // This is just easier to do on the
  // clientside, rather than poll on the
  // server, and *then* send it to the client.
  setInterval(function() {
    var i = tty.windows.length;
    while (i--) {
      if (!tty.windows[i].focused) continue;
      tty.windows[i].focused.pollProcessName();
    }
  }, 2 * 1000);

  // Keep windows maximized.
  on(window, 'resize', function() {
    var i = tty.windows.length
      , win;

    while (i--) {
      win = tty.windows[i];
      if (win.minimize) {
        win.minimize();
        win.maximize();
      }
    }
  });

  tty.emit('load');
  tty.emit('open');
};

/**
 * Reset
 */

tty.reset = function() {
  var i = tty.windows.length;
  while (i--) {
    tty.windows[i].destroy();
  }

  tty.windows = [];
  tty.terms = {};

  tty.emit('reset');
};

/**
 * Lights
 */

tty.toggleLights = function() {
  root.className = !root.className
    ? 'dark'
    : '';
};

/**
 * Window
 */

function Window(socket) {
  var self = this;

  EventEmitter.call(this);

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

  this.socket = socket || tty.socket;
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

  tty.windows.push(this);

  this.createTab();
  this.focus();
  this.bind();

  this.tabs[0].once('open', function() {
    tty.emit('open window', self);
    self.emit('open');
  });
}

inherits(Window, EventEmitter);

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
    return cancel(ev);
  });

  on(grip, 'mousedown', function(ev) {
    self.focus();
    self.resizing(ev);
    return cancel(ev);
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

    return cancel(ev);
  });
};

Window.prototype.focus = function() {
  // Restack
  var parent = this.element.parentNode;
  if (parent) {
    parent.removeChild(this.element);
    parent.appendChild(this.element);
  }

  // Focus Foreground Tab
  this.focused.focus();

  tty.emit('focus window', this);
  this.emit('focus');
};

Window.prototype.destroy = function() {
  if (this.destroyed) return;
  this.destroyed = true;

  if (this.minimize) this.minimize();

  splice(tty.windows, this);
  if (tty.windows.length) tty.windows[0].focus();

  this.element.parentNode.removeChild(this.element);

  this.each(function(term) {
    term.destroy();
  });

  tty.emit('close window', this);
  this.emit('close');
};

Window.prototype.drag = function(ev) {
  var self = this
    , el = this.element;

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

  function up() {
    el.style.opacity = '';
    el.style.cursor = '';
    root.style.cursor = '';

    off(document, 'mousemove', move);
    off(document, 'mouseup', up);

    var ev = {
      left: el.style.left.replace(/\w+/g, ''),
      top: el.style.top.replace(/\w+/g, '')
    };

    tty.emit('drag window', self, ev);
    self.emit('drag', ev);
  }

  on(document, 'mousemove', move);
  on(document, 'mouseup', up);
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

  function up() {
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

    off(document, 'mousemove', move);
    off(document, 'mouseup', up);
  }

  on(document, 'mousemove', move);
  on(document, 'mouseup', up);
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
    term.element.style.width = '';
    term.element.style.height = '';
    el.style.boxSizing = '';
    self.grip.style.display = '';
    root.className = m.root;

    self.resize(m.cols, m.rows);

    tty.emit('minimize window', self);
    self.emit('minimize');
  };

  window.scrollTo(0, 0);

  x = root.clientWidth / term.element.offsetWidth;
  y = root.clientHeight / term.element.offsetHeight;
  x = (x * term.cols) | 0;
  y = (y * term.rows) | 0;

  el.style.left = '0px';
  el.style.top = '0px';
  el.style.width = '100%';
  el.style.height = '100%';
  term.element.style.width = '100%';
  term.element.style.height = '100%';
  el.style.boxSizing = 'border-box';
  this.grip.style.display = 'none';
  root.className = 'maximized';

  this.resize(x, y);

  tty.emit('maximize window', this);
  this.emit('maximize');
};

Window.prototype.resize = function(cols, rows) {
  this.cols = cols;
  this.rows = rows;

  this.each(function(term) {
    term.resize(cols, rows);
  });

  tty.emit('resize window', this, cols, rows);
  this.emit('resize', cols, rows);
};

Window.prototype.each = function(func) {
  var i = this.tabs.length;
  while (i--) {
    func(this.tabs[i], i);
  }
};

Window.prototype.createTab = function() {
  return new Tab(this, this.socket);
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

function Tab(win, socket) {
  var self = this;

  var cols = win.cols
    , rows = win.rows;

  Terminal.call(this, {
    cols: cols,
    rows: rows
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

  this.id = '';
  this.socket = socket || tty.socket;
  this.window = win;
  this.button = button;
  this.element = null;
  this.process = '';
  this.open();
  this.hookKeys();

  win.tabs.push(this);

  this.socket.emit('create', cols, rows, function(err, data) {
    if (err) return self._destroy();
    self.pty = data.pty;
    self.id = data.id;
    tty.terms[self.id] = self;
    self.setProcessName(data.process);
    tty.emit('open tab', self);
    self.emit('open');
  });
};

inherits(Tab, Terminal);

// We could just hook in `tab.on('data', ...)`
// in the constructor, but this is faster.
Tab.prototype.handler = function(data) {
  this.socket.emit('data', this.id, data);
};

// We could just hook in `tab.on('title', ...)`
// in the constructor, but this is faster.
Tab.prototype.handleTitle = function(title) {
  if (!title) return;

  title = sanitize(title);
  this.title = title;

  if (Terminal.focus === this) {
    document.title = title;
    // if (h1) h1.innerHTML = title;
  }

  if (this.window.focused === this) {
    this.window.bar.title = title;
    // this.setProcessName(this.process);
  }
};

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
      if (win.focused.element.parentNode) {
        win.focused.element.parentNode.removeChild(win.focused.element);
      }
      win.focused.button.style.fontWeight = '';
    }

    win.element.appendChild(this.element);
    win.focused = this;

    win.title.innerHTML = this.process;
    document.title = this.title || initialTitle;
    this.button.style.fontWeight = 'bold';
    this.button.style.color = '';
  }

  this.handleTitle(this.title);

  this._focus();

  win.focus();

  tty.emit('focus tab', this);
  this.emit('focus');
};

Tab.prototype._resize = Tab.prototype.resize;

Tab.prototype.resize = function(cols, rows) {
  this.socket.emit('resize', this.id, cols, rows);
  this._resize(cols, rows);
  tty.emit('resize tab', this, cols, rows);
  this.emit('resize', cols, rows);
};

Tab.prototype.__destroy = Tab.prototype.destroy;

Tab.prototype._destroy = function() {
  if (this.destroyed) return;
  this.destroyed = true;

  var win = this.window;

  this.button.parentNode.removeChild(this.button);
  if (this.element.parentNode) {
    this.element.parentNode.removeChild(this.element);
  }

  if (tty.terms[this.id]) delete tty.terms[this.id];
  splice(win.tabs, this);

  if (win.focused === this) {
    win.previousTab();
  }

  if (!win.tabs.length) {
    win.destroy();
  }

  // if (!tty.windows.length) {
  //   document.title = initialTitle;
  //   if (h1) h1.innerHTML = initialTitle;
  // }

  this.__destroy();
};

Tab.prototype.destroy = function() {
  if (this.destroyed) return;
  this.socket.emit('kill', this.id);
  this._destroy();
  tty.emit('close tab', this);
  this.emit('close');
};

Tab.prototype.hookKeys = function() {
  var self = this;

  // Alt-[jk] to quickly swap between windows.
  this.on('key', function(key, ev) {
    if (Terminal.focusKeys === false) {
      return;
    }

    var offset
      , i;

    if (key === '\x1bj') {
      offset = -1;
    } else if (key === '\x1bk') {
      offset = +1;
    } else {
      return;
    }

    i = indexOf(tty.windows, this.window) + offset;

    this._ignoreNext();

    if (tty.windows[i]) return tty.windows[i].highlight();

    if (offset > 0) {
      if (tty.windows[0]) return tty.windows[0].highlight();
    } else {
      i = tty.windows.length - 1;
      if (tty.windows[i]) return tty.windows[i].highlight();
    }

    return this.window.highlight();
  });

  this.on('request paste', function(key) {
    this.socket.emit('request paste', function(err, text) {
      if (err) return;
      self.send(text);
    });
  });

  this.on('request create', function() {
    this.window.createTab();
  });

  this.on('request term', function(key) {
    if (this.window.tabs[key]) {
      this.window.tabs[key].focus();
    }
  });

  this.on('request term next', function(key) {
    this.window.nextTab();
  });

  this.on('request term previous', function(key) {
    this.window.previousTab();
  });
};

Tab.prototype._ignoreNext = function() {
  // Don't send the next key.
  var handler = this.handler;
  this.handler = function() {
    this.handler = handler;
  };
  var showCursor = this.showCursor;
  this.showCursor = function() {
    this.showCursor = showCursor;
  };
};

/**
 * Program-specific Features
 */

Tab.scrollable = {
  irssi: true,
  man: true,
  less: true,
  htop: true,
  top: true,
  w3m: true,
  lynx: true,
  mocp: true
};

Tab.prototype._bindMouse = Tab.prototype.bindMouse;

Tab.prototype.bindMouse = function() {
  if (!Terminal.programFeatures) return this._bindMouse();

  var self = this;

  var wheelEvent = 'onmousewheel' in window
    ? 'mousewheel'
    : 'DOMMouseScroll';

  on(self.element, wheelEvent, function(ev) {
    if (self.mouseEvents) return;
    if (!Tab.scrollable[self.process]) return;

    if ((ev.type === 'mousewheel' && ev.wheelDeltaY > 0)
        || (ev.type === 'DOMMouseScroll' && ev.detail < 0)) {
      // page up
      self.keyDown({keyCode: 33});
    } else {
      // page down
      self.keyDown({keyCode: 34});
    }

    return cancel(ev);
  });

  return this._bindMouse();
};

Tab.prototype.pollProcessName = function(func) {
  var self = this;
  this.socket.emit('process', this.id, function(err, name) {
    if (err) return func && func(err);
    self.setProcessName(name);
    return func && func(null, name);
  });
};

Tab.prototype.setProcessName = function(name) {
  name = sanitize(name);

  if (this.process !== name) {
    this.emit('process', name);
  }

  this.process = name;
  this.button.title = name;

  if (this.window.focused === this) {
    // if (this.title) {
    //   name += ' (' + this.title + ')';
    // }
    this.window.title.innerHTML = name;
  }
};

/**
 * Helpers
 */

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

function sanitize(text) {
  if (!text) return '';
  return (text + '').replace(/[&<>]/g, '')
}

/**
 * Load
 */

function load() {
  if (load.done) return;
  load.done = true;

  off(document, 'load', load);
  off(document, 'DOMContentLoaded', load);
  tty.open();
}

on(document, 'load', load);
on(document, 'DOMContentLoaded', load);
setTimeout(load, 200);

/**
 * Expose
 */

tty.Window = Window;
tty.Tab = Tab;
tty.Terminal = Terminal;

this.tty = tty;

}).call(function() {
  return this || (typeof window !== 'undefined' ? window : global);
}());
