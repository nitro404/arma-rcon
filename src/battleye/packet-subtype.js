"use strict";

var validator = require("validator");
var utilities = require("extra-utilities");

var battlEyePacketSubType = { };

battlEyePacketSubType.invalid = {
	id: "invalid",
	name: "Invalid",
	value: -1
};

battlEyePacketSubType.request = {
	id: "request",
	name: "Request",
	value: 0
};

battlEyePacketSubType.reply = {
	id: "reply",
	name: "Reply",
	value: 1
};

battlEyePacketSubType.splitReply = {
	id: "splitReply",
	name: "Split Reply",
	value: 2
};

battlEyePacketSubType.subTypes = [
	battlEyePacketSubType.request,
	battlEyePacketSubType.reply,
	battlEyePacketSubType.splitReply
];

battlEyePacketSubType.numberOfSubTypes = function() {
	return battlEyePacketSubType.subTypes.length;
};

battlEyePacketSubType.getSubType = function(value) {
	if(utilities.isInvalid(value)) {
		return battlEyePacketSubType.invalid;
	}

	if(typeof value === "object") {
		var currentSubType = null;

		for(var i = 0; i < battlEyePacketSubType.subTypes.length; i++) {
			currentSubType = battlEyePacketSubType.subTypes[i];

			if(currentSubType === value) {
				return currentSubType;
			}
		}

		return battlEyePacketSubType.invalid;
	}
	else if(Number.isInteger(value)) {
		if(value < 0 || value >= battlEyePacketSubType.numberOfSubTypes()) {
			return battlEyePacketSubType.invalid;
		}

		return battlEyePacketSubType.subTypes[value];
	}
	else if(typeof value === "string") {
		var formattedSubType = value.trim();

		if(formattedSubType.length === 0) {
			return battlEyePacketSubType.invalid;
		}

		if(validator.isInt(formattedSubType)) {
			var subTypeValue = utilities.parseInteger(formattedSubType);

			if(utilities.isInvalidNumber(subTypeValue) || subTypeValue < 0 || subTypeValue >= battlEyePacketSubType.numberOfSubTypes()) {
				return battlEyePacketSubType.invalid;
			}

			return battlEyePacketSubType.subTypes[subTypeValue];
		}

		var currentSubType = null;

		for(var i = 0; i < battlEyePacketSubType.subTypes.length; i++) {
			currentSubType = battlEyePacketSubType.subTypes[i];

			if(currentSubType.id === formattedSubType || currentSubType.name.toLowerCase() === formattedSubType.toLowerCase()) {
				return currentSubType;
			}

			return battlEyePacketSubType.invalid;
		}
	}

	return battlEyePacketSubType.invalid;
};

battlEyePacketSubType.getID = function(value) {
	var formattedSubType = battlEyePacketSubType.getSubType(value);

	if(utilities.isValid(formattedSubType)) {
		return formattedSubType.id;
	}

	return battlEyePacketSubType.invalid.id;
};

battlEyePacketSubType.getName = function(value) {
	var formattedSubType = battlEyePacketSubType.getSubType(value);

	if(utilities.isValid(formattedSubType)) {
		return formattedSubType.name;
	}

	return battlEyePacketSubType.invalid.name;
};

battlEyePacketSubType.getValue = function(value) {
	var formattedSubType = battlEyePacketSubType.getSubType(value);

	if(utilities.isValid(formattedSubType)) {
		return formattedSubType.value;
	}

	return battlEyePacketSubType.invalid.value;
};

battlEyePacketSubType.isValid = function(value) {
	var formattedSubType = battlEyePacketSubType.getSubType(value);

	return utilities.isValid(formattedSubType);
};

module.exports = battlEyePacketSubType;
