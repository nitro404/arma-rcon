var crc = require("crc");
var ByteBuffer = require("bytebuffer");
var utilities = require("extra-utilities");
var battlEyePacketType = require("./packet-type");
var battlEyePacketSubType = require("./packet-subtype");

function BattlEyePacket(type, subType, attributes) {
	var self = this;

	self.timeStamp = new Date();
	self.resendCount = 0;
	self.type = battlEyePacketType.getValue(type);
	self.subType = battlEyePacketSubType.getValue(subType);
	self.attributes = utilities.isObject(attributes) ? utilities.clone(attributes) : { };
}

BattlEyePacket.headerText = "BE";
BattlEyePacket.packetLength = 256;

BattlEyePacket.prototype.incrementResendCount = function() {
	var self = this;

	self.resendCount++;
};

BattlEyePacket.prototype.numberOfAttributes = function() {
	var self = this;

	return Object.keys(self.attributes).length;
};

BattlEyePacket.prototype.hasAttribute = function(attribute) {
	var self = this;

	return self.attributes[attribute] !== undefined;
};

BattlEyePacket.prototype.getAttributeNames = function() {
	var self = this;

	return Object.keys(self.attributes);
};

BattlEyePacket.prototype.getAttribute = function(attribute) {
	var self = this;

	if(utilities.isEmptyString(attribute)) {
		return null;
	}

	var formattedAttribute = attribute.trim();

	if(formattedAttribute.length === 0 || self.attributes[attribute] === undefined) {
		return null;
	}

	return self.attributes[attribute];
};

BattlEyePacket.prototype.setAttribute = function(attribute, value) {
	var self = this;

	if(utilities.isEmptyString(attribute)) {
		return false;
	}

	var formattedAttribute = attribute.trim();

	if(formattedAttribute.length === 0) {
		return false;
	}

	self.attributes[attribute] = value;

	return true;
};

BattlEyePacket.prototype.clearAttributes = function() {
	var self = this;

	self.attributes.length = 0;
};

BattlEyePacket.prototype.copyAttributesFrom = function(battlEyePacket, overwrite) {
	var self = this;

	var formattedOverwrite = utilities.parseBoolean(overwrite);

	if(formattedOverwrite === null) {
		formattedOverwrite = true;
	}

	var attribute = null;
	var attributes = Object.keys(battlEyePacket.attributes);

	for(var i=0;i<attributes.length;i++) {
		attribute = attributes[i];

		if(!formattedOverwrite && self.hasAttribute(attribute)) {
			continue;
		}

		self.attributes[attribute] = battlEyePacket.attributes[attribute];
	}
};

BattlEyePacket.prototype.getSequenceNumber = function() {
	var self = this;

	return self.getAttribute("sequence");
};

BattlEyePacket.prototype.serialize = function(throwErrors) {
	var self = this;

	if(!self.isValid()) {
		if(throwErrors) {
			var error = new Error("Cannot serialize invalid packet!");
			error.status = 400;
			error.code = "invalid";
			throw error;
		}

		return null;
	}

	var dataBuffer = new ByteBuffer();
	dataBuffer.order(true);

	dataBuffer.writeUint8(0xFF);
	dataBuffer.writeUint8(self.type);

	if(self.type === battlEyePacketType.login.value) {
		var password = self.getAttribute("password");

		if(utilities.isNonEmptyString(password)) {
			dataBuffer.writeString(password);
		}
	}
	else if(self.type === battlEyePacketType.command.value) {
		dataBuffer.writeUint8(self.getAttribute("sequence"));

		if(self.hasAttribute("command")) {
			var command = self.getAttribute("command");

			if(utilities.isNonEmptyString(command)) {
				dataBuffer.writeString(command);
			}
		}
	}
	else if(self.type === battlEyePacketType.serverMessage.value) {
		if(self.subType === battlEyePacketSubType.reply.value) {
			dataBuffer.writeUint8(self.getAttribute("sequence"));
		}
	}

	dataBuffer.flip();

	var checksum = crc.crc32(dataBuffer.toBuffer(true));

	var packetBuffer = new ByteBuffer();
	packetBuffer.order(true);

	packetBuffer.writeString(BattlEyePacket.headerText);
	packetBuffer.writeUint32(checksum);
	packetBuffer.flip();

	return ByteBuffer.concat([packetBuffer, dataBuffer], "binary");
};

BattlEyePacket.serializePacket = function(battlEyePacket, throwErrors) {
	if(typeof battlEyePacket !== "object" || !(battlEyePacket instanceof BattlEyePacket)) {
		if(throwErrors) {
			throw new Error("Cannot serialize invalid battle eye packet!");
		}

		return null;
	}

	return battlEyePacket.serialize(throwErrors);
};

BattlEyePacket.deserializePacket = function(data, throwErrors) {
	var packetBuffer = new ByteBuffer();
	packetBuffer.order(true);
	packetBuffer.append(data, "binary");
	var packetSize = packetBuffer.offset;
	packetBuffer.flip();

	if(packetSize < 9) {
		if(throwErrors) {
			var error = new Error("Packet must contain at least 9 bytes!");
			error.code = "invalid";
			throw error;
		}

		return null;
	}

	var headerText = packetBuffer.readString(2);

	if(headerText !== BattlEyePacket.headerText) {
		if(throwErrors) {
			var error = new Error("Invalid header text.");
			error.code = "invalid";
			throw error;
		}

		return null;
	}

	var checksum = packetBuffer.readUint32();

	var dataBuffer = packetBuffer.slice(6);

	if(checksum !== crc.crc32(dataBuffer.toBuffer(true))) {
		if(throwErrors) {
			var error = new Error("Packet checksum verification failed.");
			error.code = "corrupt";
			throw error;
		}

		return null;
	}

	if(dataBuffer.readUint8() !== 0xFF) {
		if(throwErrors) {
			var error = new Error("Packet missing 0xFF flag after checksum.");
			error.code = "invalid";
			throw error;
		}

		return null;
	}

	var packetType = battlEyePacketType.getType(dataBuffer.readUint8());

	if(!battlEyePacketType.isValid(packetType)) {
		if(throwErrors) {
			var error = new Error("Invalid packet type.");
			error.code = "invalid";
			throw error;
		}

		return null;
	}

	var packet = new BattlEyePacket(packetType, battlEyePacketSubType.reply);

	if(packetType.value === battlEyePacketType.login.value) {
		packet.setAttribute("result", dataBuffer.readUint8());
	}
	else if(packetType.value === battlEyePacketType.command.value) {
		packet.setAttribute("sequence", dataBuffer.readUint8());

		if(packetSize > 9) {
			packet.setAttribute("data", dataBuffer.readString(packetSize - 9));
		}
	}
	else if(packetType.value === battlEyePacketType.serverMessage.value) {
		packet.setAttribute("sequence", dataBuffer.readUint8());
		packet.setAttribute("message", dataBuffer.readString(packetSize - 9));
	}

	return packet;
};

BattlEyePacket.prototype.isValid = function() {
	var self = this;

	return (self.timeStamp instanceof Date) &&
		   Number.isInteger(self.resendCount) &&
		   self.resendCount >= 0 &&
		   Number.isInteger(self.type) &&
		   battlEyePacketType.isValid(self.type) &&
		   Number.isInteger(self.subType) &&
		   battlEyePacketSubType.isValid(self.subType) &&
		   self.attributes !== null &&
		   utilities.isObject(self.attributes);
};

BattlEyePacket.isValid = function(battlEyePacket) {
	return utilities.isObject(battlEyePacket) &&
		   battlEyePacket instanceof BattlEyePacket &&
		   battlEyePacket.isValid();
};

module.exports = BattlEyePacket;
