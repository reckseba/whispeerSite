/**
* circlesController
**/

define(["step"], function (step) {
	"use strict";

	function circlesController($scope, cssService, circleService) {
		cssService.setClass("circlesView");
		$scope.getLength = function(obj) {
			return obj.length;
		};

		$scope.shortenString = function(string, length) {
			if (string.length > length) {
				return string.substr(0, length-3) + "...";
			}
			return string;
		};

		circleService.loadAll(function (e) {
			if (e) {
				debugger;
			}
		});

		$scope.createNew = function (name) {
			circleService.create(name, function (e) {
				if (e) {
					debugger;
				}
			});
		};

		$scope.showCircle = true;
		$scope.circles = circleService.data.circles;
		[
			{
				"id": "1",
				"name":	"Liste der geilsten Personen auf der Ganzen Welt, oh mein Gott bin ich hipster! xoxoxoxo dreieck!!",
				"image": "/assets/img/user.png",
				"persons": [
				]
			}
		];
		$scope.thisCircle = {
			"id": "1",
			"name":	"Liste der geilsten Personen auf der Ganzen Welt, oh mein Gott bin ich hipster! xoxoxoxo dreieck!!",
			"image": "/assets/img/user.png",
			"persons": [
				{
					"id": "1",
					"name":"Testy Test",
					"samefriends":	"23",
					"image":	"/assets/img/user.png"
				}	
			]
		};
	}

	circlesController.$inject = ["$scope", "ssn.cssService", "ssn.circleService"];

	return circlesController;
});