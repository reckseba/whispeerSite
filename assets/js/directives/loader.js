var Bluebird = require("bluebird");
var userService = require("user/userService");
var errorService = require("services/error.service").errorServiceInstance;

define(["whispeerHelper", "directives/directivesModule"], function (h, directivesModule) {
	"use strict";

	// <loader data-model="user" data-ng-repeat="user in invite.usedBy" data-id="user" data-scope-attribute="user">

	function loaderDirective() {
		return {
			restrict: "E",
			scope: {
				model: "@",
				id: "=",
				scopeAttribute: "@"
			},
			transclude: true,

			link: function(scope, element, attrs, ctrl, transclude) {
				scope.loading = true;
				scope.loaded = false;

				if (scope.model === "user") {
					Bluebird.try(function () {
						return userService.get(scope.id);
					}).then(function (user) {
						return user.loadBasicData().thenReturn(user);
					}).then(function (user) {
						scope[scope.scopeAttribute] = user.data;
						scope.loaded = true;
						scope.loading = false;
					}).catch(errorService.criticalError);
				}

				transclude(scope, function(clone) {
					element.append(clone);
				});
			}
		};
	}

	directivesModule.directive("loader", [loaderDirective]);

});
