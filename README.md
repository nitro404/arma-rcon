# ARMA RCon

A system for connecting to remote console for ARMA servers over UDP.

## Server-Side Usage

```javascript
var async = require("async");
var armaRcon = require("arma-rcon");

var server = new armaRcon.ARMAServer("127.0.0.1", 2302);

return async.waterfall(
	[
		function(callback) {
			return server.login(
				"password",
				function(error, loggedIn) {
					if(error) {
						return callback(error);
					}

					console.log("Logged in!");

					return callback();
				}
			);
		},
		function(callback) {
			return server.globalMessage(
				"Test message, please ignore.",
				function(error, packet, bytesSent) {
					if(error) {
						return callback(error);
					}

					console.log("Message sent!");

					return callback();
				}
			);
		},
		function(callback) {
			return server.logout(
				function(error) {
					if(error) {
						return callback(error);
					}

					console.log("Logged out.");

					return callback();
				}
			);
		}
	],
	function(error) {
		if(error) {
			return console.error(error);
		}
	}
);
```

## Installation

To install this module:
```bash
npm install arma-rcon
```
