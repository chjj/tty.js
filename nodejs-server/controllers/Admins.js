'use strict';

var url = require('url');


var Admins = require('./AdminsService');


module.exports.addInventory = function addInventory (req, res, next) {
  Admins.addInventory(req.swagger.params, res, next);
};
