all:
	node-waf configure build
	cp -f node_modules/socket.io-client/dist/socket.io.js static/io.js

gyp:
	node-gyp configure
	node-gyp build
	cp -f node_modules/socket.io-client/dist/socket.io.js static/io.js

clean:
	@rm -rf ./build .lock-wscript

clean-gyp:
	@type node-gyp > /dev/null && node-gyp clean 2>/dev/null

.PHONY: all gyp clean clean-gyp
