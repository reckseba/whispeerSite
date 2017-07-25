/**
* MessageService
**/
var h = require("whispeerHelper").default;
var Progress = require("asset/Progress.ts").default;
var Queue = require("asset/Queue");
var debug = require("debug");
var Bluebird = require("bluebird");

var keyStore = require("crypto/keyStore");
var Cache = require("services/Cache.ts").default;

var socketService = require("services/socket.service.ts").default;
var BlobDownloader = require("services/blobDownloader.service.ts").default;

var initService = require("services/initService");

const saveAs = require("libs/filesaver");

var knownBlobs = {};
var downloadBlobQueue = new Queue(5);
downloadBlobQueue.start();

var debugName = "whispeer:blobService";
var blobServiceDebug = debug(debugName);

function time(name) {
	if (debug.enabled(debugName)) {
		console.time(name);
	}
}

function timeEnd(name) {
	if (debug.enabled(debugName)) {
		console.timeEnd(name);
	}
}

var blobCache = new Cache("blobs");

var MyBlob = function (blobData, blobID, options) {
	this._blobData = blobData;
	options = options || {};

	if (typeof blobData === "string") {
		this._legacy = true;
	} else if (blobData instanceof File) {
		this._file = true;
	}

	if (blobID) {
		this._blobID = blobID;
		this._uploaded = true;
	} else {
		this._uploaded = false;
	}

	this._meta = options.meta || {};
	this._key = this._meta._key;
	this._decrypted = !this._key;

	this._uploadProgress = new Progress({ total: this.getSize() });
	this._encryptProgress = new Progress({ total: this.getSize() });
	this._decryptProgress = new Progress({ total: this.getSize() });
};

MyBlob.prototype.download = function (filename) {
	saveAs(this._blobData, filename);
}

MyBlob.prototype.isUploaded = function () {
	return this._uploaded;
};

MyBlob.prototype.setMeta = function (meta) {
	if (!this.isUploaded()) {
		this._meta = meta;
	}
};

MyBlob.prototype.getSize = function () {
	return this._blobData.size;
};

MyBlob.prototype.getMeta = function () {
	return this._meta;
};

MyBlob.prototype.getArrayBuffer = function () {
	var that = this;

	return new Bluebird(function (resolve) {
		var reader = new FileReader();

		if (reader.addEventListener) {
			reader.addEventListener("loadend", resolve);
		} else {
			reader.onloadend = resolve;
		}

		reader.readAsArrayBuffer(that._blobData);
	}).then(function (event) {
		var target = event.currentTarget || event.target;

		return target.result;
	});
};

MyBlob.prototype.encryptAndUpload = function (key, cb) {
	var that = this, blobKey;

	return Bluebird.try(function () {
		return that.encrypt();
	}).then(function (_blobKey) {
		blobKey = _blobKey;
		return keyStore.sym.symEncryptKey(blobKey, key);
	}).then(function () {
		return that.upload();
	}).then(function () {
		return blobKey;
	}).nodeify(cb);
};

MyBlob.prototype.encrypt = function (cb) {
	var that = this;

	return Bluebird.resolve().bind(this).then(function () {
		if (that._uploaded || !that._decrypted) {
			throw new Error("trying to encrypt an already encrypted or public blob. add a key decryptor if you want to give users access");
		}

		return Bluebird.all([
			keyStore.sym.generateKey(null, "blob key"),
			that.getArrayBuffer()
		]);
	}).spread(function (_key, buf) {
		that._key = _key;

		time("blobencrypt" + (that._blobID || that._preReserved));
		return keyStore.sym.encryptArrayBuffer(buf, that._key, function (progress) {
			that._encryptProgress.progress(that.getSize() * progress);
		});
	}).then(function (encryptedData) {
		that._encryptProgress.progress(that.getSize());
		timeEnd("blobencrypt" + (that._blobID || that._preReserved));
		blobServiceDebug(encryptedData.byteLength);
		that._decrypted = false;

		that._blobData = new Blob([encryptedData], {type: that._blobData.type});

		return that._key;
	}).nodeify(cb);
};

MyBlob.prototype.decrypt = function (cb) {
	if (this._decrypted) {
		return Bluebird.resolve().nodeify(cb);
	}

	return Bluebird.try(() => {
		return this.getArrayBuffer();
	}).then((encryptedData) => {
		time("blobdecrypt" + this._blobID);
		return keyStore.sym.decryptArrayBuffer(encryptedData, this._key, (progress) => {
			this._decryptProgress.progress(this.getSize() * progress)
		})
	}).then((decryptedData) => {
		this._decryptProgress.progress(this.getSize())
		timeEnd("blobdecrypt" + this._blobID);

		this._decrypted = true;

		this._blobData = new Blob([decryptedData], {type: this._blobData.type});
	}).nodeify(cb);
};

MyBlob.prototype.getBase64Representation = function () {
	return this.getStringRepresentation().then(function (blobValue) {
		return blobValue.split(",")[1];
	});
};

MyBlob.prototype.upload = function (cb) {
	var that = this;
	return Bluebird.try(function () {
		if (that._uploaded) {
			return that._blobID;
		}

		return that.reserveID();
	}).then(function (blobid) {
		return socketService.uploadBlob(that._blobData, blobid, that._uploadProgress);
	}).then(function () {
		that._uploaded = true;

		return that._blobID;
	}).nodeify(cb);
};

MyBlob.prototype.getBlobID = function () {
	return this._blobID;
};

MyBlob.prototype.reserveID = function (cb) {
	var that = this;

	return Bluebird.try(function () {
		var meta = that._meta;
		meta._key = that._key;
		meta.one = 1;

		if (that._preReserved) {
			return socketService.emit("blob.fullyReserveID", {
				blobid: that._preReserved,
				meta: meta
			});
		}

		return socketService.emit("blob.reserveBlobID", {
			meta: meta
		});
	}).then(function (data) {
		if (data.blobid) {
			that._blobID = data.blobid;

			knownBlobs[that._blobID] = Bluebird.resolve(that);

			return that._blobID;
		}
	}).nodeify(cb);
};

MyBlob.prototype.preReserveID = function (cb) {
	var that = this;
	return Bluebird.try(function () {
		return socketService.emit("blob.preReserveID", {});
	}).then(function (data) {
		if (data.blobid) {
			that._preReserved = data.blobid;
			knownBlobs[that._preReserved] = Bluebird.resolve(that);
			return data.blobid;
		}

		throw new Error("got no blobid");
	}).nodeify(cb);
};

MyBlob.prototype.toURL = function (cb) {
	var blobToDataURI = Bluebird.promisify(h.blobToDataURI.bind(h));

	var that = this;
	return Bluebird.try(function () {
		if (that._legacy) {
			return that._blobData;
		}

		if (that._blobData.localURL) {
			return that._blobData.localURL;
		}

		if (typeof window.URL !== "undefined") {
			return window.URL.createObjectURL(that._blobData);
		}

		if (typeof webkitURL !== "undefined") {
			return window.webkitURL.createObjectURL(that._blobData);
		}

		return blobToDataURI(that._blobData);
	}).catch(function (e) {
		console.error(e);

		return "";
	}).nodeify(cb);
};

MyBlob.prototype.getStringRepresentation = function () {
	var blobToDataURI = Bluebird.promisify(h.blobToDataURI.bind(h));

	return Bluebird.resolve().bind(this).then(function () {
		if (this.legacy) {
			return this._blobData;
		}

		return blobToDataURI(this._blobData);
	});
};

MyBlob.prototype.getHash = function () {
	return this.getArrayBuffer().then(function (buf) {
		return keyStore.hash.hashArrayBuffer(buf)
	})
};

function loadBlobFromServer(blobID, downloadProgress) {
	return downloadBlobQueue.enqueue(1, function () {
		return initService.awaitLoading().then(function () {
			return new BlobDownloader(socketService, blobID, downloadProgress).download()
		}).then(function (data) {
			var blob = new MyBlob(data.blob, blobID, { meta: data.meta });

			blobCache.store(blob.getBlobID(), blob._meta, blob._blobData);

			return blob;
		});
	});
}

function loadBlobFromDB(blobID) {
	return blobCache.get(blobID).then(function (data) {
		if (typeof data.blob === "undefined" || data.blob === false) {
			throw new Error("cache invalid!");
		}

		var blob;

		if (typeof data.blob === "string") {
			blob = h.dataURItoBlob(data.blob);
		}

		return new MyBlob(blob || data.blob, blobID, { meta: data.data });
	});
}

function loadBlob(blobID, downloadProgress) {
	return loadBlobFromDB(blobID).catch(function () {
		return loadBlobFromServer(blobID, downloadProgress);
	});
}

var blobService = {
	createBlob: function (blob) {
		return new MyBlob(blob);
	},
	getBlob: function (blobID, downloadProgress) {
		if (!knownBlobs[blobID]) {
			knownBlobs[blobID] = loadBlob(blobID, downloadProgress)
		}

		return knownBlobs[blobID]
	}
};

module.exports = blobService;
