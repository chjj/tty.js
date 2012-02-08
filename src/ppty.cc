/**
 * ppty.cc
 */

/* A really long, lowlevel, portable version of forkpty(3) */
/* Keeping this here for reference/good-measure */

#include <v8.h>
#include <node.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>

#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <sys/ioctl.h>

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

  // glibc style
  // int master = getpt();

  // freebsd uses this - more posixy
  // int master = posix_openpt(O_RDWR | O_NOCTTY);

  // unix98 style - most portable
  int master = open("/dev/ptmx", O_RDWR | O_NOCTTY);

  if (master == -1) {
    return ThrowException(Exception::Error(
      String::New("/dev/ptmx open failed.")));
  }

  if (grantpt(master) == -1) {
    return ThrowException(Exception::Error(
      String::New("grantpt failed.")));
  }

  if (unlockpt(master) == -1) {
    return ThrowException(Exception::Error(
      String::New("unlockpt failed.")));
  }

  char *slave_name = ptsname(master);
  if (slave_name == NULL) {
    return ThrowException(Exception::Error(
      String::New("ptsname failed.")));
  }

  int slave = open(slave_name, O_RDWR);
  if (slave == -1) {
    return ThrowException(Exception::Error(
      String::New("Failed to open slave.")));
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

  // possibly set termp here
  // tcsetattr(slave, TCSAFLUSH, &termp);

  if (ioctl(slave, TIOCSWINSZ, &winp) == -1) {
    return ThrowException(Exception::Error(
      String::New("ioctl failed.")));
  }

  pid_t pid = fork();

  if (pid == -1) {
    close(master);
    close(slave);
    return ThrowException(Exception::Error(
      String::New("fork failed.")));
  }

  if (pid == 0) {
    close(master);

    // dont use login_tty
    // int login = login_tty(slave);
    // if (login == -1) _exit(1);

    // make controlling terminal
    setsid();
    if (ioctl(slave, TIOCSCTTY, NULL) == -1) _exit(1);

    // use dup2 for portability
    // glibc does:
    // while (dup2(slave, 0) == -1 && errno == EBUSY);
    dup2(slave, 0);
    dup2(slave, 1);
    dup2(slave, 2);

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

  close(slave);

  Local<Object> obj = Object::New();
  obj->Set(String::New("fd"), Number::New(master));
  obj->Set(String::New("pid"), Number::New(pid));

  return scope.Close(obj);
}

extern "C" void init(Handle<Object> target) {
  HandleScope scope;
  NODE_SET_METHOD(target, "fork", ForkPty);
}
