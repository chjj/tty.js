all:
	node-waf configure build
	@mv -f build/Release/pty.node .

gyp:
	node-gyp configure
	node-gyp build
	@mv -f out/Release/pty.node .

clean:
	@rm -rf ./build .lock-wscript
	@rm -rf pty.node

clean-gyp:
	@type node-gyp > /dev/null && node-gyp clean 2>/dev/null
	@rm -rf pty.node

.PHONY: all gyp clean clean-gyp
