"use strict";

var utilities = require("extra-utilities");

var playerDataRegExp = /^\s*(\d+)\s+((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9]))\s+(\d{1,5})\s+(\d+)\s+([0-9A-Z]+)\s+(.*)\s*$/i;

function Player(number, ipAddress, port, ping, id, name) {
	var self = this;

	self.number = utilities.parseInteger(number);
	self.ipAddress = ipAddress;
	self.port = utilities.parseInteger(port);
	self.ping = utilities.parseInteger(ping);
	self.id = id;
	self.name = name;
}

Player.parseFrom = function(data) {
	if(utilities.isEmptyString(data)) {
		return null;
	}

	var playerData = data.match(playerDataRegExp);

	if(!playerData) {
		return null;
	}

	var player = new Player(playerData[1], playerData[2], playerData[7], playerData[8], playerData[9], playerData[10]);

	if(!Player.isValid(player)) {
		return null;
	}

	return player;
};

Player.prototype.isValid = function() {
	var self = this;

	return Number.isInteger(self.number) &&
		   self.number >= 0 &&
		   utilities.isNonEmptyString(self.ipAddress) &&
		   Number.isInteger(self.port) &&
		   self.port >= 0 &&
		   Number.isInteger(self.ping) &&
		   self.ping >= 0 &&
		   utilities.isNonEmptyString(self.id) &&
		   typeof self.name === "string";
};

Player.isValid = function(player) {
	return utilities.isObject(player) &&
		   player instanceof Player &&
		   player.isValid();
};

module.exports = Player;
