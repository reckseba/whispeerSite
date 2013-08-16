/**
* sessionController
**/

define(["step", "whispeerHelper"], function (step, h) {
	"use strict";

	function rootController($scope, sessionService, sessionHelper, userService, cssService) {
		$scope.loggedin = false;

		$scope.user = {};

		$scope.user.name = "";
		$scope.user.image = "img/profil.jpg";
		$scope.user.id = "0";

		$scope.$on("ssn.login", function () {
			$scope.loggedin = sessionService.isLoggedin();
		});

		$scope.$on("ssn.ownLoaded", function () {
			step(function () {
				if ($scope.loggedin) {
					var user = userService.getown();
					$scope.user.id = user.getID();
					this.parallel.unflatten();

					user.getName(this.parallel());
					user.getImage(this.parallel());
				}
			}, h.sF(function (name, image) {
				$scope.user.name = name;
				$scope.user.image = image;

				console.log("Own Name loaded:" + (new Date().getTime() - startup));
			}));
		});

		cssService.addListener(function (newClass) {
			$scope.cssClass = newClass;
		});

		$scope.cssClass = cssService.getClass();

		$scope.logout = function () {
			sessionHelper.logout();
		};
		
		$scope.searchUsers = [
		{
			"name":	"Luisa Katharina Marschner",
			"mutuals":	"20",
			"location":	"Enger",
			"age":	"16",
			"image":	"img/profil.jpg"
		},{
			"name":	"Daniel Melchior",
			"mutuals":	"450",
			"location":	"Enger",
			"age":	"16",
			"image":	"img/profil.jpg"
		},{
			"name":	"Michelle Thenhausen",
			"mutuals":	"13",
			"location":	"Spenge",
			"age":	"19",
			"image":	"img/profil.jpg"
		},
		{
			"name":	"Jacqueline Thenhausen",
			"mutuals":	"20",
			"location":	"Spenge",
			"age":	"23",
			"image":	"img/profil.jpg"
		},
		{
			"name":	"Svenja Kenneweg",
			"mutuals":	"220",
			"location":	"Enger",
			"age":	"16",
			"image":	"img/profil.jpg"
		},{
			"name":	"Anna Marie Marschner",
			"mutuals":	"20",
			"location":	"Enger",
			"age":	"24",
			"image":	"img/profil.jpg"
		}
		];
	}

	rootController.$inject = ["$scope", "ssn.sessionService", "ssn.sessionHelper", "ssn.userService", "ssn.cssService"];

	return rootController;
});