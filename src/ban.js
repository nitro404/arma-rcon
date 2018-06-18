"use strict";

var utilities = require("extra-utilities");
var banType = require("./ban-type");

var userIDBanRegExp = /^\s*(\d+)\s+([0-9A-Z]+)\s+(perm|\-?\d)\s+(.*)\s*$/i;
var ipAddressBanRegExp = /^\s*(\d+)\s+((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9]))\s+(perm|\-?\d)\s+(.*)\s*$/i;

function Ban(number, key, minutesLeft, reason, type) {
	var self = this;

	self.number = utilities.parseInteger(number);
	self.key = key;
	self.minutesLeft = Ban.parseMinutesLeft(minutesLeft);
	self.reason = reason;
	self.type = banType.getValue(type);
}

Ban.prototype.isUserIDBan = function() {
	var self = this;

	return self.type === banType.userID;
};

Ban.prototype.isIPAddressBan = function() {
	var self = this;

	return self.type === banType.ipAddress;
};

Ban.prototype.isPermanent = function() {
	var self = this;

	return self.minutesLeft < 0;
};

Ban.prototype.isTemporary = function() {
	var self = this;

	return self.minutesLeft >= 0;
};

Ban.parseFrom = function(data, type) {
	if(utilities.isEmptyString(data)) {
		return null;
	}

	var formattedType = banType.getBanType(type);

	if(formattedType.value === banType.invalid.value) {
		formattedType = data.match(ipAddressBanRegExp) ? banType.ipAddress : banType.userID;
	}

	if(formattedType.value === banType.ipAddress.value) {
		var ipAddressBanData = data.match(ipAddressBanRegExp);

		if(!ipAddressBanData) {
			return null;
		}

		var ipAddressBan = new Ban(ipAddressBanData[1], ipAddressBanData[2], ipAddressBanData[7], ipAddressBanData[8], formattedType);

		if(!Ban.isValid(ipAddressBan)) {
			return null;
		}

		return ipAddressBan;
	}
	else if(formattedType.value === banType.userID.value) {
		var userIDBanData = data.match(userIDBanRegExp);

		if(!userIDBanData) {
			return null;
		}

		var userIDBan = new Ban(userIDBanData[1], userIDBanData[2], userIDBanData[3], userIDBanData[4], formattedType);

		if(!Ban.isValid(userIDBan)) {
			return null;
		}

		return userIDBan;
	}

	return null;
};

Ban.parseMinutesLeft = function(value) {
	if(utilities.isNonEmptyString(value)) {
		var formattedValue = value.trim().toLowerCase();

		if(formattedValue === "perm") {
			return -1;
		}

		var minutes = utilities.parseInteger(formattedValue);

		if(utilities.isInvalidNumber(minutes) || minutes < -1) {
			return null;
		}

		return minutes;
	}
	else if(Number.isInteger(value)) {
		if(utilities.isInvalidNumber(minutes) || minutes < -1) {
			return null;
		}

		return value;
	}

	return null;
};

Ban.prototype.isValid = function() {
	var self = this;

	return Number.isInteger(self.number) &&
		   self.number >= 0 &&
		   utilities.isNonEmptyString(self.key) &&
		   Number.isInteger(self.minutesLeft) &&
		   typeof self.reason === "string" &&
		   Number.isInteger(self.type) &&
		   banType.isValid(self.type);
};

Ban.isValid = function(ban) {
	return utilities.isObject(ban) &&
		   ban instanceof Ban &&
		   ban.isValid();
};

module.exports = Ban;
