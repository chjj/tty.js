/**
 * pty.cc
 * This file is responsible for starting processes
 * with pseudo-terminal file descriptors.
 *
 * man pty
 * man tty_ioctl
 * man tcsetattr
 * man forkpty
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

using namespace std;
using namespace node;
using namespace v8;

static Handle<Value> PtyFork(const Arguments&);
static Handle<Value> PtyResize(const Arguments&);
static int pty_nonblock(int fd);
extern "C" void init(Handle<Object>);

static Handle<Value> PtyFork(const Arguments& args) {
  HandleScope scope;

  char *argv[] = { "sh", NULL };

  if (args.Length() > 0) {
    if (!args[0]->IsString()) {
      return ThrowException(Exception::Error(
        String::New("First argument must be a string.")));
    }
    String::Utf8Value file(args[0]->ToString());
    argv[0] = strdup(*file);
  }

  struct winsize winp = {};
  winp.ws_col = 80;
  winp.ws_row = 30;

  if (args.Length() == 4) {
    if (args[2]->IsNumber() && args[3]->IsNumber()) {
      Local<Integer> cols = args[2]->ToInteger();
      Local<Integer> rows = args[3]->ToInteger();

      winp.ws_col = cols->Value();
      winp.ws_row = rows->Value();
    } else {
      return ThrowException(Exception::Error(
        String::New("cols and rows need to be numbers.")));
    }
  }

  int master;
  char name[80]; // this should be more than enough
  pid_t pid = forkpty(&master, name, NULL, &winp);

  switch (pid) {
    case -1:
      return ThrowException(Exception::Error(
        String::New("forkpty failed.")));
    case 0:
      if (args.Length() > 1 && args[1]->IsString()) {
        String::Utf8Value term(args[1]->ToString());
        setenv("TERM", strdup(*term), 1);
      } else {
        setenv("TERM", "vt100", 1);
      }

      chdir(getenv("HOME"));

      execvp(argv[0], argv);

      perror("execvp failed");
      _exit(1);
    default:
      if (pty_nonblock(master) == -1) {
        return ThrowException(Exception::Error(
          String::New("Could not set master fd to nonblocking.")));
      }

      Local<Object> obj = Object::New();
      obj->Set(String::New("fd"), Number::New(master));
      obj->Set(String::New("pid"), Number::New(pid));
      obj->Set(String::New("name"), String::New(name));

      return scope.Close(obj);
  }

  return Undefined();
}

/**
 * Expose Resize Functionality
 */

static Handle<Value> PtyResize(const Arguments& args) {
  HandleScope scope;

  if (args.Length() > 0 && !args[0]->IsNumber()) {
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
 * FD to nonblocking
 */

static int pty_nonblock(int fd) {
  int flags = fcntl(fd, F_GETFL, 0);
  if (flags & O_NONBLOCK) return 0;
  if (flags == -1) return -1;
  return fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

/**
 * Init
 */

extern "C" void init(Handle<Object> target) {
  HandleScope scope;
  NODE_SET_METHOD(target, "fork", PtyFork);
  NODE_SET_METHOD(target, "resize", PtyResize);
}
