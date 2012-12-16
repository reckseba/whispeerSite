define(['libs/step', 'crypto/generalWorkerInclude', 'crypto/waitForReady', 'asset/helper', 'libs/sjcl'], function (step, WorkerManager, waitForReady, h, sjcl) {
	"use strict";

	var addEntropy = function (theWorker, callback) {
		step(function waitReady() {
			waitForReady(this);
		}, h.sF(function ready() {
			theWorker.postMessage({randomNumber: sjcl.codec.hex.fromBits(sjcl.random.randomWords(16)), entropy: 1024}, this);
		}), callback);
	};

	var workers;
	if (window.location.href.indexOf("/tests") > -1) {
		workers = new WorkerManager('../crypto/rsaWorker.js', 4, addEntropy);
	} else {
		workers = new WorkerManager('js/crypto/rsaWorker.js', 4, addEntropy);
	}

	var rsaWorker = {
		signPSS: function (message, d, p, q, u, n, callback) {
			d = d.toString(16);
			p = p.toString(16);
			q = q.toString(16);
			u = u.toString(16);
			n = n.toString(16);

			step(function getFree() {
				workers.getFreeWorker(this);
			}, function (err, worker) {
				if (err) {
					throw err;
				}

				var data = {m: message, d: d, p: p, q: q, u: u, n: n, sign: true};

				worker.postMessage(data, this);
			}, callback);
		},
		verifyPSS: function (hash, signature, ee, n, callback) {
			console.log(hash);
			ee = ee.toString(16);
			n = n.toString(16);

			step(function getFree() {
				workers.getFreeWorker(this);
			}, function (err, worker) {
				if (err) {
					throw err;
				}

				var data = {h: hash, s: signature, ee: ee, n: n, verify: true};

				worker.postMessage(data, this);
			}, callback);
		},
		encryptOAEP: function (message, ee, n, label, callback) {
			message = message.toString(16);
			ee = ee.toString(16);
			n = n.toString(16);

			step(function getFree() {
				workers.getFreeWorker(this);
			}, function (err, worker) {
				if (err) {
					throw err;
				}

				var data = {m: message, ee: ee, n: n, l: label, encrypt: true};

				worker.postMessage(data, this);
			}, callback);
		},
		decryptOAEP: function (code, d, p, q, u, n, label, callback) {
			code = code.toString(16);
			d = d.toString(16);
			p = p.toString(16);
			q = q.toString(16);
			u = u.toString(16);
			n = n.toString(16);

			step(function getFree() {
				workers.getFreeWorker(this);
			}, function (err, worker) {
				if (err) {
					throw err;
				}

				var data = {c: code, d: d, p: p, q: q, u: u, n: n, l: label, decrypt: true};

				worker.postMessage(data, this);
			}, callback);
		}
	};

	return rsaWorker;
});