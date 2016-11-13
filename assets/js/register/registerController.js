/**
* loginController
**/

define([
		"bluebird",
		"whispeerHelper",
		"asset/state",
		"register/registerModule",
		"services/errorService",
		"register/registerService",
		"services/locationService"
	], function (Bluebird, h, State, registerModule) {
	"use strict";

	function registerController($scope, $timeout, errorService, registerService, locationService) {
		var registerState = new State();

		function hasLocalStorage() {
			try {
				localStorage.setItem("localStorageTest", "localStorageTest");
				localStorage.removeItem("localStorageTest");
				return true;
			} catch (e) {
				return !!window.indexedDB;
			}
		}

		function hasWebWorker() {
			return !!window.Worker;
		}

		function isAndroid() {
			return navigator.userAgent.toLowerCase().indexOf("android") > -1;
		}

		function isUIView() {
			return /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(navigator.userAgent);
		}

		function isTwitterBrowser() {
			 return !!window.navigator.userAgent.match(/twitter/gi);
		}

		$scope.browser = {
			old: !hasLocalStorage() || !hasWebWorker(),
			specific: "old",
			android: isAndroid()
		};

		registerService.setPreID();

		if (isTwitterBrowser()) {
			$scope.browser.specific = "twitter";
		} else if (isUIView()) {
			$scope.browser.specific = "uiview";
		}

		$scope.registerState = registerState.data;

		$scope.pwState = { password: "" };

		$scope.registerData = {
			nicknameCheckLoading: false,
			nicknameCheck: false,
			nicknameCheckError: false,

			nickNameError: true
		};

		window.setTimeout(function () {
			jQuery("#rnickname").focus();
		}, 50);

		$scope.registerFormClick = function formClickF() {
			registerService.startKeyGeneration();
		};

		$scope.startKeyGeneration = function startKeyGen1() {
			registerService.startKeyGeneration();
		};

		$scope.nicknameChange = function () {
			Bluebird.try(function nicknameCheck() {
				var internalNickname = $scope.registerData.nickname;
				$scope.registerData.nicknameCheckLoading = true;
				$scope.registerData.nicknameCheck = false;
				$scope.registerData.nicknameCheckError = false;

				return registerService.nicknameUsed(internalNickname);
			}).then(function nicknameChecked(nicknameUsed) {
				$scope.registerData.nicknameCheckLoading = false;

				if (nicknameUsed === false) {
					$scope.registerData.nicknameCheck = true;
				} else if (nicknameUsed === true) {
					$scope.registerData.nicknameCheck = false;
				} else {
					$scope.registerData.nicknameCheckError = true;
				}
			}).catch(errorService.criticalError);
		};

		$timeout($scope.nicknameChange);

		$scope.empty = function (val) {
			return val === "" || !h.isset(val);
		};

		$scope.nicknameEmpty = function () {
			return $scope.empty($scope.registerData.nickname);
		};

		$scope.nicknameInvalid = function () {
			return !$scope.empty($scope.registerData.nickname) && !h.isNickname($scope.registerData.nickname);
		};

		$scope.nicknameUsed = function () {
			return !$scope.empty($scope.registerData.nickname) && h.isNickname($scope.registerData.nickname) && !$scope.registerData.nicknameCheck && !$scope.registerData.nicknameCheckLoading;
		};

		$scope.isAgbError = function () {
			return !$scope.registerData.agb;
		};

		$scope.validationOptions = {
			validateOnCallback: true,
			hideOnInteraction: true
		};

		$scope.acceptIconNicknameFree = function acceptIconNickname() {
			if ($scope.registerData.nicknameCheckLoading) {
				return "fa-spinner";
			}

			if ($scope.registerData.nicknameCheckError === true) {
				return "fa-warning";
			}

			if ($scope.registerData.nicknameCheck) {
				return "fa-check";
			}

			return "fa-times";
		};

		$scope.nicknameValidations = [
			{ validator: "nicknameEmpty()", translation: "login.register.errors.nickEmpty" },
			{ validator: "nicknameInvalid()", translation: "login.register.errors.nickInvalid", onChange: 500 },
			{ validator: "nicknameUsed()", translation: "login.register.errors.nickUsed", onChange: 500 }
		];

		$scope.agbValidations = [
			{ validator: "isAgbError()", translation: "login.register.errors.agb" }
		];


		$scope.register = function doRegisterC() {
			registerState.pending();
			if ($scope.validationOptions.checkValidations()) {
				registerState.failed();
				return;
			}

			var settings = {
				meta: {
					initialLanguage: h.getLanguageFromPath()
				},
				content: {}
			};

			var profile = {
				pub: {},
				priv: {},
				nobody: {},
				metaData: {
					scope: "always:allfriends"
				}
			};

			var inviteCode = locationService.getUrlParameter("code");

			var registerPromise = Bluebird.try(function () {
				console.time("register");

				locationService.setReturnUrl("/backup");
				return registerService.register($scope.registerData.nickname, "", $scope.pwState.password, profile, settings, inviteCode);
			}).then(function (e) {
				if (!e) {
					locationService.mainPage();
				}

				console.timeEnd("register");
				console.log("register done!");

				return e;
			});

			errorService.failOnErrorPromise(registerState, registerPromise);
		};
	}

	registerController.$inject = ["$scope", "$timeout", "ssn.errorService", "ssn.registerService", "ssn.locationService", "ssn.socketService"];

	registerModule.controller("ssn.registerController", registerController);
});
