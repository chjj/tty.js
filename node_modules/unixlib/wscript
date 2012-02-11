srcdir = '.'
blddir = 'build'
VERSION = '0.0.1'

def set_options(opt):
	opt.tool_options('compiler_cxx')

def configure(conf):
	conf.check_tool('compiler_cxx')
	conf.check_tool('node_addon')
	conf.check(header_name="security/pam_appl.h", mandatory=True)
	conf.env.LINKFLAGS = ["-lpam"]

def build(bld):
	obj = bld.new_task_gen('cxx', 'shlib', 'node_addon')
	obj.cxxflags = ["-g", "-D_FILE_OFFSET_BITS=64", "-D_LARGEFILE_SOURCE", "-Wall"]
	obj.target = 'unixlib'
	obj.source = 'unixlib.cc'


