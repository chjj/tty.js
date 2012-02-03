all:
	node-waf configure build
	cp -f node_modules/socket.io-client/dist/socket.io.js static/io.js

clean:
	@rm -rf ./build
	@rm .lock-wscript

.PHONY: all clean
