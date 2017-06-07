/**
* imageUploadService
**/
var h = require("whispeerHelper");
var Progress = require("asset/Progress");
var Queue = require("asset/Queue");
var Bluebird = require("bluebird");
var $ = require("jquery");
var imageLib = require("imageLib");
var screenSizeService = require("services/screenSize.service.ts").default;

var blobService = require("services/blobService");


var canvasToBlob = Bluebird.promisify(h.canvasToBlob.bind(h));

var PREVIEWSDISABLED = false;

var defaultOptions = {
	minimumSizeDifference: 1024,
	sizes: [
		{
			name: "lowest",
			restrictions: {
				maxWidth: 640,
				maxHeight: 480
			}
		},
		{
			name: "middle",
			restrictions: {
				maxWidth: 1280,
				maxHeight: 720
			}
		},
		{
			name: "highest",
			restrictions: {
				maxWidth: 2560,
				maxHeight: 1440
			}
		}
	],
	gifSizes: [
		{
			name: "lowest",
			restrictions: {
				maxWidth: 640,
				maxHeight: 480
			}
		},
		{
			name: "highest"
		}
	],
	gif: true,
	encrypt: true,
	original: false
};

/* TODO:
	- maximum size for a resolution
	- original: enable, remove meta-data (exif etc.)
*/

if (screenSizeService.mobile) {
	defaultOptions.sizes = defaultOptions.sizes.filter(function (size) {
		return size.name !== "highest";
	});
}

var uploadQueue = new Queue(3);
uploadQueue.start();

var encryptionQueue = new Queue(500 * 1000);
encryptionQueue.start();

var resizeQueue = new Queue(1);
resizeQueue.start();

function sizeDiff(a, b) {
	return a.blob.getSize() - b.blob.getSize();
}

function sizeSorter(a, b) {
	return sizeDiff(b, a);
}

var ImageUpload = function (file, options) {
	this.rotation = "0";
	this._file = file;
	this._options = options || defaultOptions;
	this._progress = new Progress();
	this._progress.listen(this._maybeApply.bind(this), "progress");
	this._previousProgress = 0;

	if (!file.type.match(/image.*/)) {
		throw new Error("not an image!");
	}

	if (file.type.match(/image.gif/) && !this._options.gif) {
		throw new Error("no gifs supported!");
	}
};

ImageUpload.imageLibLoad = function (file, options) {
	return new Bluebird(function (resolve, reject) {
		imageLib(file, function (canvas) {
			if(canvas.type === "error") {
				reject(canvas);
			} else {
				resolve(canvas);
			}
		}, options);
	});
};

ImageUpload.prototype.convertForGallery = function () {
	return {
		upload: this,
		highest: {
			loading: false,
			loaded: true,
			url: this.getUrl()
		},
		lowest: {
			loading: false,
			loaded: true,
			url: this.getUrl()
		}
	};
};

ImageUpload.prototype._maybeApply = function (progress) {
	if (progress - this._previousProgress > 0.01) {
		this._previousProgress = progress;
	}
};

ImageUpload.prototype.getProgress = function () {
	return this._progress.getProgress();
};

ImageUpload.prototype._uploadAndEncryptPreparedBlob = function (encryptionKey, blobMeta) {
	this._progress.addDepend(blobMeta.blob._uploadProgress);
	this._progress.addDepend(blobMeta.blob._encryptProgress);

	return encryptionQueue.enqueue(blobMeta.blob.getSize(), function () {
		return blobMeta.blob.encryptAndUpload(encryptionKey);
	});
};

ImageUpload.prototype._uploadPreparedBlob = function (blobMeta) {
	this._progress.addDepend(blobMeta.blob._uploadProgress);

	return blobMeta.blob.upload();
};

ImageUpload.blobToDataSet = function (blob) {
	var preReserveID = Bluebird.promisify(blob.preReserveID.bind(blob));
	var getHash = Bluebird.promisify(blob.getHash.bind(blob));
	return Bluebird.all([preReserveID(), getHash()]).spread(function (blobID, hash) {
		return {
			blob: blob,
			meta: {
				blobID: blobID,
				blobHash: hash
			}
		};
	});
};

ImageUpload.fileCallback = function (cb, config, single) {
	return function imageFileLoadHandler(e) {
		var files = Array.prototype.slice.call(e.target.files);
		if (single) {
			cb(new ImageUpload(files[0], config));
		} else {
			cb(files.map(function (file) {
				return new ImageUpload(file, config);
			}));
		}

		try {
			e.target.value = null;
		} catch (ex) {
			console.log(ex);
		}
	};
};

ImageUpload.rotate = function (img, angle) {
	switch (angle) {
		case "0":
			return img;
		case "90":
			return ImageUpload.rotate90(img);
		case "180":
			return ImageUpload.rotate180(img);
		case "270":
			return ImageUpload.rotate270(img);
	}

	return img;
};

ImageUpload.rotate90270 = function (angle, img) {
	var canvas = document.createElement("canvas");
	canvas.width  = img.height;
	canvas.height = img.width;
	var diff = canvas.width-canvas.height;
	var newCtx = canvas.getContext("2d");
	newCtx.translate(canvas.width/2, canvas.height/2);
	newCtx.rotate(angle);
	newCtx.translate(-canvas.width/2, -canvas.height/2);
	newCtx.drawImage(img, diff/2, -diff/2);

	return canvas;
};

ImageUpload.rotate90 = function (img) {
	var angle = Math.PI/2;

	return ImageUpload.rotate90270(angle, img);
};

ImageUpload.rotate180 = function (img) {
	var angle = Math.PI;

	var canvas = document.createElement("canvas");
	canvas.width  = img.width;
	canvas.height = img.height;

	var newCtx = canvas.getContext("2d");
	newCtx.translate(canvas.width/2, canvas.height/2);
	newCtx.rotate(angle);
	newCtx.translate(-canvas.width/2, -canvas.height/2);
	newCtx.drawImage(img, 0, 0);

	return canvas;
};

ImageUpload.rotate270 = function (img) {
	var angle = 3 * Math.PI/2;

	return ImageUpload.rotate90270(angle, img);
};

ImageUpload.prototype.rotate = function () {
	return this.generatePreviews().bind(this).then(function (previews) {
		var newDegree = "0";
		switch(this.rotation) {
			case "0":
				newDegree = "90";
				break;
			case "90":
				newDegree = "180";
				break;
			case "180":
				newDegree = "270";
				break;
		}

		this.rotation = newDegree;

		this._previewUrl = h.toUrl(previews[newDegree]);

		return previews[newDegree];
	});
};

ImageUpload.prototype.generatePreviews = function () {
	if (PREVIEWSDISABLED) {
		return Bluebird.reject(new Error("Previews are disabled"))
	}

	if (!this._generatePreviewsPromise) {
		this._generatePreviewsPromise = ImageUpload.imageLibLoad(h.toUrl(this._file), {
			maxHeight: 200, canvas: true
		}).bind(this).then(function (img) {
			return Bluebird.all([
				canvasToBlob(img, "image/jpeg"),
				canvasToBlob(ImageUpload.rotate90(img), "image/jpeg"),
				canvasToBlob(ImageUpload.rotate180(img), "image/jpeg"),
				canvasToBlob(ImageUpload.rotate270(img), "image/jpeg")
			]);
		}).spread(function (preview0, preview90, preview180, preview270) {
			this._previewUrl = h.toUrl(preview0);

			var previews = {};

			previews["0"] = preview0;
			previews["90"] = preview90;
			previews["180"] = preview180;
			previews["270"] = preview270;

			return previews;
		});
	}

	return this._generatePreviewsPromise;
};

ImageUpload.prototype.getName = function () {
	return this._file.name;
};

ImageUpload.prototype.getPreviewUrl = function () {
	return this._previewUrl || this.getUrl()
}

ImageUpload.prototype.getUrl = function () {
	if (!PREVIEWSDISABLED) {
		this.generatePreviews();
	}

	this._url = this._url || h.toUrl(this._file);
	this._previewUrl = this._previewUrl || this._url
	return this._url;
};

ImageUpload.prototype.upload = function (encryptionKey) {
	var _this = this;
	if (!this._blobs) {
		throw new Error("usage error: prepare was not called!");
	}

	return uploadQueue.enqueue(1, function () {
		return Bluebird.resolve(_this._blobs).bind(_this).map(function (blobWithMetaData) {
			console.info("Uploading blob");
			if (_this._options.encrypt) {
				return _this._uploadAndEncryptPreparedBlob(encryptionKey, blobWithMetaData);
			}

			return _this._uploadPreparedBlob(blobWithMetaData);
		});
	});
};

ImageUpload.prototype._createSizeData = function (size) {
	return resizeQueue.enqueue(1, function () {
		return this._resizeFile(size).bind(this).then(function (resizedImage) {
			return ImageUpload.blobToDataSet(blobService.createBlob(resizedImage));
		}).then(function (data) {
			data.meta.gif = this._isGif;
			return $.extend({}, data, { size: size });
		});
	}, this);
};

ImageUpload.prototype.prepare = function () {
	this._isGif = !!this._file.type.match(/image.gif/i);

	var sizes = this._isGif ? this._options.gifSizes : this._options.sizes;

	if (!this.preparePromise) {
		this._preparePromise = Bluebird.resolve(sizes)
			.bind(this)
			.map(this._createSizeData)
			.then(this._removeUnnededBlobs);
	}

	return this._preparePromise
};

ImageUpload.prototype._removeUnnededBlobs = function (blobs) {
	var lastBlob, result = {};

	this._blobs = blobs.sort(sizeSorter).filter(function (blob) {
		var keep = !lastBlob || this._isGif || sizeDiff(lastBlob, blob) > this._options.minimumSizeDifference;

		if (keep) {
			lastBlob = blob;
		}

		result[blob.size.name] = lastBlob.meta;

		return keep;
	}, this);

	return result;
};

ImageUpload.prototype.getFile = function () {
	return this._file;
};

ImageUpload.prototype._getImage = function () {
	if (!this._getImagePromise) {
		this._getImagePromise = ImageUpload.imageLibLoad(this.getUrl());
	}

	return this._getImagePromise;
}

ImageUpload.prototype._resizeFile = function (sizeOptions) {
	if (this._isGif && !sizeOptions.restrictions) {
		return Bluebird.resolve(this._file);
	}

	var options = $.extend({}, sizeOptions.restrictions || {}, { canvas: true });

	return this._getImage().bind(this).then(function (img) {
		if (options.square) {
			img = imageLib.scale(img, {
				contain: true,
				aspectRatio: 1
			})
		}

		var canvas = imageLib.scale(img, options);
		return canvasToBlob(ImageUpload.rotate(canvas, this.rotation), "image/jpeg");
	});
};

module.exports = ImageUpload;
