/**
 * pty.cc
 * This file is responsible for starting processes
 * with pseudo-terminal file descriptors.
 *
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
#include <termios.h> /* tcgetattr */

using namespace std;
using namespace node;
using namespace v8;

static Handle<Value> ForkPty(const Arguments&);
extern "C" void init(Handle<Object>);

static Handle<Value> ForkPty(const Arguments& args) {
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
  signal(SIGCHLD, SIG_IGN);

  pid_t pid = forkpty(&master, NULL, NULL, &winp);

  if (pid == -1) {
    return ThrowException(Exception::Error(
      String::New("forkpty failed.")));
  }

  if (pid == 0) {
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
  }

  Local<Object> obj = Object::New();
  obj->Set(String::New("fd"), Number::New(master));
  obj->Set(String::New("pid"), Number::New(pid));

  return scope.Close(obj);
}

extern "C" void init(Handle<Object> target) {
  HandleScope scope;
  NODE_SET_METHOD(target, "forkPty", ForkPty);
}
