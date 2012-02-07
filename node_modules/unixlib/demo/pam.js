var unixlib = require("../build/Release/unixlib");

// Change accordingly or write your own.
var service = "system-auth";
var username = "myusername";
var password = "myuserpass";

unixlib.pamauth(service, username, password, function(result) {
	console.log("Username: " + username + ", password: " + password + ", result: " + result);
});
