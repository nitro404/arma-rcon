# ARMA RCon

[![NPM version][npm-version-image]][npm-url]
[![Build Status][build-status-image]][build-status-url]
[![Coverage Status][coverage-image]][coverage-url]
[![Known Vulnerabilities][vulnerabilities-image]][vulnerabilities-url]
[![Dependencies][dependencies-image]][dependencies-url]
[![Downloads][npm-downloads-image]][npm-url]
[![Install Size][install-size-image]][install-size-url]
[![Contributors][contributors-image]][contributors-url]
[![Pull Requests Welcome][pull-requests-image]][pull-requests-url]

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

[npm-url]: https://www.npmjs.com/package/arma-rcon
[npm-version-image]: https://img.shields.io/npm/v/arma-rcon.svg
[npm-downloads-image]: http://img.shields.io/npm/dm/arma-rcon.svg

[build-status-url]: https://travis-ci.org/nitro404/arma-rcon
[build-status-image]: https://travis-ci.org/nitro404/arma-rcon.svg?branch=master

[coverage-url]: https://coveralls.io/github/nitro404/arma-rcon?branch=master
[coverage-image]: https://coveralls.io/repos/github/nitro404/arma-rcon/badge.svg?branch=master

[vulnerabilities-url]: https://snyk.io/test/github/nitro404/arma-rcon?targetFile=package.json
[vulnerabilities-image]: https://snyk.io/test/github/nitro404/arma-rcon/badge.svg?targetFile=package.json

[dependencies-url]: https://david-dm.org/nitro404/arma-rcon
[dependencies-image]: https://img.shields.io/david/nitro404/arma-rcon.svg

[install-size-url]: https://packagephobia.now.sh/result?p=arma-rcon
[install-size-image]: https://badgen.net/packagephobia/install/arma-rcon

[contributors-url]: https://github.com/nitro404/arma-rcon/graphs/contributors
[contributors-image]: https://img.shields.io/github/contributors/nitro404/arma-rcon.svg

[pull-requests-url]: https://github.com/nitro404/arma-rcon/pulls
[pull-requests-image]: https://img.shields.io/badge/PRs-welcome-brightgreen.svg
