const h = require("../helper/helper").default;
const Observer = require("asset/observer");
const signatureCache = require("crypto/signatureCache");
const Bluebird = require("bluebird");
const trustManager = require("crypto/trustManager");

const sjcl = require("sjcl");

const errorService = require("services/error.service").errorServiceInstance;
const keyStoreService = require("crypto/keyStore");
const socketService = require("services/socket.service").default;
const requestKeyService = require("services/requestKey.service").default;
const CacheService = require("services/Cache").default;
const initService = require("services/initService");

const sessionService = require("services/session.service").default;

var userService, knownIDs = [], users = {}, ownUserStatus = {};

var promises = ["verifyOwnKeysDone", "verifyOwnKeysCacheDone", "loadedCache", "loaded"];

promises.forEach(function (promiseName) {
	ownUserStatus[promiseName] = new Bluebird(function (resolve) {
		ownUserStatus[promiseName + "Resolve"] = function () {
			delete ownUserStatus[promiseName + "Resolve"];
			resolve();
		};
	});
});

var deletedUserName = "Deleted user"; //localize("user.deleted", {});
var NotExistingUser = function (identifier) {
	this.data = {
		trustLevel: -1,
		notExisting: true,
		basic: {
			shortname: deletedUserName,
			image: "assets/img/user.png"
		},
		name: deletedUserName,
		user: this
	};

	if (typeof identifier === "number") {
		this.data.id = identifier;
	}

	this.isNotExistingUser = function () {
		return true;
	};

	this.loadBasicData = function (cb) {
		return Bluebird.resolve().nodeify(cb)
	};

	this.reLoadBasicData = function (cb) {
		return Bluebird.resolve().nodeify(cb)
	};

	this.loadFullData = function (cb) {
		return Bluebird.resolve().nodeify(cb)
	};

	this.isOwn = function () {
		return false;
	};
};

function makeUser(data) {
	if (data.userNotExisting) {
		return new NotExistingUser(data.identifier);
	}

	if (data.error === true) {
		return new NotExistingUser();
	}

	const User = require("models/user");
	const theUser = new User(data);

	var id = theUser.getID();
	var mail = theUser.getMail();
	var nickname = theUser.getNickname();

	if (users[id]) {
		users[id].update(data);
		return users[id];
	}

	if (!users[id]) {
		knownIDs.push(id);
	}

	users[id] = theUser;

	if (mail) {
		users[mail] = theUser;
	}

	if (nickname) {
		users[nickname] = theUser;
	}

	userService.notify(theUser, "loadedUser");

	return theUser;
}

var THROTTLE = 20;

/** loads all the users in the batch */
function doLoad(identifier, cb) {
	return initService.awaitLoading().then(function () {
		return socketService.emit("user.getMultiple", {identifiers: identifier});
	}).then(function (data) {
		if (!data || !data.users) {
			return [];
		}

		return data.users;
	}).map(function (userData) {
		return makeUser(userData);
	}).map(function (user) {
		if (!user.isNotExistingUser()) {
			return user.verifyKeys().thenReturn(user);
		}

		return user
	}).nodeify(cb);
}

var delay = h.delayMultiplePromise(Bluebird, THROTTLE, doLoad, 10);

function loadUser(identifier, cb) {
	return Bluebird.try(function () {
		if (users[identifier]) {
			return users[identifier];
		} else {
			return delay(identifier);
		}
	}).nodeify(cb);
}

userService = {
	/** search your friends */
	queryFriends: function queryFriendsF(query, cb) {
		return Bluebird.try(function () {
			return socketService.emit("user.searchFriends", {
				text: query,
				known: knownIDs
			});
		}).then(function (data) {
			var result = [], user = data.results;

			var i;
			for (i = 0; i < user.length; i += 1) {
				if (typeof user[i] === "object") {
					result.push(makeUser(user[i]));
				} else {
					result.push(users[user[i]]);
				}
			}

			return result;
		}).nodeify(cb);
	},

	/** search for a user
	* @param query query string to search for
	* @param cb user objects
	*/
	query: function queryF(query, cb) {
		return initService.awaitLoading().then(function () {
			return socketService.definitlyEmit("user.search", {
				text: query,
				known: knownIDs
			});
		}).then(function (data) {
			var result = [], user = data.results;

			if (user) {
				var i;
				for (i = 0; i < user.length; i += 1) {
					if (typeof user[i] === "object") {
						result.push(makeUser(user[i]));
					} else {
						result.push(users[user[i]]);
					}
				}
			}

			return result;
		}).nodeify(cb);
	},

	/** load a user
	* @param identifier identifier of the user (id, nickname or mail)
	* @param cb called with results
	* this function is asynchronous and returns immediatly. requests are also batched.
	*/
	get: function getF(identifier, cb) {
		return loadUser(identifier).nodeify(cb);
	},

	/** load a user
	* @param identifiers identifier array of the users (id, nickname or mail)
	* @param cb called with results
	* this function is asynchronous and returns immediatly. requests are also batched.
	*/
	getMultiple: function getMultipleF(identifiers, cb) {
		return Bluebird.resolve(identifiers).map(function (id) {
			return loadUser(id);
		}).nodeify(cb);
	},

	/** gets multiple users and loads their basic data.
	* @param identifiers identifier of users to load
	* @param cb called with users data.
	*/
	getMultipleFormatted: function (identifiers, cb) {
		return Bluebird.try(function () {
			return userService.getMultiple(identifiers);
		}).map(function (user) {
			return user.loadBasicData().thenReturn(user);
		}).then(function (users) {
			return users.map(function (user) {
				return user.data;
			});
		}).nodeify(cb);
	},

	verifyOwnKeysCacheDone: function () {
		return ownUserStatus.verifyOwnKeysCacheDone;
	},

	verifyOwnKeysDone: function () {
		return ownUserStatus.verifyOwnKeysDone;
	},

	ownLoadedCache: function () {
		return ownUserStatus.loadedCache;
	},

	ownLoaded: function () {
		return ownUserStatus.loaded;
	},

	/** get own user. synchronous */
	getown: function getownF() {
		return users[sessionService.getUserID()];
	}
};

function improvementListener(identifier) {
	var improve = [];

	keyStoreService.addImprovementListener(function (rid) {
		improve.push(rid);

		if (improve.length === 1) {
			Bluebird.resolve().timeout(5000).then(function () {
				var own = userService.getown();
				if (!own || own.getNickOrMail() !== identifier) {
					throw new Error("user changed so no improvement update!");
				}

				return Bluebird.all(improve.map(function (keyID) {
					return keyStoreService.sym.symEncryptKey(keyID, own.getMainKey());
				}));
			}).then(function () {
				var toUpload = keyStoreService.upload.getDecryptors(improve);
				return socketService.emit("key.addFasterDecryptors", {
					keys: toUpload
				});
			}).then(function () {
				improve = [];
			}).catch(errorService.criticalError);
		}
	});
}

Observer.extend(userService);

/*function getInfoFromCacheEntry(userData) {
	var profile = userData.profile;

	var profileIDs = [];

	if (profile.priv) {
		profileIDs = profile.priv.map(function (profile) {
			return profile.profileid;
		});
	}

	profileIDs.push(profile.me.profileid);

	return {
		profiles: profileIDs,
		signedKeys: userData.signedKeys._signature
	};
}*/

function loadOwnUser(data, server) {
	return Bluebird.try(function () {
		return makeUser(data);
	}).then(function (user) {
		var identifier = user.getNickOrMail();

		keyStoreService.setKeyGenIdentifier(identifier);
		improvementListener(identifier);
		keyStoreService.sym.registerMainKey(user.getMainKey());

		user.verifyOwnKeys();

		if (server) {
			ownUserStatus.verifyOwnKeysDoneResolve();
		} else {
			ownUserStatus.verifyOwnKeysCacheDoneResolve();
		}

		trustManager.setOwnSignKey(user.getSignKey());

		return signatureCache.awaitLoading().thenReturn(user);
	}).then(function (user) {
		var verifyKeys = Bluebird.promisify(user.verifyKeys.bind(user));
		return verifyKeys().thenReturn(user);
	}).then(function (user) {
		requestKeyService.cacheKey(user.getSignKey(), "user-sign-" + user.getID(), requestKeyService.MAXCACHETIME);
		requestKeyService.cacheKey(user.getMainKey(), "user-main-" + user.getID(), requestKeyService.MAXCACHETIME);
	}).catch(function (e) {
		if (e instanceof sjcl.exception.corrupt) {
			alert("Password did not match. Logging out")

			sessionService.logout();

			return new Bluebird(function () {});
		}

		return Bluebird.reject(e)
	});
}

var ownUserCache = new CacheService("ownUser");

initService.registerCacheCallback(function () {
	return ownUserCache.get(sessionService.getUserID()).then(function (cacheEntry) {
		if (!cacheEntry) {
			throw new Error("No user Cache");
		}

		return loadOwnUser(cacheEntry.data, false);
	}).then(function () {
		ownUserStatus.loadedCacheResolve();
	});
});

initService.registerCallback(function (blockageToken) {
	return socketService.definitlyEmit("user.get", {
		id: sessionService.getUserID(),
		//TODO: use cachedInfo: getInfoFromCacheEntry(cachedInfo),
		blockageToken: blockageToken
	}).then(function (data) {
		return loadOwnUser(data, true).thenReturn(data);
	}).then(function (userData) {
		ownUserCache.store(sessionService.getUserID(), userData);

		ownUserStatus.loadedResolve();
		return null;
	});
});

module.exports = userService;
