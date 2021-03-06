var settings = require("services/settings.service").default;

var Bluebird = require("bluebird");
var h = require("../helper/helper").default;
var errors = require("asset/errors");




function removePadding(val) {
	var isNumber = false;

	if (val.indexOf("num::") === 0) {
		isNumber = true;

		val = val.substr(5);
	}

	if (val.length % 128 !== 2) {
		throw new errors.InvalidDataError("padding size invalid");
	}

	var paddingIndex = val.indexOf("::");

	if (paddingIndex === -1) {
		throw new errors.InvalidDataError("no padding seperator found");
	}

	var unpadded = val.substr(paddingIndex + 2);

	if (isNumber) {
		return h.parseDecimal(unpadded);
	}

	return unpadded;
}

function checkAndFixString(val) {
	while (typeof val === "string" && val.lastIndexOf("::") > -1) {
		val = removePadding(val);
	}

	return val;
}

function checkAndFixObject(content) {
	h.objectEach(content, function (key, value) {
		if (typeof value === "object") {
			checkAndFixObject(value);
		} else if (typeof value === "string") {
			content[key] = checkAndFixString(value);
		}
	});
}

module.exports = function () {
	return Bluebird.try(function() {
		var content = settings.getContent();

		checkAndFixObject(content);

		if (h.deepEqual(content, settings.getContent())) {
			return Bluebird.resolve(true)
		}

		settings.setContent(content);
		return settings.uploadChangedData().thenReturn(true);
	});
};
