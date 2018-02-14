var async = require("async");
var schedule = require("node-schedule");
var utilities = require("extra-utilities");
var lockState = require("./lock-state");
var Player = require("./player");
var Ban = require("./ban");
var banType = require("./ban-type");
var battlEyePacketType = require("./battleye/packet-type");
var battlEyePacketSubType = require("./battleye/packet-subtype");
var BattlEyePacket = require("./battleye/packet");
var BattlEyeClient = require("./battleye/client");

var defaultHeartbeatFrequency = 30000;
var spacerRegExp = /^-+$/;
var banListHeaderRegExp = /^\s*\[#\]\s+\[(GUID|IP Address)\]\s+\[Minutes left\]\s+\[Reason\]\s*$/i;
var playerListHeaderRegExp = /^\s*\[#\]\s*\[IP Address\]\s*:\s*\[Port\]\s*\[Ping\]\s*\[GUID\]\s*\[Name\]\s*$/i;
var playersOnServerRegExp = /^\s*\((\d)+\s+players\s+in\s+total\)\s*$/i;
var userIDRegExp = /^\s*[0-9A-Z]+\s*$/i;
var ipAddressRegExp = /^\s*((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9]))\s*$/;

function ARMAServer(address, port) {
	var self = this;

	self.initialized = false;
	self.client = new BattlEyeClient(address, port);
	self.loggedIn = false;
	self.sequenceNumber = 0;
	self.messageCounter = 1;
	self.lockState = lockState.unknown.value;
	self.messages = [];
	self.missionsLoaded = false;
	self.missions = [];
	self.playersLoaded = false;
	self.players = [];
	self.bansLoaded = false;
	self.bans = {
		userID: [],
		ipAddress: []
	};
	self.heartbeatInterval = null;
	self.heartbeatFrequency = defaultHeartbeatFrequency;

	self.client.addConnectionListener(self);
	self.client.addMessageListener(self);
}

ARMAServer.prototype.isConnected = function() {
	var self = this;

	return self.client.connected;
};

ARMAServer.prototype.isDisconnected = function() {
	var self = this;

	return !self.client.connected;
};

ARMAServer.prototype.enableHeartbeat = function() {
	var self = this;

	if(!self.initialized || self.heartbeatInterval !== null) {
		return false;
	}

	self.heartbeatInterval = setInterval(
		function() {
			self.heartbeat(function() { });
		},
		self.heartbeatFrequency
	);

	return true;
};

ARMAServer.prototype.disableHeartbeat = function() {
	var self = this;

	if(self.heartbeatInterval === null) {
		return false;
	}

	clearInterval(self.heartbeatInterval);
	self.heartbeatInterval = null;

	return true;
};

ARMAServer.prototype.initialize = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	if(self.initialized) {
		return callback(new Error("Server already initialized!"));
	}

	return async.parallel(
		[
			function(callback) {
				return self.refreshMissionList(
					function(error, missions) {
						if(error) {
							return callback(error);
						}

						return callback();
					}
				);
			},
			function(callback) {
				return self.refreshPlayerList(
					function(error, players) {
						if(error) {
							return callback(error);
						}

						return callback();
					}
				);
			},
			function(callback) {
				return self.refreshBanList(
					function(error, bans) {
						if(error) {
							return callback(error);
						}

						return callback();
					}
				);
			}
		],
		function(error) {
			if(error) {
				return callback(error);
			}

			self.initialized = true;

			self.enableHeartbeat();

			return callback();
		}
	);
};

ARMAServer.prototype.uninitialize = function() {
	var self = this;

	if(!self.initialized) {
		return false;
	}

	self.initialized = false;

	self.clear();

	self.disableHeartbeat();

	return true;
};

ARMAServer.prototype.clear = function() {
	self.loggedIn = false;
	self.sequenceNumber = 0;
	self.messageCounter = 1;
	self.lockState = lockState.unknown.value;
	self.missionsLoaded = false;
	self.missions = [];
	self.playersLoaded = false;
	self.players = [];
	self.bansLoaded = false;
	self.bans = {
		userID: [],
		ipAddress: []
	};
};

ARMAServer.prototype.numberOfMessages = function(read) {
	var self = this;

	var formattedRead = utilities.parseBoolean(read);

	if(formattedRead === null) {
		return self.messages.length;
	}

	var messageCount = 0;

	for(var i=0;i<self.messages.length;i++) {
		if(self.messages[i].read === formattedRead) {
			messageCount++;
		}
	}

	return messageCount;
};

ARMAServer.prototype.numberOfUnreadMessages = function() {
	var self = this;

	return self.numberOfMessages(false);
};

ARMAServer.prototype.numberOfReadMessages = function() {
	var self = this;

	return self.numberOfMessages(true);
};

ARMAServer.prototype.hasMessage = function(message) {
	var self = this;

	if(message !== null && typeof message === "object") {
		for(var i=0;i<self.messages.length;i++) {
			if(self.messages[i] === message) {
				return true;
			}
		}

		return false;
	}
	else if(typeof message === "number" || typeof message === "string") {
		var messageID = utilities.parseInteger(message);

		if(isNaN(messageID) || messageID < 1) {
			return false;
		}

		for(var i=0;i<self.messages.length;i++) {
			if(self.messages[i].id === messageID) {
				return true;
			}
		}

		return false;
	}

	return false;
};

ARMAServer.prototype.indexOfMessage = function(message) {
	var self = this;

	if(message !== null && typeof message === "object") {
		for(var i=0;i<self.messages.length;i++) {
			if(self.messages[i] === message) {
				return i;
			}
		}

		return -1;
	}
	else if(typeof message === "number" || typeof message === "string") {
		var messageID = utilities.parseInteger(message);

		if(isNaN(messageID) || messageID < 1) {
			return -1;
		}

		for(var i=0;i<self.messages.length;i++) {
			if(self.messages[i].id === messageID) {
				return i;
			}
		}

		return -1;
	}

	return -1;
};

ARMAServer.prototype.getMessage = function(index) {
	var self = this;

	var formattedIndex = utilities.parseInteger(index);

	if(isNaN(formattedIndex) || formattedIndex < 0 || formattedIndex >= self.messages.length) {
		return null;
	}

	return self.messages[formattedIndex];
};

ARMAServer.prototype.getMessages = function(read, markRead) {
	var self = this;

	var formattedRead = utilities.parseBoolean(read);
	var formattedMarkRead = utilities.parseBoolean(markRead);

	if(formattedMarkRead === null) {
		formattedMarkRead = true;
	}

	var message = null;
	var filteredMessages = [];

	for(var i=0;i<self.messages.length;i++) {
		message = self.messages[i];

		if(message.read === formattedRead || formattedRead === null) {
			filteredMessages.push(utilities.clone(message));
		}

		if(formattedMarkRead) {
			message.read = true;
		}
	}

	return filteredMessages;
};

ARMAServer.prototype.getUnreadMessages = function(markRead) {
	var self = this;

	return self.getMessages(false, markRead);
};

ARMAServer.prototype.getReadMessages = function(markRead) {
	var self = this;

	return self.getMessages(false, markRead);
};

ARMAServer.prototype.hasMission = function(mission) {
	if(utilities.isEmptyString(mission)) {
		return false;
	}

	var formattedMissionName = mission.trim().toLowerCase();

	if(formattedMissionName.length === 0) {
		return false;
	}

	for(var i=0;i<self.missions.length;i++) {
		if(self.missions[i].toLowerCase() === formattedMissionName) {
			return true;
		}
	}

	return false;
};

ARMAServer.prototype.indexOfMission = function(mission) {
	if(utilities.isEmptyString(mission)) {
		return -1;
	}

	var formattedMissionName = mission.trim().toLowerCase();

	if(formattedMissionName.length === 0) {
		return -1;
	}

	for(var i=0;i<self.missions.length;i++) {
		if(self.missions[i].toLowerCase() === formattedMissionName) {
			return i;
		}
	}

	return -1;
};

ARMAServer.prototype.numberOfPlayers = function(player) {
	var self = this;

	return self.players.length;
};

ARMAServer.prototype.hasPlayer = function(player) {
	var self = this;

	if(player === null || player === undefined) {
		return false;
	}

	if(!(typeof player === "number" && player >= 0) && typeof player !== "object") {
		return false;
	}

	var currentPlayer = null;

	for(var i=0;i<self.players.length;i++) {
		currentPlayer = self.players[i];

		if(Number.isInteger(player)) {
			if(currentPlayer.number === player) {
				return true;
			}
		}
		else if(typeof player === "object") {
			if(currentPlayer === player) {
				return true;
			}
		}
	}

	return false;
};

ARMAServer.prototype.hasPlayerWithNumber = function(number) {
	var self = this;

	var formattedPlayerNumber = utilities.parseInteger(number);

	if(isNaN(formattedPlayerNumber) || formattedPlayerNumber < 0) {
		return false;
	}

	var currentPlayerNumber = null;

	for(var i=0;i<self.players.length;i++) {
		currentPlayerNumber = self.players[i].number;

		if(currentPlayerNumber === formattedPlayerNumber) {
			return true;
		}
	}

	return false;
};

ARMAServer.prototype.hasPlayerWithName = function(name) {
	var self = this;

	if(typeof name !== "string" || name.length === 0) {
		return false;
	}

	var currentPlayerName = null;

	for(var i=0;i<self.players.length;i++) {
		currentPlayerName = self.players[i].name;

		if(currentPlayerName === name) {
			return true;
		}
	}

	return false;
};

ARMAServer.prototype.hasPlayerWithUserID = function(userID) {
	var self = this;

	if(typeof userID !== "string" || userID.length === 0) {
		return false;
	}

	var formattedPlayerID = userID.trim().toLowerCase();
	var currentPlayerID = null;

	for(var i=0;i<self.players.length;i++) {
		currentPlayerID = self.players[i].id.toLowerCase();

		if(currentPlayerID === formattedPlayerID) {
			return true;
		}
	}

	return false;
};

ARMAServer.prototype.hasPlayerWithIPAddress = function(ipAddress) {
	var self = this;

	if(typeof ipAddress !== "string" || ipAddress.length === 0) {
		return false;
	}

	var currentPlayerIPAddress = null;

	for(var i=0;i<self.players.length;i++) {
		currentPlayerIPAddress = self.players[i].ipAddress;

		if(currentPlayerIPAddress === ipAddress) {
			return true;
		}
	}

	return false;
};

ARMAServer.prototype.indexOfPlayer = function(player) {
	var self = this;

	if(player === null || player === undefined) {
		return -1;
	}

	if(!(typeof player === "number" && player >= 0) && typeof player !== "object") {
		return -1;
	}

	var currentPlayer = null;

	for(var i=0;i<self.players.length;i++) {
		currentPlayer = self.players[i];

		if(Number.isInteger(player)) {
			if(currentPlayer.number === player) {
				return i;
			}
		}
		else if(typeof player === "object") {
			if(currentPlayer === player) {
				return i;
			}
		}
	}

	return -1;
};

ARMAServer.prototype.indexOfPlayerWithNumber = function(number) {
	var self = this;

	var formattedPlayerNumber = utilities.parseInteger(number);

	if(isNaN(formattedPlayerNumber) || formattedPlayerNumber < 0) {
		return -1;
	}

	var currentPlayerNumber = null;

	for(var i=0;i<self.players.length;i++) {
		currentPlayerNumber = self.players[i].number;

		if(currentPlayerNumber === formattedPlayerNumber) {
			return i;
		}
	}

	return -1;
};

ARMAServer.prototype.indexOfPlayerWithName = function(name) {
	var self = this;

	if(typeof name !== "string" || name.length === 0) {
		return -1;
	}

	var currentPlayerName = null;

	for(var i=0;i<self.players.length;i++) {
		currentPlayerName = self.players[i].name;

		if(currentPlayerName === name) {
			return i;
		}
	}

	return -1;
};

ARMAServer.prototype.indexOfPlayerWithUserID = function(userID) {
	var self = this;

	if(typeof userID !== "string" || userID.length === 0) {
		return -1;
	}

	var formattedPlayerID = userID.trim().toLowerCase();
	var currentPlayerID = null;

	for(var i=0;i<self.players.length;i++) {
		currentPlayerID = self.players[i].id.toLowerCase();

		if(currentPlayerID === formattedPlayerID) {
			return i;
		}
	}

	return -1;
};

ARMAServer.prototype.indexOfPlayerWithIPAddress = function(ipAddress) {
	var self = this;

	if(typeof ipAddress !== "string" || ipAddress.length === 0) {
		return -1;
	}

	var currentPlayerIPAddress = null;

	for(var i=0;i<self.players.length;i++) {
		currentPlayerIPAddress = self.players[i].ipAddress;

		if(currentPlayerIPAddress === ipAddress) {
			return i;
		}
	}

	return -1;
};

ARMAServer.prototype.getPlayer = function(index) {
	var self = this;

	if(player === null || player === undefined) {
		return null;
	}

	if(!(typeof player === "number" && player >= 0) && typeof player !== "object") {
		return null;
	}

	var currentPlayer = null;

	for(var i=0;i<self.players.length;i++) {
		currentPlayer = self.players[i];

		if(Number.isInteger(player)) {
			if(currentPlayer.number === player) {
				return currentPlayer;
			}
		}
		else if(typeof player === "object") {
			if(currentPlayer === player) {
				return currentPlayer;
			}
		}
	}

	return null;
};

ARMAServer.prototype.getPlayerWithNumber = function(number) {
	var self = this;

	var formattedPlayerNumber = utilities.parseInteger(number);

	if(isNaN(formattedPlayerNumber) || formattedPlayerNumber < 0) {
		return null;
	}

	var currentPlayer = null;

	for(var i=0;i<self.players.length;i++) {
		currentPlayer = self.players[i];

		if(currentPlayer.number === formattedPlayerNumber) {
			return currentPlayer;
		}
	}

	return null;
};

ARMAServer.prototype.getPlayerWithName = function(name) {
	var self = this;

	if(typeof name !== "string" || name.length === 0) {
		return null;
	}

	var currentPlayer = null;

	for(var i=0;i<self.players.length;i++) {
		currentPlayer = self.players[i];

		if(currentPlayer.name === name) {
			return currentPlayer;
		}
	}

	return null;
};

ARMAServer.prototype.getPlayerWithUserID = function(userID) {
	var self = this;

	if(typeof userID !== "string" || userID.length === 0) {
		return null;
	}

	var formattedPlayerID = userID.trim().toLowerCase();
	var currentPlayer = null;

	for(var i=0;i<self.players.length;i++) {
		currentPlayer = self.players[i];

		if(currentPlayer.id.toLowerCase() === formattedPlayerID) {
			return currentPlayer;
		}
	}

	return null;
};

ARMAServer.prototype.getPlayerWithIPAddress = function(ipAddress) {
	var self = this;

	if(typeof ipAddress !== "string" || ipAddress.length === 0) {
		return null;
	}

	var currentPlayer = null;

	for(var i=0;i<self.players.length;i++) {
		currentPlayer = self.players[i];

		if(currentPlayer.ipAddress === ipAddress) {
			return true;
		}
	}

	return null;
};

ARMAServer.prototype.requestPlayerList = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"players",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			var players = null;

			try {
				players = ARMAServer.parsePlayerList(packet.attributes.data, true);
			}
			catch(error) {
				return callback(error);
			}

			return callback(null, players, packet.attributes.data);
		}
	);
};

ARMAServer.prototype.refreshPlayerList = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.requestPlayerList(
		function(error, players, data) {
			if(error) {
				return callback(error);
			}

			var player = null;

			for(var i=0;i<players.length;i++) {
				player = players[i];

				if(!self.hasPlayerWithUserID(player.id)) {
					self.players.push(player);

					if(self.playersLoaded) {
						console.log("Player " + player.name + " connected!");
					}
				}
			}

			var hasPlayer = null;

			for(var i=0;i<self.players.length;i++) {
				player = self.players[i];
				hasPlayer = false;

				for(var j=0;j<players.length;j++) {
					if(player.id === players[j].id) {
						hasPlayer = true;
						break;
					}
				}

				if(!hasPlayer) {
					self.players.splice(i, 1);

					console.log("Player " + player.name + " disconnected.");
				}
			}

			self.playersLoaded = true;

			return callback(null, self.players);
		}
	);
};

ARMAServer.parsePlayerList = function(data, throwErrors) {
	if(utilities.isEmptyString(data)) {
		var error = new Error("Missing or invalid player list data.");

		if(throwErrors) {
			throw error;
		}

		console.error(error);

		return null;
	}

	var playerData = data.split(/\n/g);

	if(playerData.length === 0) {
		var error = new Error("Player data invalid or missing header.");

		if(throwErrors) {
			throw error;
		}

		console.error(error);

		return null;
	}

	var header = playerData[0];

	if(header !== "Players on server:") {
		var error = new Error("Invalid player data header: \"" + header + "\".");

		if(throwErrors) {
			throw error;
		}

		console.error(error);

		return null;
	}

	var line = null;
	var player = null;
	var players = [];

	for(var i=1;i<playerData.length;i++) {
		line = playerData[i].trim();

		if(line.length === 0 || line.match(spacerRegExp) || line.match(playerListHeaderRegExp) || line.match(playersOnServerRegExp)) {
			continue;
		}

		player = Player.parseFrom(line);

		if(player === null) {
			console.error("Failed to parse player information from data: " + line);

			continue;
		}

		players.push(player);
	}

	return players;
};

ARMAServer.prototype.numberOfUserIDBans = function() {
	var self = this;

	return self.bans.userID.length;
};

ARMAServer.prototype.numberOfIPAddressBans = function() {
	var self = this;

	return self.bans.ipAddress.length;
};

ARMAServer.prototype.totalNumberOfBans = function() {
	var self = this;

	return self.bans.userID.length + self.bans.ipAddress.length;
};

ARMAServer.prototype.hasBan = function(ban) {
	var self = this;

	if(typeof ban === "number") {
		return self.hasBanWithNumber(ban);
	}
	else if(typeof ban === "string") {
		if(validator.isInt(ban)) {
			return self.hasBanWithNumber(ban);
		}
		else if(ban.match(userIDRegExp)) {
			return self.hasUserIDBan(ban);
		}
		else if(ban.match(ipAddressRegExp)) {
			return self.hasIPAddressBan(ban);
		}
	}
	else if(ban !== null && typeof ban === "object") {
		return self.hasBanWithNumber(ban.number);
	}

	return false;
};

ARMAServer.prototype.hasUserIDBan = function(ban) {
	var self = this;

	if(ban === null || ban === undefined) {
		return false;
	}

	if(!(Number.isInteger(ban) && ban >= 0) && typeof ban !== "string" && typeof ban !== "object") {
		return false;
	}

	if(typeof ban === "string" && !ban.match(userIDRegExp)) {
		return false;
	}

	var currentBan = null;

	for(var i=0;i<self.bans.userID.length;i++) {
		currentBan = self.bans.userID[i];

		if(Number.isInteger(ban)) {
			if(currentBan.number === ban) {
				return true;
			}
		}
		else if(typeof ban === "string") {
			if(currentBan.key === ban) {
				return true;
			}
		}
		else if(typeof ban === "object") {
			if(currentBan.number === ban.number) {
				return true;
			}
		}
	}

	return false;
};

ARMAServer.prototype.hasIPAddressBan = function(ban) {
	var self = this;

	if(ban === null || ban === undefined) {
		return false;
	}

	if(!(Number.isInteger(ban) && ban >= 0) && typeof ban !== "string" && typeof ban !== "object") {
		return false;
	}

	if(typeof ban === "string" && !ban.match(ipAddressRegExp)) {
		return false;
	}

	var currentBan = null;

	for(var i=0;i<self.bans.ipAddress.length;i++) {
		currentBan = self.bans.ipAddress[i];

		if(Number.isInteger(ban)) {
			if(currentBan.number === ban) {
				return true;
			}
		}
		else if(typeof ban === "string") {
			if(currentBan.key === ban) {
				return true;
			}
		}
		else if(typeof ban === "object") {
			if(currentBan.number === ban.number) {
				return true;
			}
		}
	}

	return false;
};

ARMAServer.prototype.hasBanWithNumber = function(number) {
	var self = this;

	var formattedBanNumber = utilities.parseInteger(number);

	if(isNaN(formattedBanNumber) || formattedBanNumber < 0) {
		return false;
	}

	var currentBanNumber = null;

	for(var i=0;i<self.bans.userID.length;i++) {
		currentBanNumber = self.bans.userID[i].number;

		if(currentBanNumber === formattedBanNumber) {
			return true;
		}
	}

	for(var i=0;i<self.bans.ipAddress.length;i++) {
		currentBanNumber = self.bans.ipAddress[i].number;

		if(currentBanNumber === formattedBanNumber) {
			return true;
		}
	}

	return false;
};

ARMAServer.prototype.hasUserIDBanWithNumber = function(number) {
	var self = this;

	var formattedBanNumber = utilities.parseInteger(number);

	if(isNaN(formattedBanNumber) || formattedBanNumber < 0) {
		return false;
	}

	var currentBanNumber = null;

	for(var i=0;i<self.bans.userID.length;i++) {
		currentBanNumber = self.bans.userID[i].number;

		if(currentBanNumber === formattedBanNumber) {
			return true;
		}
	}

	return false;
};

ARMAServer.prototype.hasIPAddressBanWithNumber = function(number) {
	var self = this;

	var formattedBanNumber = utilities.parseInteger(number);

	if(isNaN(formattedBanNumber) || formattedBanNumber < 0) {
		return false;
	}

	var currentBanNumber = null;

	for(var i=0;i<self.bans.ipAddress.length;i++) {
		currentBanNumber = self.bans.ipAddress[i].number;

		if(currentBanNumber === formattedBanNumber) {
			return true;
		}
	}

	return false;
};

ARMAServer.prototype.indexOfBan = function(ban) {
	var self = this;

	if(typeof ban === "number") {
		return self.indexOfBanWithNumber(ban);
	}
	else if(typeof ban === "string") {
		if(validator.isInt(ban)) {
			return self.indexOfBanWithNumber(ban);
		}
		else if(ban.match(userIDRegExp)) {
			return self.indexOfUserIDBan(ban);
		}
		else if(ban.match(ipAddressRegExp)) {
			return self.indexOfIPAddressBan(ban);
		}
	}
	else if(ban !== null && typeof ban === "object") {
		return self.indexOfBanWithNumber(ban.number);
	}

	return -1;
};

ARMAServer.prototype.indexOfUserIDBan = function(ban) {
	var self = this;

	if(ban === null || ban === undefined) {
		return -1;
	}

	if(!(Number.isInteger(ban) && ban >= 0) && typeof ban !== "string" && typeof ban !== "object") {
		return -1;
	}

	if(typeof ban === "string" && !ban.match(userIDRegExp)) {
		return -1;
	}

	var currentBan = null;

	for(var i=0;i<self.bans.userID.length;i++) {
		currentBan = self.bans.userID[i];

		if(Number.isInteger(ban)) {
			if(currentBan.number === ban) {
				return i;
			}
		}
		else if(typeof ban === "string") {
			if(currentBan.key === ban) {
				return i;
			}
		}
		else if(typeof ban === "object") {
			if(currentBan.number === ban.number) {
				return i;
			}
		}
	}

	return false;
};

ARMAServer.prototype.indexOfIPAddressBan = function(ban) {
	var self = this;

	if(ban === null || ban === undefined) {
		return -1;
	}

	if(!(Number.isInteger(ban) && ban >= 0) && typeof ban !== "string" && typeof ban !== "object") {
		return -1;
	}

	if(typeof ban === "string" && !ban.match(ipAddressRegExp)) {
		return -1;
	}

	var currentBan = null;

	for(var i=0;i<self.bans.ipAddress.length;i++) {
		currentBan = self.bans.ipAddress[i];

		if(Number.isInteger(ban)) {
			if(currentBan.number === ban) {
				return i;
			}
		}
		else if(typeof ban === "string") {
			if(currentBan.key === ban) {
				return i;
			}
		}
		else if(typeof ban === "object") {
			if(currentBan.number === ban.number) {
				return i;
			}
		}
	}

	return -1;
};

ARMAServer.prototype.indexOfBanWithNumber = function(number) {
	var self = this;

	var formattedBanNumber = utilities.parseInteger(number);

	if(isNaN(formattedBanNumber) || formattedBanNumber < 0) {
		return -1;
	}

	var currentBanNumber = null;

	for(var i=0;i<self.bans.userID.length;i++) {
		currentBanNumber = self.bans.userID[i].number;

		if(currentBanNumber === formattedBanNumber) {
			return i;
		}
	}

	for(var i=0;i<self.bans.ipAddress.length;i++) {
		currentBanNumber = self.bans.ipAddress[i].number;

		if(currentBanNumber === formattedBanNumber) {
			return i;
		}
	}

	return -1;
};

ARMAServer.prototype.indexOfUserIDBanWithNumber = function(number) {
	var self = this;

	var formattedBanNumber = utilities.parseInteger(number);

	if(isNaN(formattedBanNumber) || formattedBanNumber < 0) {
		return -1;
	}

	var currentBanNumber = null;

	for(var i=0;i<self.bans.userID.length;i++) {
		currentBanNumber = self.bans.userID[i].number;

		if(currentBanNumber === formattedBanNumber) {
			return i;
		}
	}

	return -1;
};

ARMAServer.prototype.indexOfIPAddressBanWithNumber = function(number) {
	var self = this;

	var formattedBanNumber = utilities.parseInteger(number);

	if(isNaN(formattedBanNumber) || formattedBanNumber < 0) {
		return -1;
	}

	var currentBanNumber = null;

	for(var i=0;i<self.bans.ipAddress.length;i++) {
		currentBanNumber = self.bans.ipAddress[i].number;

		if(currentBanNumber === formattedBanNumber) {
			return i;
		}
	}

	return -1;
};

ARMAServer.prototype.getBan = function(ban) {
	var self = this;

	if(typeof ban === "number") {
		return self.getBanWithNumber(ban);
	}
	else if(typeof ban === "string") {
		if(validator.isInt(ban)) {
			return self.getBanWithNumber(ban);
		}
		else if(ban.match(userIDRegExp)) {
			return self.getUserIDBan(ban);
		}
		else if(ban.match(ipAddressRegExp)) {
			return self.getIPAddressBan(ban);
		}
	}
	else if(ban !== null && typeof ban === "object") {
		return self.getBanWithNumber(ban.number);
	}

	return null;
};

ARMAServer.prototype.getUserIDBan = function(ban) {
	var self = this;

	if(ban === null || ban === undefined) {
		return null;
	}

	if(!(Number.isInteger(ban) && ban >= 0) && typeof ban !== "string" && typeof ban !== "object") {
		return null;
	}

	if(typeof ban === "string" && !ban.match(userIDRegExp)) {
		return null;
	}

	var currentBan = null;

	for(var i=0;i<self.bans.userID.length;i++) {
		currentBan = self.bans.userID[i];

		if(Number.isInteger(ban)) {
			if(currentBan.number === ban) {
				return currentBan;
			}
		}
		else if(typeof ban === "string") {
			if(currentBan.key === ban) {
				return currentBan;
			}
		}
		else if(typeof ban === "object") {
			if(currentBan.number === ban.number) {
				return currentBan;
			}
		}
	}

	return null;
};

ARMAServer.prototype.getIPAddressBan = function(ban) {
	var self = this;

	if(ban === null || ban === undefined) {
		return null;
	}

	if(!(Number.isInteger(ban) && ban >= 0) && typeof ban !== "string" && typeof ban !== "object") {
		return null;
	}

	if(typeof ban === "string" && !ban.match(ipAddressRegExp)) {
		return null;
	}

	var currentBan = null;

	for(var i=0;i<self.bans.ipAddress.length;i++) {
		currentBan = self.bans.ipAddress[i];

		if(Number.isInteger(ban)) {
			if(currentBan.number === ban) {
				return currentBan;
			}
		}
		else if(typeof ban === "string") {
			if(currentBan.key === ban) {
				return currentBan;
			}
		}
		else if(typeof ban === "object") {
			if(currentBan.number === ban.number) {
				return currentBan;
			}
		}
	}

	return null;
};

ARMAServer.prototype.getBanWithNumber = function(number) {
	var self = this;

	var formattedBanNumber = utilities.parseInteger(number);

	if(isNaN(formattedBanNumber) || formattedBanNumber < 0) {
		return null;
	}

	var currentBan = null;

	for(var i=0;i<self.bans.userID.length;i++) {
		currentBan = self.bans.userID[i];

		if(currentBan.number === formattedBanNumber) {
			return currentBan;
		}
	}

	for(var i=0;i<self.bans.ipAddress.length;i++) {
		currentBan = self.bans.ipAddress[i];

		if(currentBan.number === formattedBanNumber) {
			return currentBan;
		}
	}

	return null;
};

ARMAServer.prototype.getUserIDBanWithNumber = function(number) {
	var self = this;

	var formattedBanNumber = utilities.parseInteger(number);

	if(isNaN(formattedBanNumber) || formattedBanNumber < 0) {
		return null;
	}

	var currentBan = null;

	for(var i=0;i<self.bans.userID.length;i++) {
		currentBan = self.bans.userID[i];

		if(currentBan.number === formattedBanNumber) {
			return currentBan;
		}
	}

	return null;
};

ARMAServer.prototype.getIPAddressBanWithNumber = function(number) {
	var self = this;

	var formattedBanNumber = utilities.parseInteger(number);

	if(isNaN(formattedBanNumber) || formattedBanNumber < 0) {
		return null;
	}

	var currentBan = null;

	for(var i=0;i<self.bans.ipAddress.length;i++) {
		currentBan = self.bans.ipAddress[i];

		if(currentBan.number === formattedBanNumber) {
			return currentBan;
		}
	}

	return null;
};

ARMAServer.prototype.getAllBans = function(merge) {
	var self = this;

	var formattedMerge = utilities.parseBoolean(merge);

	if(formattedMerge === null) {
		formattedMerge = true;
	}

	if(!formattedMerge) {
		return self.bans;
	}

	return [].concat(self.bans.userID, self.bans.ipAddress);
};

ARMAServer.prototype.numberOfMissions = function() {
	var self = this;

	return self.missions.length;
};

ARMAServer.prototype.hasMission = function(mission) {
	var self = this;

	if(utilities.isEmptyString(mission)) {
		return false;
	}

	var formattedMission = mission.trim();

	if(formattedMission.length === 0) {
		return false;
	}

	for(var i=0;i<self.missions.length;i++) {
		if(self.missions[i] === formattedMission) {
			return true;
		}
	}

	return false;
};

ARMAServer.prototype.indexOfMission = function(mission) {
	var self = this;

	if(utilities.isEmptyString(mission)) {
		return -1;
	}

	var formattedMission = mission.trim();

	if(formattedMission.length === 0) {
		return -1;
	}

	for(var i=0;i<self.missions.length;i++) {
		if(self.missions[i] === formattedMission) {
			return i;
		}
	}

	return -1;
};

ARMAServer.prototype.getMission = function(index) {
	var self = this;

	var formattedIndex = utilities.parseInteger(index);

	if(isNaN(index) || index < 0 || index >= self.missions.length) {
		return null;
	}

	return self.missions[formattedIndex];
};

ARMAServer.prototype.requestMissionList = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"missions",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			var missions = null;

			try {
				missions = ARMAServer.parseMissionList(packet.attributes.data, true);
			}
			catch(error) {
				return callback(error);
			}

			return callback(null, missions, packet.attributes.data);
		}
	);
};

ARMAServer.prototype.refreshMissionList = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.requestMissionList(
		function(error, missions, data) {
			if(error) {
				return callback(error);
			}

			self.missions.length = 0;

			for(var i=0;i<missions.length;i++) {
				self.missions.push(missions[i]);
			}

			self.missionsLoaded = true;

			return callback(null, self.missions);
		}
	);
};

ARMAServer.parseMissionList = function(data, throwErrors) {
	if(utilities.isEmptyString(data)) {
		var error = new Error("Missing or invalid mission list data.");

		if(throwErrors) {
			throw error;
		}

		console.error(error);

		return null;
	}

	var missionData = data.split(/\n/g);

	if(missionData.length === 0) {
		var error = new Error("Mission data invalid or missing header.");

		if(throwErrors) {
			throw error;
		}

		console.error(error);

		return null;
	}

	var header = missionData[0];

	if(header !== "Missions on server:") {
		var error = new Error("Invalid mission data header: \"" + header + "\".");

		if(throwErrors) {
			throw error;
		}

		console.error(error);

		return null;
	}

	var missionName = null;
	var missions = [];

	for(var i=1;i<missionData.length;i++) {
		missionName = missionData[i].trim();

		if(missionName.length === 0) {
			continue;
		}

		missions.push(missionName);
	}

	return missions;
};

ARMAServer.prototype.loadMission = function(mission, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	var formattedMission = null;

	if(typeof mission === "number") {
		formattedMission = self.getMission(mission);

		if(formattedMission === null) {
			var error = new Error("Mission index invalid or out of bounds.");
			error.status = 400;
			return callback(error);
		}
	}
	else if(typeof mission === "string") {
		formattedMission = mission.trim();

		if(!self.hasMission(formattedMission)) {
			var error = new Error("Mission with file name: \"" + formattedMission + "\" not found.");
			error.status = 400;
			return callback(error);
		}
	}
	else {
		var error = new Error("Cannot load invalid mission type.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"#mission " + formattedMission,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.nextSequenceNumber = function() {
	var self = this;

	if(self.sequenceNumber > 255) {
		self.sequenceNumber = -1;
	}

	return self.sequenceNumber++;
}

ARMAServer.prototype.login = function(password, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	if(typeof password !== "string") {
		var error = new Error("Missing or invalid password data type.");
		error.status = 400;
		return callback(error);
	}

	return self.client.sendPacket(
		new BattlEyePacket(
			battlEyePacketType.login,
			battlEyePacketSubType.request,
			{
				password: password
			}
		),
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			self.loggedIn = packet.attributes.result === 1;

			if(self.loggedIn) {
				return self.initialize(
					function(error) {
						if(error) {
							return callback(error);
						}

						return callback(null, true);
					}
				);
			}

			return callback(null, false);
		}
	);
};

ARMAServer.prototype.logout = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"logout",
		function(error, packet, bytesSent) {
			self.loggedIn = false;

			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.exit = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"exit",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.sendCommand = function(command, callback) {
	var self = this;

	if(utilities.isFunction(command)) {
		callback = command;
		command = null;
	}

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	if(!self.loggedIn) {
		var error = new Error("Not logged in!");
		error.status = 401;
		return callback(error);
	}

	return self.client.sendPacket(
		new BattlEyePacket(
			battlEyePacketType.command,
			battlEyePacketSubType.request,
			{
				sequence: self.nextSequenceNumber(),
				command: command
			}
		),
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback(null, packet, bytesSent);
		}
	);
};

ARMAServer.prototype.heartbeat = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.globalMessage = function(message, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	if(utilities.isEmptyString(message)) {
		return callback(null, null, 0);
	}

	return self.sendCommand(
		"say -1 " + message,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback(null, packet, bytesSent);
		}
	);
};

ARMAServer.prototype.privateMessage = function(playerNumber, message, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	if(utilities.isEmptyString(message)) {
		return callback(null, false);
	}

	var formattedPlayerNumber = utilities.parseInteger(playerNumber);

	if(isNaN(formattedPlayerNumber) || playerNumber < 0) {
		var error = new Error("Invalid player number: " + playerNumber);
		error.status = 400;
		return callback(error);
	}

	if(!self.hasPlayerWithNumber(formattedPlayerNumber)) {
		var error = new Error("Player #" + formattedPlayerNumber + " not found.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"say " + formattedPlayerNumber + " " + message,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback(null, true);
		}
	);
};

ARMAServer.prototype.restartMission = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#restart",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.reassignPlayers = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#reassign",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.reloadServerConfiguration = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#reload",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.loadScripts = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"loadScripts",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.loadBans = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"loadBans",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.clelearExpiredBans = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"writeBans",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.requestBanList = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"bans",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			var bans = null;

			try {
				bans = ARMAServer.parseBanList(packet.attributes.data, true);
			}
			catch(error) {
				return callback(error);
			}

			return callback(null, bans, packet.attributes.data);
		}
	);
};

ARMAServer.prototype.refreshBanList = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.requestBanList(
		function(error, bans, data) {
			if(error) {
				return callback(error);
			}

			var type = null;
			var localBans = null;
			var newBans = null;

			for(var i=0;i<banType.numberOfBanTypes();i++) {
				type = banType.banTypes[i];
				localBans = self.bans[type.id];
				newBans = bans[type.id];

				localBans.length = 0;

				for(var j=0;j<newBans.length;j++) {
					localBans.push(newBans[j]);
				}
			}

			self.bansLoaded = true;

			return callback(null, self.bans);
		}
	);
};

ARMAServer.parseBanList = function(data, throwErrors) {
	if(utilities.isEmptyString(data)) {
		var error = new Error("Missing or invalid ban list data.");

		if(throwErrors) {
			throw error;
		}

		console.error(error);

		return null;
	}

	var banData = data.split(/\n/g);

	if(banData.length === 0) {
		var error = new Error("Ban data invalid or missing header.");

		if(throwErrors) {
			throw error;
		}

		console.error(error);

		return null;
	}

	var line = null;
	var type = null;
	var ban = null;
	var bans = {
		userID: [],
		ipAddress: []
	};

	for(var i=0;i<banData.length;i++) {
		line = banData[i].trim();

		if(line.length === 0 || line.match(spacerRegExp) || line.match(banListHeaderRegExp)) {
			continue;
		}

		if(line === "GUID Bans:") {
			type = banType.userID;
			continue;
		}
		else if(line === "IP Bans:") {
			type = banType.ipAddress;
			continue;
		}

		if(type !== null) {
			ban = Ban.parseFrom(line, type);

			if(ban === null) {
				console.error("Failed to parse " + type.name + " ban: " + line);

				continue;
			}

			bans[type.id].push(ban);
		}
	}

	return bans;
};

ARMAServer.prototype.kickPlayer = function(player, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	var player = self.getPlayer(player);

	if(player === null) {
		var error = new Error("Player not found.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"kick " + player.number,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.banPlayer = function(player, minutes, reason, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	var player = self.getPlayer(player);

	if(player === null) {
		var error = new Error("Player not found.");
		error.status = 400;
		return callback(error);
	}

	var formattedMinutes = utilities.parseInteger(minutes);

	if(isNaN(formattedMinutes)) {
		var error = new Error("Missing or invalid ban duration, expected integer.");
		error.status = 400;
		return callback(error);
	}

	if(utilities.isEmptyString(reason)) {
		var error = new Error("Missing or invalid ban reason, non-empty string required.");
		error.status = 400;
		return callback(error);
	}

	var formattedReason = reason.trim();

	if(formattedReason.length === 0) {
		var error = new Error("Ban reason cannot be empty.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"ban " + player.number + " " + (formattedMinutes < 0 ? "perm" : formattedMinutes) + " " + formattedReason,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.addPlayerBan = function(playerID, minutes, reason, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	if(utilities.isEmptyString(playerID)) {
		var error = new Error("Missing or invalid player id.");
		error.status = 400;
		return callback(error);
	}

	var formattedPlayerID = playerID.trim();

	if(formattedPlayerID.length === 0) {
		var error = new Error("Player id cannot be empty.");
		error.status = 400;
		return callback(error);
	}

	var formattedMinutes = utilities.parseInteger(minutes);

	if(isNaN(formattedMinutes)) {
		var error = new Error("Missing or invalid ban duration, expected integer.");
		error.status = 400;
		return callback(error);
	}

	if(utilities.isEmptyString(reason)) {
		var error = new Error("Missing or invalid ban reason, non-empty string required.");
		error.status = 400;
		return callback(error);
	}

	var formattedReason = reason.trim();

	if(formattedReason.length === 0) {
		var error = new Error("Ban reason cannot be empty.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"addBan " + formattedPlayerID + " " + (formattedMinutes < 0 ? "perm" : formattedMinutes) + " " + formattedReason,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.removePlayerBan = function(ban, minutes, reason, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	var banToRemove = self.getBan(ban);

	if(banToRemove === null) {
		var error = new Error("Ban not found.");
		error.status = 400;
		return callbaack(error);
	}

	return self.sendCommand(
		"removeBan " + ban.number,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.setRemoteConsolePassword = function(password, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	if(utilities.isEmptyString(password)) {
		var error = new Error("Missing or invalid password.");
		error.status = 400;
		return callback(error);
	}

	var formattedPassword = password.trim();

	if(formattedPassword.length === 0) {
		var error = new Error("Password cannot be empty.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"RConPassword " + formattedPassword,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.setMaxPing = function(maxPing, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	var formattedMaxPing = utilities.parseInteger(maxPing);

	if(isNaN(formattedMaxPing) || formattedMaxPing < 0) {
		var error = new Error("Missing or invalid max ping value.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"MaxPing " + formattedMaxPing,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.lock = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#lock",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			self.lockState = lockState.locked.value;

			return callback();
		}
	);
};

ARMAServer.prototype.unlock = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#unlock",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			self.lockState = lockState.unlocked.value;

			return callback();
		}
	);
};

ARMAServer.prototype.shutdown = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#shutdown",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			self.lockState = lockState.unlocked.value;

			return callback();
		}
	);
};

ARMAServer.prototype.startMonitor = function(intervalSeconds, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	var formattedIntervalSeconds = utilities.parseInteger(intervalSeconds);

	if(isNaN(formattedIntervalSeconds) || formattedIntervalSeconds <= 0) {
		var error = new Error("Monitor interval must be a positive integer.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"#monitor " + formattedIntervalSeconds,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.stopMonitor = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#monitor 0",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugOn = function(intervalSeconds, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	var formattedIntervalSeconds = utilities.parseInteger(intervalSeconds);

	if(isNaN(formattedIntervalSeconds) || formattedIntervalSeconds <= 0) {
		var error = new Error("Monitor interval must be a positive integer.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"#debug " + formattedIntervalSeconds,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugOff = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#debug off",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugCheckFileOn = function(fileName, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	if(utilities.isEmptyString(fileName)) {
		var error = new Error("Missing or invalid file name.");
		error.status = 400;
		return callback(error);
	}

	var formattedFileName = fileName.trim();

	if(formattedFileName.length === 0) {
		var error = new Error("File name cannot be empty.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"#debug checkFile " + formattedFileName,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugCheckFileOff = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#debug checkFile off",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugUserSentOn = function(userName, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	if(utilities.isEmptyString(userName)) {
		var error = new Error("Missing or invalid user name.");
		error.status = 400;
		return callback(error);
	}

	var formattedUserName = userName.trim();

	if(formattedUserName.length === 0) {
		var error = new Error("User name cannot be empty.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"#debug userSent " + formattedUserName,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugUserSentOff = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#debug userSent off",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugUserInfoOn = function(userName, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	if(utilities.isEmptyString(userName)) {
		var error = new Error("Missing or invalid user name.");
		error.status = 400;
		return callback(error);
	}

	var formattedUserName = userName.trim();

	if(formattedUserName.length === 0) {
		var error = new Error("User name cannot be empty.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"#debug userInfo " + formattedUserName,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugUserInfoOff = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#debug userInfo off",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugUserQueueOn = function(userName, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	if(utilities.isEmptyString(userName)) {
		var error = new Error("Missing or invalid user name.");
		error.status = 400;
		return callback(error);
	}

	var formattedUserName = userName.trim();

	if(formattedUserName.length === 0) {
		var error = new Error("User name cannot be empty.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"#debug userQueue " + formattedUserName,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugUserQueueOff = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#debug userQueue off",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugJIPQueueOn = function(userName, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	if(utilities.isEmptyString(userName)) {
		var error = new Error("Missing or invalid user name.");
		error.status = 400;
		return callback(error);
	}

	var formattedUserName = userName.trim();

	if(formattedUserName.length === 0) {
		var error = new Error("User name cannot be empty.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"#debug JIPQueue " + formattedUserName,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugJIPQueueOff = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#debug JIPQueue off",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugTotalSentOn = function(value, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	var formattedValue = utilities.parseInteger(value);

	if(formattedValue < 0) {
		var error = new Error("Value must be a positive non-zero integer.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"#debug totalSent " + formattedValue,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugTotalSentOff = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#debug totalSent off",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugConsole = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#debug console",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.debugVON = function(callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	return self.sendCommand(
		"#debug von",
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.exec = function(command, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	if(utilities.isEmptyString(command)) {
		var error = new Error("Missing or invalid command.");
		error.status = 400;
		return callback(error);
	}

	var formattedCommand = command.trim();

	if(formattedCommand.length === 0) {
		var error = new Error("Command cannot be empty.");
		error.status = 400;
		return callback(error);
	}

	return self.sendCommand(
		"#exec " + formattedCommand,
		function(error, packet, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback();
		}
	);
};

ARMAServer.prototype.onConnect = function() {
	var self = this;
};

ARMAServer.prototype.onDisconnect = function(reason) {
	var self = this;

	self.uninitialize();
};

ARMAServer.prototype.onMessageReceived = function(message) {
	var self = this;

	if(utilities.isEmptyString(message)) {
		return;
	}

	self.messages.push({
		id: self.messageCounter++,
		text: message,
		read: false,
		received: new Date()
	});
};

module.exports = ARMAServer;
