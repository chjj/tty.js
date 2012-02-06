{
  'targets': [{
    'target_name': 'pty',
    'type': 'loadable_module',
    'product_extension': 'node',
    'product_prefix': '',
    'include_dirs': [
      './src'
    ],
    'sources': [
      'src/pty.cc'
    ],
    'libraries': [
      '-lutil'
    ]
  }]
}
