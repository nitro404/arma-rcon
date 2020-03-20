"use strict";

global.utilities = undefined;

const armaRcon = require("../index.js");
const utilities = require("extra-utilities");
const chai = require("chai");
const expect = chai.expect;

describe("ARMA RCon", function() {
	describe("BattlEyePacket", function() {
		it("should be an object", function() {
			expect(armaRcon.BattlEyePacket).to.be.an.instanceof(Object);
		});
	});

	describe("BattlEyeClient", function() {
		it("should be an object", function() {
			expect(armaRcon.BattlEyeClient).to.be.an.instanceof(Object);
		});
	});

	describe("ARMAServer", function() {
		it("should be an object", function() {
			expect(armaRcon.ARMAServer).to.be.an.instanceof(Object);
		});
	});

	describe("Player", function() {
		it("should be an object", function() {
			expect(armaRcon.Player).to.be.an.instanceof(Object);
		});
	});

	describe("Ban", function() {
		it("should be an object", function() {
			expect(armaRcon.Ban).to.be.an.instanceof(Object);
		});
	});

	describe("battlEyePacketType", function() {
		it("should be an object", function() {
			expect(armaRcon.battlEyePacketType).to.be.an.instanceof(Object);
		});
	});

	describe("battlEyePacketSubtype", function() {
		it("should be an object", function() {
			expect(armaRcon.battlEyePacketSubtype).to.be.an.instanceof(Object);
		});
	});

	describe("lockState", function() {
		it("should be an object", function() {
			expect(armaRcon.lockState).to.be.an.instanceof(Object);
		});
	});

	describe("banType", function() {
		it("should be an object", function() {
			expect(armaRcon.banType).to.be.an.instanceof(Object);
		});
	});
});
