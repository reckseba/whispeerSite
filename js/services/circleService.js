/**
* MessageService
**/
define(["step", "whispeerHelper", "valid/validator"], function (step, h, validator) {
	"use strict";

	var service = function ($rootScope, socket, userService, keyStore) {
		var circles = {};
		var circleArray = [];
		var circleData = [];

		var Circle = function (data) {
			var id = data.id, user = data.user, name = data.name, decrypted = false, theCircle = this;
			var decryptedName;

			this.getID = function getIDF() {
				return id;
			};

			this.getUserIDs = function () {
				return user;
			};

			this.decrypt = function (cb) {
				step(function () {
					if (!decrypted) {
						var own = userService.getown();
						var mainKey = own.getMainKey();

						keyStore.sym.decrypt(JSON.parse(name), mainKey, this);
						decrypted = true;
					}
				}, h.sF(function (name) {
					decryptedName = name;
					theCircle.data.name = name;

					this.ne();
				}), cb);
			};

			this.data = {
				id: id,
				userids: data.user,
				name: "",
				image: "/img/profil.jpg",
				persons: []
			};
		};

		/*socket.listen("circle", function (e, data) {
			if (!e) {

			} else {
				console.error(e);
			}
		});*/

		var loaded = false, loading = false;

		function makeCircle(data) {
			var circle = new Circle(data);
			var id = circle.getID();

			if (circles[id]) {
				return;
			}

			circles[id] = circle;
			circleArray.push(circle);
			circleData.push(circle.data);

			return circle;
		}

		var circleService = {
			data: {
				loaded: false,
				loading: false,
				circles: circleData
			},
			create: function (name, cb) {
				var key;
				step(function () {
					keyStore.sym.generateKey(this);
				}, h.sF(function (symKey) {
					key = symKey;
					var own = userService.getown();
					var mainKey = own.getMainKey();

					this.parallel.unflatten();

					keyStore.sym.encrypt(name, mainKey, this.parallel());
					keyStore.sym.symEncryptKey(symKey, mainKey, this.parallel());
				}), h.sF(function (encrypted) {
					var keyData = keyStore.upload.getKey(key);

					socket.emit("circles.add", {
						circle: {
							key: keyData,
							name: JSON.stringify(encrypted)
						}
					}, this);
				}), h.sF(function (data) {
					makeCircle(data.result).decrypt(this);
				}), cb);
			},
			reset: function () {
				circles = {};
				circleArray = [];
				circleData = [];
			},
			loadAll: function (cb) {
				step(function () {
					if (!loaded && !loading) {
						loading = true;
						circleService.data.loading = false;

						socket.emit("circles.getAll", {
							fullKey: true
						}, this);
					} else {
						this.last.ne();
					}
				}, h.sF(function (data) {
					var i, c;
					if (data.circles) {
						for (i = 0; i < data.circles.length; i += 1) {
							c = makeCircle(data.circles[i]);
							c.decrypt(this.parallel());
						}

						this.parallel()();
					} else {
						//TO-DO handle error
					}
				}), h.sF(function () {
					circleService.data.loading = false;
					circleService.data.loaded = true;
					loaded = true;

					this.ne();
				}), cb);
			}
		};

		$rootScope.$on("ssn.reset", function () {
			circleService.reset();
		});

		return circleService;
	};

	service.$inject = ["$rootScope", "ssn.socketService", "ssn.userService", "ssn.keyStoreService"];

	return service;
});