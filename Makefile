SIO = node_modules/socket.io-client/dist/socket.io.js

all:
	node-waf configure build
	cp -f $(SIO) static/io.js 2>/dev/null || true

gyp:
	node-gyp configure
	node-gyp build
	cp -f $(SIO) static/io.js 2>/dev/null || true

clean:
	@rm -rf ./build .lock-wscript

clean-gyp:
	@type node-gyp > /dev/null && node-gyp clean 2>/dev/null

.PHONY: all gyp clean clean-gyp
