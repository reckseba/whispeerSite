/**
* loginController
**/

define(["step", "whispeerHelper", "asset/state", "controllers/controllerModule"], function (step, h, State, controllerModule) {
	"use strict";

	function registerController($scope, $routeParams, keyStore, errorService, sessionHelper, locationService) {
		var registerState = new State();

		$scope.registerState = registerState.data;

		$scope.pwState = { password: "" };

		$scope.nickname = "";
		$scope.nicknameCheckLoading = false;
		$scope.nicknameCheck = false;
		$scope.nicknameCheckError = false;

		$scope.nickNameError = true;

		$scope.agb = false;

		if ($routeParams.register) {
			window.setTimeout(function () {
				jQuery("#rnickname").focus();
			}, 50);
		}

		$scope.registerFormClick = function formClickF() {
			sessionHelper.startKeyGeneration();
		};

		$scope.startKeyGeneration = function startKeyGen1() {
			sessionHelper.startKeyGeneration();
		};

		$scope.nicknameChange = function nicknameChange() {
			step(function nicknameCheck() {
				var internalNickname = $scope.nickname;
				$scope.nicknameCheckLoading = true;
				$scope.nicknameCheck = false;
				$scope.nicknameCheckError = false;

				sessionHelper.nicknameUsed(internalNickname, this);
			}, function nicknameChecked(e, nicknameUsed) {
				errorService.criticalError(e);

				$scope.nicknameCheckLoading = false;

				if (nicknameUsed === false) {
					$scope.nicknameCheck = true;
				} else if (nicknameUsed === true) {
					$scope.nicknameCheck = false;
				} else {
					$scope.nicknameCheckError = true;
				}
			});
		};

		$scope.empty = function (val) {
			return val === "" || !h.isset(val);
		};

		$scope.nicknameEmpty = function () {
			return $scope.empty($scope.nickname);
		};

		$scope.nicknameInvalid = function () {
			return !$scope.empty($scope.nickname) && !h.isNickname($scope.nickname);
		};

		$scope.nicknameUsed = function () {
			return !$scope.empty($scope.nickname) && h.isNickname($scope.nickname) && !$scope.nicknameCheck && !$scope.nicknameCheckLoading;
		};

		$scope.isAgbError = function () {
			return !$scope.agb;
		};

		$scope.validationOptions = {
			validateOnCallback: true,
			hideOnInteraction: true
		};

		$scope.acceptIconNicknameFree = function acceptIconNickname() {
			if ($scope.nicknameCheckLoading) {
				return "fa-spinner";
			}

			if ($scope.nicknameCheckError === true) {
				return "fa-warning";
			}

			if ($scope.nicknameCheck) {
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

			var settings = {};
			var imageBlob;

			var profile = {
				pub: {},
				priv: {},
				nobody: {},
				metaData: {
					scope: "always:allfriends"
				}
			};

			step(function () {
				console.time("register");
				locationService.setReturnURL("/setup");
				sessionHelper.register($scope.nickname, "", $scope.pwState.password, profile, imageBlob, settings, this);
			}, function (e) {
				if (!e) {
					locationService.mainPage();
				}

				console.timeEnd("register");
				console.log("register done!");

				this(e);
			}, errorService.failOnError(registerState));
		};
	}

	registerController.$inject = ["$scope", "$routeParams", "ssn.keyStoreService", "ssn.errorService", "ssn.sessionHelper", "ssn.locationService", "ssn.socketService"];

	controllerModule.controller("ssn.registerController", registerController);
});
