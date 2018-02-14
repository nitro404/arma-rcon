var validator = require("validator");
var utilities = require("extra-utilities");

var banType = { };

banType.invalid = {
	id: "invalid",
	name: "Invalid",
	value: -1
};

banType.userID = {
	id: "userID",
	name: "User ID",
	value: 0
};

banType.ipAddress = {
	id: "ipAddress",
	name: "IP Address",
	value: 1
};

banType.banTypes = [
	banType.userID,
	banType.ipAddress
];

banType.numberOfBanTypes = function() {
	return banType.banTypes.length;
};

banType.getBanType = function(value) {
	if(utilities.isInvalid(value)) {
		return banType.invalid;
	}

	if(typeof value === "object") {
		var currentBanType = null;

		for(var i=0;i<banType.banTypes.length;i++) {
			currentBanType = banType.banTypes[i];

			if(currentBanType === value) {
				return currentBanType;
			}
		}

		return banType.invalid;
	}
	else if(Number.isInteger(value)) {
		if(value < 0 || value >= banType.numberOfBanTypes()) {
			return banType.invalid;
		}

		return banType.banTypes[value];
	}
	else if(typeof value === "string") {
		var formattedBanType = value.trim();

		if(formattedBanType.length === 0) {
			return banType.invalid;
		}

		if(validator.isInt(formattedBanType)) {
			var banTypeValue = utilities.parseInteger(formattedBanType);

			if(isNaN(banTypeValue) || banTypeValue < 0 || banTypeValue >= banType.numberOfBanTypes()) {
				return banType.invalid;
			}

			return banType.banTypes[banTypeValue];
		}

		var currentBanType = null;

		for(var i=0;i<banType.banTypes.length;i++) {
			currentBanType = banType.banTypes[i];

			if(currentBanType.id === formattedBanType || currentBanType.name.toLowerCase() === formattedBanType.toLowerCase()) {
				return currentBanType;
			}

			return banType.invalid;
		}
	}

	return banType.invalid;
};

banType.getID = function(value) {
	var formattedBanType = banType.getBanType(value);

	if(utilities.isValid(formattedBanType)) {
		return formattedBanType.id;
	}

	return banType.invalid.id;
};

banType.getName = function(value) {
	var formattedBanType = banType.getBanType(value);

	if(utilities.isValid(formattedBanType)) {
		return formattedBanType.name;
	}

	return banType.invalid.name;
};

banType.getValue = function(value) {
	var formattedBanType = banType.getBanType(value);

	if(utilities.isValid(formattedBanType)) {
		return formattedBanType.value;
	}

	return banType.invalid.value;
};

banType.isValid = function(value) {
	var formattedBanType = banType.getBanType(value);

	return utilities.isValid(formattedBanType);
};

module.exports = banType;
