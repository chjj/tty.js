all:
	node-waf configure build

gyp:
	node-gyp configure
	node-gyp build

clean:
	@rm -rf ./build .lock-wscript

clean-gyp:
	@type node-gyp > /dev/null && node-gyp clean 2>/dev/null

.PHONY: all gyp clean clean-gyp
