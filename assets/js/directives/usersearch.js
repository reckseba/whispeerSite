define(["step", "whispeerHelper"], function (step, h) {
	"use strict";

	function searchDirective(userService, $location) {
		return {
			transclude: false,
			scope:	{},
			restrict: "E",
			templateUrl: "/assets/views/directives/userSearch.html",
			replace: true,
			link: function postLink(scope, iElement, iAttrs) {
				scope.multiple = typeof iAttrs["multiple"] !== "undefined";

				if (iAttrs["size"] === "big") {
					scope.resultTemplate = "/assets/views/directives/userSearchResults.html";
				} else {
					scope.resultTemplate = "/assets/views/directives/userSearchResultsSmall.html";
				}

				var timer = null;

				function submitResults(results) {
					scope.$broadcast("queryResults", results);
				}

				function queryResults(query) {
					var theUsers;
					step(function () {
						userService.query(query, this);
					}, h.sF(function (user) {
						scope.empty = (user.length === 0);

						theUsers = user;
						var i;
						for (i = 0; i < user.length; i += 1) {
							user[i].loadBasicData(this.parallel());
						}
					}), h.sF(function () {
						var users = [];
						var i;
						for (i = 0; i < theUsers.length; i += 1) {
							users.push({
								user: theUsers[i],
								basic: theUsers[i].data.basic,
								id: theUsers[i].data.basic.id,
								name: theUsers[i].data.basic.name
							});
						}

						submitResults(users);
					}));
				}

				scope.$on("elementSelected", function (event, element) {
					if (!scope.multiple) {
						$location.path(element.user.getUrl());
					}
				});

				scope.$on("queryChange", function (event, query) {
					if (query.length >= 3) {
						window.clearTimeout(timer);
						timer = window.setTimeout(function () {
							queryResults(query);
						}, 250);
					} else {
						submitResults([]);
					}
				});
			}
		};
	}

	return searchDirective;
});