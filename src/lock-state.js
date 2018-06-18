"use strict";

var validator = require("validator");
var utilities = require("extra-utilities");

var lockState = { };

lockState.invalid = {
	id: "invalid",
	name: "Invalid",
	value: -1
};

lockState.unknown = {
	id: "unknown",
	name: "Unknown",
	value: 0
};

lockState.locked = {
	id: "locked",
	name: "Locked",
	value: 1
};

lockState.unlocked = {
	id: "unlocked",
	name: "Unlocked",
	value: 2
};

lockState.lockStates = [
	lockState.unknown,
	lockState.locked,
	lockState.unlocked
];

lockState.numberOfLockStates = function() {
	return lockState.lockStates.length;
};

lockState.getLockState = function(value) {
	if(utilities.isInvalid(value)) {
		return lockState.invalid;
	}

	if(typeof value === "object") {
		var currentLockState = null;

		for(var i = 0; i < lockState.lockStates.length; i++) {
			currentLockState = lockState.lockStates[i];

			if(currentLockState === value) {
				return currentLockState;
			}
		}

		return lockState.invalid;
	}
	else if(Number.isInteger(value)) {
		if(value < 0 || value >= lockState.numberOfLockStates()) {
			return lockState.invalid;
		}

		return lockState.lockStates[value];
	}
	else if(typeof value === "string") {
		var formattedLockState = value.trim();

		if(formattedLockState.length === 0) {
			return lockState.invalid;
		}

		if(validator.isInt(formattedLockState)) {
			var lockStateValue = utilities.parseInteger(formattedLockState);

			if(utilities.isInvalidNumber(lockStateValue) || lockStateValue < 0 || lockStateValue >= lockState.numberOfLockStates()) {
				return lockState.invalid;
			}

			return lockState.lockStates[lockStateValue];
		}

		var currentLockState = null;

		for(var i = 0; i < lockState.lockStates.length; i++) {
			currentLockState = lockState.lockStates[i];

			if(currentLockState.id === formattedLockState || currentLockState.name.toLowerCase() === formattedLockState.toLowerCase()) {
				return currentLockState;
			}

			return lockState.invalid;
		}
	}

	return lockState.invalid;
};

lockState.getID = function(value) {
	var formattedLockState = lockState.getLockState(value);

	if(utilities.isValid(formattedLockState)) {
		return formattedLockState.id;
	}

	return lockState.invalid.id;
};

lockState.getName = function(value) {
	var formattedLockState = lockState.getLockState(value);

	if(utilities.isValid(formattedLockState)) {
		return formattedLockState.name;
	}

	return lockState.invalid.name;
};

lockState.getValue = function(value) {
	var formattedLockState = lockState.getLockState(value);

	if(utilities.isValid(formattedLockState)) {
		return formattedLockState.value;
	}

	return lockState.invalid.value;
};

lockState.isValid = function(value) {
	var formattedLockState = lockState.getLockState(value);

	return utilities.isValid(formattedLockState);
};

module.exports = lockState;
