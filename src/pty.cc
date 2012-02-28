/**
 * pty.js
 * Copyright (c) 2012, Christopher Jeffrey (MIT License)
 *
 * pty.cc:
 *   This file is responsible for starting processes
 *   with pseudo-terminal file descriptors.
 *
 * See:
 *   man pty
 *   man tty_ioctl
 *   man tcsetattr
 *   man forkpty
 */

#include <v8.h>
#include <node.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>

#include <sys/types.h>
#include <sys/stat.h>
#include <sys/ioctl.h>
#include <fcntl.h>

/* forkpty */
/* http://www.gnu.org/software/gnulib/manual/html_node/forkpty.html */
#if defined(__GLIBC__) || defined(__CYGWIN__)
#include <pty.h>
#elif defined(__APPLE__) || defined(__OpenBSD__) || defined(__NetBSD__)
#include <util.h>
#elif defined(__FreeBSD__)
#include <libutil.h>
#else
#include <pty.h>
#endif

#include <utmp.h> /* login_tty */
#include <termios.h> /* tcgetattr, tty_ioctl */

/* environ for execvpe */
#if defined(__APPLE__)
#include <crt_externs.h>
#define environ (*_NSGetEnviron())
#else
extern char **environ;
#endif

/* for pty_getproc */
#if defined(__GLIBC__)
#include <stdio.h>
#include <stdint.h>
#elif defined(__APPLE__)
#include <sys/sysctl.h>
#include <libproc.h>
#endif

using namespace std;
using namespace node;
using namespace v8;

static Handle<Value>
PtyFork(const Arguments&);

static Handle<Value>
PtyResize(const Arguments&);

static Handle<Value>
PtyGetProc(const Arguments&);

static int
pty_execvpe(const char *, char **, char **);

static int
pty_nonblock(int);

static char *
pty_getproc(int, char *);

extern "C" void
init(Handle<Object>);

/**
 * PtyFork
 */

static Handle<Value>
PtyFork(const Arguments& args) {
  HandleScope scope;

  if (args.Length() < 6) {
    return ThrowException(Exception::Error(
      String::New("Not enough arguments.")));
  }

  if (!args[0]->IsString()) {
    return ThrowException(Exception::Error(
      String::New("file must be a string.")));
  }

  if (!args[1]->IsArray()) {
    return ThrowException(Exception::Error(
      String::New("args must be an array.")));
  }

  if (!args[2]->IsArray()) {
    return ThrowException(Exception::Error(
      String::New("env must be an array.")));
  }

  if (!args[3]->IsString()) {
    return ThrowException(Exception::Error(
      String::New("cwd must be a string.")));
  }

  if (!args[4]->IsNumber() || !args[5]->IsNumber()) {
    return ThrowException(Exception::Error(
      String::New("cols and rows must be numbers.")));
  }

  // node/src/node_child_process.cc

  // file
  String::Utf8Value file(args[0]->ToString());

  // args
  int i = 0;
  Local<Array> argv_ = Local<Array>::Cast(args[1]);
  int argc = argv_->Length();
  int argl = argc + 1 + 1;
  char **argv = new char*[argl];
  argv[0] = strdup(*file);
  argv[argl-1] = NULL;
  for (; i < argc; i++) {
    String::Utf8Value arg(argv_->Get(Integer::New(i))->ToString());
    argv[i+1] = strdup(*arg);
  }

  // env
  i = 0;
  Local<Array> env_ = Local<Array>::Cast(args[2]);
  int envc = env_->Length();
  char **env = new char*[envc+1];
  env[envc] = NULL;
  for (; i < envc; i++) {
    String::Utf8Value pair(env_->Get(Integer::New(i))->ToString());
    env[i] = strdup(*pair);
  }

  // cwd
  String::Utf8Value cwd_(args[3]->ToString());
  char *cwd = strdup(*cwd_);

  // size
  struct winsize winp = {};
  Local<Integer> cols = args[4]->ToInteger();
  Local<Integer> rows = args[5]->ToInteger();
  winp.ws_col = cols->Value();
  winp.ws_row = rows->Value();

  // fork the pty
  int master;
  char name[40];
  pid_t pid = forkpty(&master, name, NULL, &winp);

  if (pid) {
    for (i = 0; i < argl; i++) free(argv[i]);
    delete[] argv;
    for (i = 0; i < envc; i++) free(env[i]);
    delete[] env;
    free(cwd);
  }

  switch (pid) {
    case -1:
      return ThrowException(Exception::Error(
        String::New("forkpty failed.")));
    case 0:
      if (strlen(cwd)) chdir(cwd);

      pty_execvpe(argv[0], argv, env);

      perror("execvp failed");
      _exit(1);
    default:
      // nonblocking
      if (pty_nonblock(master) == -1) {
        return ThrowException(Exception::Error(
          String::New("Could not set master fd to nonblocking.")));
      }

      Local<Object> obj = Object::New();
      obj->Set(String::New("fd"), Number::New(master));
      obj->Set(String::New("pid"), Number::New(pid));
      obj->Set(String::New("pty"), String::New(name));

      return scope.Close(obj);
  }

  return Undefined();
}

/**
 * Resize Functionality
 */

static Handle<Value>
PtyResize(const Arguments& args) {
  HandleScope scope;

  if (args.Length() < 1 || !args[0]->IsNumber()) {
    return ThrowException(Exception::Error(
      String::New("First argument must be a number.")));
  }

  struct winsize winp = {};
  winp.ws_col = 80;
  winp.ws_row = 30;

  int fd = args[0]->ToInteger()->Value();

  if (args.Length() == 3) {
    if (args[1]->IsNumber() && args[2]->IsNumber()) {
      Local<Integer> cols = args[1]->ToInteger();
      Local<Integer> rows = args[2]->ToInteger();

      winp.ws_col = cols->Value();
      winp.ws_row = rows->Value();
    } else {
      return ThrowException(Exception::Error(
        String::New("cols and rows need to be numbers.")));
    }
  }

  if (ioctl(fd, TIOCSWINSZ, &winp) == -1) {
    return ThrowException(Exception::Error(
      String::New("ioctl failed.")));
  }

  return Undefined();
}

/**
 * Foreground Process Name
 */

static Handle<Value>
PtyGetProc(const Arguments& args) {
  HandleScope scope;

  if (args.Length() != 2) {
    return ThrowException(Exception::Error(
      String::New("Bad arguments.")));
  }

  int fd = args[0]->ToInteger()->Value();

  String::Utf8Value tty_(args[1]->ToString());
  char *tty = strdup(*tty_);
  char *name = pty_getproc(fd, tty);
  free(tty);

  if (name == NULL) {
    return Undefined();
  }

  Local<String> name_ = String::New(name);
  free(name);
  return scope.Close(name_);
}

/**
 * execvpe
 */

// execvpe(3) is not portable.
// http://www.gnu.org/software/gnulib/manual/html_node/execvpe.html
static int
pty_execvpe(const char *file, char **argv, char **envp) {
  char **old = environ;
  environ = envp;
  int ret = execvp(file, argv);
  environ = old;
  return ret;
}

/**
 * Nonblocking FD
 */

static int
pty_nonblock(int fd) {
  int flags = fcntl(fd, F_GETFL, 0);
  if (flags == -1) return -1;
  return fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

/**
 * pty_getproc
 * Taken from tmux.
 */

// Taken from: tmux (http://tmux.sourceforge.net/)
// Copyright (c) 2009 Nicholas Marriott <nicm@users.sourceforge.net>
// Copyright (c) 2009 Joshua Elsasser <josh@elsasser.org>
//
// Permission to use, copy, modify, and distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF MIND, USE, DATA OR PROFITS, WHETHER
// IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING
// OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

#if defined(__GLIBC__)

static char *
pty_getproc(int fd, char *tty) {
  FILE *f;
  char *path, *buf;
  size_t len;
  int ch;
  pid_t pgrp;
  int r;

  if ((pgrp = tcgetpgrp(fd)) == -1) {
    return NULL;
  }

  r = asprintf(&path, "/proc/%lld/cmdline", (long long)pgrp);
  if (r == -1 || path == NULL) return NULL;

  if ((f = fopen(path, "r")) == NULL) {
    free(path);
    return NULL;
  }

  free(path);

  len = 0;
  buf = NULL;
  while ((ch = fgetc(f)) != EOF) {
    if (ch == '\0') break;
    //if (SIZE_MAX < len + 2) return NULL;
    buf = (char *)realloc(buf, len + 2);
    if (buf == NULL) return NULL;
    buf[len++] = ch;
  }

  if (buf != NULL) {
    buf[len] = '\0';
  }

  fclose(f);
  return buf;
}

#elif defined(__APPLE__)

static char *
pty_getproc(int fd, char *tty) {
  int mib[4] = { CTL_KERN, KERN_PROC, KERN_PROC_PID, 0 };
  size_t size;
  struct kinfo_proc kp;

  if ((mib[3] = tcgetpgrp(fd)) == -1) {
    return NULL;
  }

  size = sizeof kp;
  if (sysctl(mib, 4, &kp, &size, NULL, 0) == -1) {
    return NULL;
  }

  if (*kp.kp_proc.p_comm == '\0') {
    return NULL;
  }

  return strdup(kp.kp_proc.p_comm);
}

#else

static char *
pty_getproc(int fd, char *tty) {
  return NULL;
}

#endif

/**
 * Init
 */

extern "C" void
init(Handle<Object> target) {
  HandleScope scope;
  NODE_SET_METHOD(target, "fork", PtyFork);
  NODE_SET_METHOD(target, "resize", PtyResize);
  NODE_SET_METHOD(target, "process", PtyGetProc);
}
