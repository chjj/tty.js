'use strict';

exports.searchInventory = function(args, res, next) {
  /**
   * parameters expected in the args:
  * searchString (String)
  * skip (Integer)
  * limit (Integer)
  **/
    var examples = {};
  examples['application/json'] = [ {
  "releaseDate" : "2016-08-29T09:12:33.001Z",
  "name" : "Widget Adapter",
  "id" : "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "manufacturer" : {
    "phone" : "408-867-5309",
    "name" : "ACME Corporation",
    "homePage" : "https://www.acme-corp.com"
  }
} ];
  if(Object.keys(examples).length > 0) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(examples[Object.keys(examples)[0]] || {}, null, 2));
  }
  else {
    res.end();
  }
  
}

