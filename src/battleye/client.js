"use strict";

var dgram = require("dgram");
var async = require("async");
var moment = require("moment");
var schedule = require("node-schedule");
var utilities = require("extra-utilities");
var battlEyePacketType = require("./packet-type");
var battlEyePacketSubType = require("./packet-subtype");
var BattlEyePacket = require("./packet");

function BattlEyeClient(address, port) {
	var self = this;

	self.socket = dgram.createSocket("udp4", self.receivePacket.bind(self));
//	self.socket.unref(); // determines if process should be terminated or kept alive while socket is active if nothing else is executing
	self.connected = false;
	self.address = address;
	self.port = port;
	self.packetsSent = 0;
	self.packetsReceived = 0;
	self.corruptedPacketsReceived = 0;
	self.packetResendFrequency = 2000;
	self.packetResendCheckFrequency = 100;
	self.packetResendCount = 4;
	self.outgoingPacketCache = [];
	self.connectionListeners = [];
	self.messageListeners = [];

	self.packetResendInterval = setInterval(
		self.resendPackets.bind(self),
		self.packetResendCheckFrequency
	);
}

BattlEyeClient.prototype.sendPacket = function(packet, store, callback) {
	var self = this;

	if(utilities.isFunction(store)) {
		callback = store;
		store = null;
	}

	var formattedStore = utilities.parseBoolean(store);

	if(formattedStore === null) {
		formattedStore = true;
	}

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	if(!BattlEyePacket.isValid(packet)) {
		return callback(new Error("Cannot send invalid packet."));
	}

	var dataBuffer = null;

	try {
		dataBuffer = packet.serialize(true);
	}
	catch(error) {
		return callback(error);
	}

	var data = dataBuffer.toBuffer();

	return self.socket.send(data, 0, data.length, self.port, self.address, function(error, bytesSent) {
		if(error) {
			self.socket.close();

			return callback(error);
		}

		self.packetsSent++;

		if(formattedStore && packet.subType === battlEyePacketSubType.request.value) {
			return self.outgoingPacketCache.push({
				packet: packet,
				bytesSent: bytesSent,
				callback: callback
			});
		}

		return callback(null, null, bytesSent);
	});
};

BattlEyeClient.prototype.receivePacket = function(data, info) {
	var self = this;

	self.connected = true;
	self.onConnect();

	var incomingPacket = null;

	try {
		incomingPacket = BattlEyePacket.deserializePacket(data, true);
	}
	catch(error) {
		if(error.code === "corrupt") {
			self.corruptedPacketsReceived++;
		}

		return console.error(error);
	}

	if(!BattlEyePacket.isValid(incomingPacket)) {
		return console.error("Received invalid packet:", incomingPacket);
	}

	self.packetsReceived++;

	if(incomingPacket.subType === battlEyePacketSubType.reply.value) {
		if(incomingPacket.type === battlEyePacketType.login.value) {
			var outgoingPacketData = null;

			for(var i = 0; i < self.outgoingPacketCache.length; i++) {
				outgoingPacketData = self.outgoingPacketCache[i];

				if(outgoingPacketData.packet.type === battlEyePacketType.login.value) {
					self.outgoingPacketCache.splice(i, 1);

					return outgoingPacketData.callback(null, incomingPacket, outgoingPacketData.bytesSent);
				}
			}
		}
		else if(incomingPacket.type === battlEyePacketType.command.value) {
			var requestSequenceNumber = -1;
			var replySequenceNumber = incomingPacket.getSequenceNumber();

			if(replySequenceNumber >= 0) {
				var outgoingPacketData = null;

				for(var i = 0; i < self.outgoingPacketCache.length; i++) {
					outgoingPacketData = self.outgoingPacketCache[i];
					requestSequenceNumber = outgoingPacketData.packet.getSequenceNumber();

					if(requestSequenceNumber === replySequenceNumber) {
						self.outgoingPacketCache.splice(i, 1);

						return outgoingPacketData.callback(null, incomingPacket, outgoingPacketData.bytesSent);
					}
				}
			}
		}
		else if(incomingPacket.type === battlEyePacketType.serverMessage.value) {
			self.onMessageReceived(incomingPacket.attributes.message);

			return self.acknowledgePacket(
				incomingPacket.getSequenceNumber(),
				function(error, bytesSent) { }
			);
		}
	}

	return console.error("Received unexpected packet:", incomingPacket);
};

BattlEyeClient.prototype.resendPacket = function(packet) {
	var self = this;

	if(typeof packet !== "object" || !(packet instanceof BattlEyePacket)) {
		return false;
	}

	packet.incrementResendCount();

	self.sendPacket(
		packet,
		false,
		function(error, data, bytesSent) { }
	);

	return true;
};

BattlEyeClient.prototype.resendPackets = function() {
	var self = this;

	var outgoingPacket = null;

	for(var i = 0; i < self.outgoingPacketCache.length; i++) {
		outgoingPacket = self.outgoingPacketCache[i].packet;

		if(new Date().getTime() - outgoingPacket.timeStamp.getTime() >= (outgoingPacket.resendCount + 1) * self.packetResendFrequency) {
			if(outgoingPacket.resendCount >= self.packetResendCount) {
				return self.disconnect(self.connected ? "Connection lost!" : "Connection failed!");
			}

			self.resendPacket(outgoingPacket);
		}
	}
};

BattlEyeClient.prototype.acknowledgePacket = function(sequence, callback) {
	var self = this;

	if(!utilities.isFunction(callback)) {
		throw new Error("Missing callback function!");
	}

	var formattedSequence = utilities.parseInteger(sequence);

	if(utilities.isInvalidNumber(sequence) || sequence < 0 || sequence > 255) {
		return callback(new Error("Invalid packet acknowledge sequence: " + sequence + "."));
	}

	return self.sendPacket(
		new BattlEyePacket(
			battlEyePacketType.serverMessage,
			battlEyePacketSubType.reply,
			{
				sequence: formattedSequence
			}
		),
		false,
		function(error, data, bytesSent) {
			if(error) {
				return callback(error);
			}

			return callback(null, bytesSent);
		}
	);
};

BattlEyeClient.prototype.disconnect = function(reason) {
	var self = this;

	self.connected = false;

	var formattedReason = utilities.isNonEmptyString(reason) ? reason.trim() : "Disconnected.";

	self.onDisconnect(formattedReason);

	if(self.packetResendInterval !== null) {
		clearInterval(self.packetResendInterval);
	}

	self.packetResendInterval = null;
	self.socket.close();

	for(var i = 0; i < self.outgoingPacketCache.length; i++) {
		self.outgoingPacketCache[i].callback(new Error(formattedReason));
	}

	self.outgoingPacketCache.length = 0;
};

BattlEyeClient.prototype.numberOfConnectionListeners = function() {
	var self = this;

	return self.connectionListeners.length;
};

BattlEyeClient.prototype.hasConnectionListener = function(listener) {
	var self = this;

	if(!utilities.isObject(listener)) {
		return false;
	}

	for(var i = 0; i < self.connectionListeners.length; i++) {
		if(self.connectionListeners[i] === listener) {
			return true;
		}
	}

	return false;
};

BattlEyeClient.prototype.indexOfConnectionListener = function(listener) {
	var self = this;

	if(!utilities.isObject(listener)) {
		return -1;
	}

	for(var i = 0; i < self.connectionListeners.length; i++) {
		if(self.connectionListeners[i] === listener) {
			return i;
		}
	}

	return -1;
};

BattlEyeClient.prototype.getConnectionListener = function(index) {
	var self = this;

	var formattedIndex = utilities.parseInteger(index);

	if(utilities.isInvalidNumber(formattedIndex) || formattedIndex < 0 || formattedIndex >= self.connectionListeners.length) {
		return null;
	}

	return self.connectionListeners[formattedIndex];
};

BattlEyeClient.prototype.addConnectionListener = function(listener) {
	var self = this;

	if(!utilities.isObject(listener) || self.hasConnectionListener(listener)) {
		return false;
	}

	self.connectionListeners.push(listener);

	return true;
};

BattlEyeClient.prototype.removeConnectionListener = function(listener) {
	var self = this;

	var listenerIndex = self.indexOfConnectionListener(listener);

	if(listenerIndex === -1) {
		listenerIndex = utilities.parseInteger(listener);
	}

	if(utilities.isInvalidNumber(listenerIndex) || listenerIndex < 0 || listenerIndex >= self.connectionListeners.length) {
		return false;
	}

	self.connectionListeners.splice(listenerIndex, 1);

	return true;
};

BattlEyeClient.prototype.clearConnectionListeners = function() {
	var self = this;

	self.connectionListeners.length = 0;
};

BattlEyeClient.prototype.numberOfMessageListeners = function() {
	var self = this;

	return self.messageListeners.length;
};

BattlEyeClient.prototype.hasMessageListener = function(listener) {
	var self = this;

	if(!utilities.isObject(listener)) {
		return false;
	}

	for(var i = 0; i < self.messageListeners.length; i++) {
		if(self.messageListeners[i] === listener) {
			return true;
		}
	}

	return false;
};

BattlEyeClient.prototype.indexOfMessageListener = function(listener) {
	var self = this;

	if(!utilities.isObject(listener)) {
		return -1;
	}

	for(var i = 0; i < self.messageListeners.length; i++) {
		if(self.messageListeners[i] === listener) {
			return i;
		}
	}

	return -1;
};

BattlEyeClient.prototype.getMessageListener = function(index) {
	var self = this;

	var formattedIndex = utilities.parseInteger(index);

	if(utilities.isInvalidNumber(formattedIndex) || formattedIndex < 0 || formattedIndex >= self.messageListeners.length) {
		return null;
	}

	return self.messageListeners[formattedIndex];
};

BattlEyeClient.prototype.addMessageListener = function(listener) {
	var self = this;

	if(!utilities.isObject(listener) || self.hasMessageListener(listener)) {
		return false;
	}

	self.messageListeners.push(listener);

	return true;
};

BattlEyeClient.prototype.removeMessageListener = function(listener) {
	var self = this;

	var listenerIndex = self.indexOfMessageListener(listener);

	if(listenerIndex === -1) {
		listenerIndex = utilities.parseInteger(listener);
	}

	if(utilities.isInvalidNumber(listenerIndex) || listenerIndex < 0 || listenerIndex >= self.messageListeners.length) {
		return false;
	}

	self.messageListeners.splice(listenerIndex, 1);

	return true;
};

BattlEyeClient.prototype.clearMessageListeners = function() {
	var self = this;

	self.messageListeners.length = 0;
};

BattlEyeClient.prototype.onConnect = function() {
	var self = this;

	var connectionListener = null;

	for(var i = 0; i < self.connectionListeners.length; i++) {
		connectionListener = self.connectionListeners[i];

		if(utilities.isFunction(connectionListener.onConnect)) {
			connectionListener.onConnect();
		}
	}
};

BattlEyeClient.prototype.onDisconnect = function(reason) {
	var self = this;

	var formattedReason = utilities.isNonEmptyString(reason) ? reason.trim() : "Disconnected.";
	var connectionListener = null;

	for(var i = 0; i < self.connectionListeners.length; i++) {
		connectionListener = self.connectionListeners[i];

		if(utilities.isFunction(connectionListener.onDisconnect)) {
			connectionListener.onDisconnect(formattedReason);
		}
	}
};

BattlEyeClient.prototype.onMessageReceived = function(message) {
	var self = this;

	var messageListener = null;

	for(var i = 0; i < self.messageListeners.length; i++) {
		messageListener = self.messageListeners[i];

		if(utilities.isFunction(messageListener.onMessageReceived)) {
			messageListener.onMessageReceived(message);
		}
	}
};

module.exports = BattlEyeClient;
