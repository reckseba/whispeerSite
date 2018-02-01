"use strict";

const MyWorker = require("worker-loader!./worker.js")
const Bluebird = require("bluebird")

var PromiseWorker = function () {
	this._busy = true;

	this._worker = new MyWorker();

	this._taskQueue = [];
	this._freeListener = [];
	this._taskCallback = null;
	this._metaListener = null;

	this._worker.onmessage = this._workerMessage.bind(this);

	this._worker.postMessage({
		action: "setup"
	});
};

PromiseWorker.prototype._workerMessage = function (event) {
	var data = event.data.data; var type = event.data.type;
	if (type === "meta" && this._metaListener) {
		this._metaListener(data);
	} else if (type === "resultTask") {
		this._taskCallback.resolve(data);
		this._free();
	} else if (type === "setup") {
		this._free();
	} else if (type === "error") {
		this._taskCallback.reject(data);
		this._free();
	}
};

PromiseWorker.prototype.isBusy = function () {
	return this._busy;
};

PromiseWorker.prototype._lockFree = function () {
	var that = this;
	return new Bluebird(function (resolve) {
		that._taskQueue.push(resolve);
		that._checkQueues();
	});
};

PromiseWorker.prototype.runIfFree = function (data, metaListener) {
	if (!this._busy) {
		return this._run(data, metaListener);
	}

	return false;
};

PromiseWorker.prototype.onFree = function (cb) {
	this._freeListener.push(cb);
};

/** called when the worker is freed.
    - checks if there are any waiting tasks and runs them
    - if no waiting tasks exist calls free listener.
 */
PromiseWorker.prototype._free = function () {
	this._busy = false;
	this._taskCallback = null;
	this._metaListener = null;

	this._checkQueues();
};

PromiseWorker.prototype._checkQueues = function () {
	if (this._busy) {
		return;
	}

	if (this._taskQueue.length > 0) {
		this._busy = true;
		this._taskQueue.shift()();

		return;
	}

	this._freeListener.forEach(function (listener) {
		try {
			listener();
		} catch (e) {
			console.error(e);
		}
	});
};

PromiseWorker.prototype._saveCallbacks = function (resolve, reject) {
	this._taskCallback = {
		resolve: resolve,
		reject: reject
	};
};

PromiseWorker.prototype._run = function (data, metaListener) {
	this._busy = true;
	this._metaListener = metaListener;

	var waitPromise = new Bluebird(this._saveCallbacks.bind(this));
	this._worker.postMessage({
		action: "runTask",
		data: data
	});
	return waitPromise;
};

/** run a task as soon as the worker is free
    @param data data to sent to worker task
    @param metaListener callback for meta information
*/
PromiseWorker.prototype.runTask = function (data, metaListener) {
	return this._lockFree().then(this._run.bind(this, data, metaListener));
};

module.exports = PromiseWorker;
