SIO = node_modules/socket.io-client/dist/socket.io.js

all:
	node-waf configure build
	@mv -f build/Release/pty.node -t .
	cp -f $(SIO) static/io.js 2>/dev/null || true

gyp:
	node-gyp configure
	node-gyp build
	@mv -f out/Release/pty.node -t .
	cp -f $(SIO) static/io.js 2>/dev/null || true

clean:
	@rm -rf ./build .lock-wscript
	@rm -rf pty.node

clean-gyp:
	@type node-gyp > /dev/null && node-gyp clean 2>/dev/null
	@rm -rf pty.node

.PHONY: all gyp clean clean-gyp
