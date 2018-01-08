var keyStoreService = require("services/keyStore.service").default;
var socketService = require("services/socket.service").default;
var Profile = require("users/profile").default;
var Storage = require("services/storage.service");
var errorService = require("services/error.service").errorServiceInstance;

var Bluebird = require("bluebird");
var h = require("../helper/helper").default;

var trustManager = require("../crypto/trustManager");
var SecuredData = require("../asset/securedDataWithMetaData").default

var keyGenPromise
const sessionStorage = Storage.withPrefix("whispeer.session")
const tokenStorage = Storage.withPrefix("whispeer.token")
const clientStorage = Storage.withPrefix("whispeer.client")
var registerPromise;

var registerService = {
	register: function (nickname, mail, password, profile, settings, inviteCode) {
		var keys;

		if (!registerPromise) {
			registerPromise = Bluebird.try(function register1() {
				return registerService.startKeyGeneration();
			}).then(function register2(theKeys) {
				keys = theKeys;

				if (nickname) {
					keyStoreService.setKeyGenIdentifier(nickname);
				} else {
					throw new Error("need nickname");
				}

				var privateProfile = new Profile({
					content: profile.priv
				});

				var privateProfileMe = new Profile({
					content: h.objectJoin(h.objectJoin(profile.priv, profile.pub), profile.nobody),
					meta: { myProfile: true }
				});

				var publicProfile = new Profile({
					content: profile.pub || {}
				}, { isPublicProfile: true });

				var correctKeys = h.objectMap(keys, keyStoreService.correctKeyIdentifier);
				var ownKeys = {main: correctKeys.main, sign: correctKeys.sign};
				delete correctKeys.main;
				delete correctKeys.profile;

				var signedKeys = SecuredData.load(undefined, correctKeys, { type: "signedKeys" });

				trustManager.allow(5);

				return Bluebird.all([
					privateProfile.signAndEncrypt(keys.sign, keys.profile),
					privateProfileMe.signAndEncrypt(keys.sign, keys.main),
					publicProfile.sign(keys.sign),

					SecuredData.createAsync(settings.content, settings.meta, { type: "settings" }, keys.sign, keys.main),

					signedKeys.sign(keys.sign),

					keyStoreService.security.makePWVerifiable(ownKeys, password),

					keyStoreService.random.hex(16),

					keyStoreService.sym.pwEncryptKey(keys.main, password),
					keyStoreService.sym.symEncryptKey(keys.profile, keys.friends),
				]);
			}).spread(function register3(privateProfile, privateProfileMe, publicProfile, settings, signedKeys, signedOwnKeys, salt) {
				keys = h.objectMap(keys, keyStoreService.correctKeyIdentifier);
				trustManager.disallow();

				var registerData = {
					password: {
						salt: salt,
						hash: keyStoreService.hash.hashPW(password, salt),
					},
					keys: h.objectMap(keys, keyStoreService.upload.getKey),
					signedKeys: signedKeys,
					signedOwnKeys: signedOwnKeys,
					inviteCode: "whispeerfj",
					profile: {
						pub: publicProfile,
						priv: [privateProfile],
						me: privateProfileMe
					},
					settings: settings
				};

				if (mail) {
					registerData.mail = mail;
				}

				if (nickname) {
					registerData.nickname = nickname;
				}

				if (inviteCode) {
					registerData.inviteCode = inviteCode;
				}

				registerData.preID = clientStorage.get("preID") || "";

				registerData.token = tokenStorage.get("token")

				return socketService.emit("session.register", registerData);
			}).then(function (result) {
				if (result.sid) {
					sessionStorage.set("sid", result.sid);
					sessionStorage.set("userid", result.userid);
					sessionStorage.set("loggedin", true);
					sessionStorage.set("password", password);
				}

				keyStoreService.security.setPassword(password);

				return result;
			}).finally(function () {
				registerPromise = null;
			});
		}

		return registerPromise;
	},
	setPreID: function () {
		Bluebird.try(function () {
			return socketService.awaitConnection();
		}).then(function () {
			if (clientStorage.get("preID")) {
				return clientStorage.get("preID");
			}

			return keyStoreService.random.hex(40);
		}).then(function (preID) {
			clientStorage.set("preID", preID);

			return socketService.emit("preRegisterID", {
				id: preID
			});
		}).catch(errorService.criticalError);
	},

	startKeyGeneration: function () {
		var toGenKeys = [
			["main", "sym"],
			["sign", "sign"],
			["crypt", "asym"],
			["profile", "sym"],
			["friends", "sym"]
		];

		var ks = keyStoreService;

		function getCorrectKeystore(key) {
			return ks[key[1]];
		}

		if (!keyGenPromise) {
			keyGenPromise = Bluebird.try(function () {
				return Bluebird.all(toGenKeys.map(function (key) {
					return getCorrectKeystore(key).generateKey(null, key[0]);
				})).then(function (resultKeys) {
					var keys = {};

					return Bluebird.all(toGenKeys.map(function (key, index) {
						var resultKey = resultKeys[index];

						keys[key[0]] = resultKey;

						if (index > 0) {
							return getCorrectKeystore(key).symEncryptKey(resultKey, resultKeys[0]);
						}
					})).thenReturn(keys);
				});
			});
		}

		return keyGenPromise;
	},

	mailUsed: function (mail, callback) {
		if (mail === "" || !h.isMail(mail)) {
			return Bluebird.resolve(true).nodeify(callback);
		}

		return Bluebird.try(function mailCheck() {
			return socketService.emit("mailFree", {
				mail: mail
			});
		}).then(function mailResult(data) {
			if (data.mailUsed === true) {
				return true;
			}

			if (data.mailUsed === false) {
				return false;
			}

			throw new Error("invalid server response");
		}).nodeify(callback);
	},

	nicknameUsed: function (nickname, callback) {
		if (nickname === "" || !h.isNickname(nickname)) {
			return Bluebird.resolve(true).nodeify(callback);
		}

		return socketService.awaitConnection().then(function () {
			return socketService.emit("nicknameFree", {
				nickname: nickname
			});
		}).then(function nicknameResult(data) {
			if (data.nicknameUsed === true) {
				return true;
			} else if (data.nicknameUsed === false) {
				return false;
			}

			throw new Error("invalid server response");
		}).nodeify(callback);
	}
};

module.exports = registerService;
