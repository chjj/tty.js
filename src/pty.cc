/**
 * pty.cc
 * This file is responsible for starting processes
 * with pseudo-terminal file descriptors.
 * man tty_ioctl
 * man forkpty openpty
 */

#include <v8.h>
#include <node.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>

#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

#include <pty.h> /* forkpty */
#include <utmp.h> /* login_tty */
#include <termios.h> /* tcgetattr */

using namespace std;
using namespace node;
using namespace v8;

static Handle<Value> RegisterTerminal(const Arguments&);
static Handle<Value> ForkProcess(const Arguments&);
static Handle<Value> ForkPty(const Arguments&);
static Handle<Value> OpenPty(const Arguments&);
extern "C" void init(Handle<Object>);

static Handle<Value> RegisterTerminal(const Arguments& args) {
  HandleScope scope;

  int master = open("/dev/ptmx", O_RDWR);
  if (!master) {
    return ThrowException(
      Exception::Error(String::New("ptmx failed")));
  }

  if (grantpt(master) == -1) {
    return ThrowException(
      Exception::Error(String::New("grantpt failed")));
  }

  if (unlockpt(master) == -1) {
    return ThrowException(
      Exception::Error(String::New("unlockpt failed")));
  }

  char *slave_name = ptsname(master);
  if (slave_name == NULL) {
    return ThrowException(
      Exception::Error(String::New("ptsname failed")));
  }

  int slave = open(slave_name, O_RDWR);
  if (!slave) {
    return ThrowException(
      Exception::Error(String::New("failed to open slave")));
  }

  Local<Object> obj = Object::New();
  obj->Set(String::New("master"), Number::New(master));
  obj->Set(String::New("slave"), Number::New(slave));

  return scope.Close(obj);
}

static Handle<Value> ForkProcess(const Arguments& args) {
  HandleScope scope;

  if (args.Length() < 1) {
    return ThrowException(Exception::Error(String::New("bad args")));
  }

  pid_t pid = fork();

  if (pid == -1) {
    return ThrowException(Exception::Error(String::New("fork failed")));
  }

  if (pid == 0) {
    setenv("TERM", "vt100", 1);
    chdir(getenv("HOME"));

    if (args.Length() > 1) {
      int fds[] = { -1, -1, -1 };

      Local<Array> fds_ = Local<Array>::Cast(args[1]);
      int i = 0, l = fds_->Length();
      for (; i < l; i++) {
        if (!fds_->Get(i)->IsNumber()) continue;
        Local<Integer> fd = fds_->Get(i)->ToInteger();
        fds[i] = fd->Value();
      }

      if (fds[0] != -1) {
        dup2(fds[0], STDIN_FILENO);
      }

      if (fds[1] != -1) {
        dup2(fds[1], STDOUT_FILENO);
      }

      if (fds[2] != -1) {
        dup2(fds[2], STDERR_FILENO);
      }
    }

    String::Utf8Value file(args[0]->ToString());
    char *argv[] = { NULL, NULL };
    argv[0] = strdup(*file);

    execvp(argv[0], argv);

    perror("execvp failed");
    _exit(1);
  }

  return scope.Close(Integer::New(pid));
}

static Handle<Value> ForkPty(const Arguments& args) {
  HandleScope scope;

  if (args.Length() < 1 || !args[0]->IsString()) {
    return ThrowException(Exception::Error(String::New("bad args")));
  }

  String::Utf8Value file(args[0]->ToString());
  char *argv[] = { NULL, NULL };
  argv[0] = strdup(*file);

  struct winsize winp = {};
  winp.ws_col = 80;
  winp.ws_row = 30;

  int master;
  pid_t pid = forkpty(&master, NULL, NULL, &winp);

  if (pid == -1) {
    return ThrowException(Exception::Error(String::New("fork failed")));
  }

  if (pid == 0) {
    setenv("TERM", "vt100", 1);
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

static Handle<Value> OpenPty(const Arguments& args) {
  HandleScope scope;

  if (args.Length() < 1 || !args[0]->IsString()) {
    return ThrowException(Exception::Error(String::New("bad args")));
  }

  String::Utf8Value file(args[0]->ToString());
  char *argv[] = { NULL, NULL };
  argv[0] = strdup(*file);

  struct winsize winp = {};
  winp.ws_col = 80;
  winp.ws_row = 30;

  int master, slave;
  int opened = openpty(&master, &slave, NULL, NULL, &winp);

  if (opened == -1) {
    return ThrowException(Exception::Error(String::New("openpty failed")));
  }

  pid_t pid = fork();

  if (pid == -1) {
    return ThrowException(Exception::Error(String::New("fork failed")));
  }

  if (pid == 0) {
    int login = login_tty(slave);

    if (login == -1) {
      return ThrowException(Exception::Error(String::New("login failed")));
    }

    close(master);

    setenv("TERM", "vt100", 1);
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
  NODE_SET_METHOD(target, "registerTerminal", RegisterTerminal);
  NODE_SET_METHOD(target, "forkProcess", ForkProcess);
  NODE_SET_METHOD(target, "forkPty", ForkPty);
  NODE_SET_METHOD(target, "openPty", OpenPty);
}
