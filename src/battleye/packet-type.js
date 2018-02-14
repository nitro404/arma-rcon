var validator = require("validator");
var utilities = require("extra-utilities");

var battlEyePacketType = { };

battlEyePacketType.invalid = {
	value: -1,
	name: "Invalid"
};

battlEyePacketType.login = {
	value: 0,
	name: "Login"
};

battlEyePacketType.command = {
	value: 1,
	name: "Command"
};

battlEyePacketType.serverMessage = {
	value: 2,
	name: "Server Message"
};

battlEyePacketType.types = [
	battlEyePacketType.login,
	battlEyePacketType.command,
	battlEyePacketType.serverMessage
];

battlEyePacketType.numberOfTypes = function() {
	return battlEyePacketType.types.length;
};

battlEyePacketType.getType = function(value) {
	if(utilities.isInvalid(value)) {
		return battlEyePacketType.invalid;
	}

	if(typeof value === "object") {
		var currentType = null;

		for(var i=0;i<battlEyePacketType.types.length;i++) {
			currentType = battlEyePacketType.types[i];

			if(currentType === value) {
				return currentType;
			}
		}

		return battlEyePacketType.invalid;
	}
	else if(Number.isInteger(value)) {
		if(value < 0 || value >= battlEyePacketType.numberOfTypes()) {
			return battlEyePacketType.invalid;
		}

		return battlEyePacketType.types[value];
	}
	else if(typeof value === "string") {
		var formattedType = value.trim();

		if(formattedType.length === 0) {
			return battlEyePacketType.invalid;
		}

		if(validator.isInt(formattedType)) {
			var typeValue = utilities.parseInteger(formattedType);

			if(isNaN(typeValue) || typeValue < 0 || typeValue >= battlEyePacketType.numberOfTypes()) {
				return battlEyePacketType.invalid;
			}

			return battlEyePacketType.types[typeValue];
		}

		var currentType = null;

		for(var i=0;i<battlEyePacketType.types.length;i++) {
			currentType = battlEyePacketType.types[i];

			if(currentType.id === formattedType || currentType.name.toLowerCase() === formattedType.toLowerCase()) {
				return currentType;
			}

			return battlEyePacketType.invalid;
		}
	}

	return battlEyePacketType.invalid;
};

battlEyePacketType.getID = function(value) {
	var formattedType = battlEyePacketType.getType(value);

	if(utilities.isValid(formattedType)) {
		return formattedType.id;
	}

	return battlEyePacketType.invalid.id;
};

battlEyePacketType.getName = function(value) {
	var formattedType = battlEyePacketType.getType(value);

	if(utilities.isValid(formattedType)) {
		return formattedType.name;
	}

	return battlEyePacketType.invalid.name;
};

battlEyePacketType.getValue = function(value) {
	var formattedType = battlEyePacketType.getType(value);

	if(utilities.isValid(formattedType)) {
		return formattedType.value;
	}

	return battlEyePacketType.invalid.value;
};

battlEyePacketType.isValid = function(value) {
	var formattedType = battlEyePacketType.getType(value);

	return utilities.isValid(formattedType);
};

module.exports = battlEyePacketType;
