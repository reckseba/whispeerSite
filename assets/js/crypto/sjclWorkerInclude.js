"use strict";

const WorkerPool = require("../worker/worker-pool");
const bluebird = require("bluebird");
const chelper = require("crypto/minimalHelper");
const config = require("config");

function getEntropy() {
	try {
		var ab;

		// get cryptographically strong entropy depending on runtime environment
		if (window && Uint32Array) {
			ab = new Uint32Array(32);
			if (window.crypto && window.crypto.getRandomValues) {
				window.crypto.getRandomValues(ab);
			} else if (window.msCrypto && window.msCrypto.getRandomValues) {
				window.msCrypto.getRandomValues(ab);
			} else {
				return false;
			}

			return ab;
		}
	} catch (e) {
		console.error(e);
	}

	return false;
}

function addEntropy(theWorker, callback) {
	var entropy = getEntropy();

	if (entropy) {
		theWorker.runTask({randomNumber: entropy, entropy: 1024}).then(callback);
	} else {
		throw new Error("no entropy from browser ... browser too old");
	}
}

var workerCount = 4;

if (navigator.hardwareConcurrency) {
	workerCount = Math.max(navigator.hardwareConcurrency - 1, workerCount);
}

//Promise, numberOfWorkers, workerPath, setupMethod, requireOverRide
var workers = new WorkerPool(bluebird, workerCount, {
	setupMethod: addEntropy,
	workerScriptOverride: config.workerScript || false
});

var sjclWorker = {
	hash: function (toHash) {
		return workers.schedule({
			isHash: true,
			toHash: toHash
		});
	},
	stringify: function (content, version, hash) {
		return workers.schedule({
			stringify: true,
			content: content,
			version: version,
			hash: hash
		});
	},
	asym: {
		generateCryptKey: function (curve) {
			var data = {
				asym: true,
				generate: true,
				crypt: true
			};

			if (curve) {
				data.curve = curve;
			}

			return workers.schedule(data);
		},
		generateSignKey: function (curve) {
			var data = {
				asym: true,
				generate: true,
				crypt: false,
				curve: curve
			};

			return workers.schedule(data);
		},
		kem: function (publicKey) {
			var data = {
				asym: true,
				generate: false,
				action: "kem",

				curve: chelper.getCurveName(publicKey._curve),
				x: publicKey._point.x.toString(),
				y: publicKey._point.y.toString()
			};

			return workers.schedule(data);
		},
		unkem: function (privateKey, tag) {
			var data = {
				asym: true,
				generate: false,
				action: "unkem",

				curve: chelper.getCurveName(privateKey._curve),
				exponent: privateKey._exponent.toString(),
				tag: chelper.bits2hex(tag)
			};

			return workers.schedule(data);
		},
		sign: function (privateKey, toSign) {
			var data = {
				asym: true,
				generate: false,
				action: "sign",

				curve: chelper.getCurveName(privateKey._curve),
				exponent: privateKey._exponent.toString(),
				toSign: chelper.bits2hex(toSign)
			};

			return workers.schedule(data);
		},
		verify: function (publicKey, signature, hash) {
			var data = {
				asym: true,
				generate: false,
				action: "verify",

				curve: chelper.getCurveName(publicKey._curve),
				point: {
					x: publicKey._point.x.toString(),
					y: publicKey._point.y.toString()
				},

				signature: chelper.bits2hex(signature),
				hash: chelper.bits2hex(hash)
			};

			return workers.schedule(data);
		}
	},
	sym: {
		encrypt: function (key, message, progressListener) {
			var data = {
				"key": key,
				"message": message,

				"asym": false,
				"encrypt": true
			};

			return workers.schedule(data, progressListener);
		},
		decrypt: function (key, message, progressListener) {
			var data = {
				"key": key,
				"message": message,

				"asym": false,
				"encrypt": false
			};

			return workers.schedule(data, progressListener);
		}
	}
};

module.exports = sjclWorker;
