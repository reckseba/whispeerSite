define(["step", "whispeerHelper", "asset/state", "bluebird"], function (step, h, State, Bluebird) {
	"use strict";

	function addFriendDirective($timeout, errorService, circleService) {
		return {
			transclude: false,
			scope:	{
				user: "="
			},
			restrict: "E",
			templateUrl: "assets/views/directives/addFriend.html",
			replace: false,
			link: function postLink(scope) {
				var circleState = new State();

				scope.circles = {
					initial: function () {
						var user = h.parseDecimal(scope.user.id);
						var loadAllCircles = Bluebird.promisify(circleService.loadAll);

						return loadAllCircles().then(function () {
							return circleService.inWhichCircles(user).map(function (circle) {
								return circle.data;
							});
						});
					},
					callback: function (selected) {
						scope.circles.selectedElements = selected;
					},
					selectedElements: [],
					saving: circleState.data
				};

				scope.saveCircles = function () {
					step(function () {
						circleState.pending();
						$timeout(this, 200);
					}, h.sF(function () {
						var oldCircles = circleService.inWhichCircles(scope.user.id).map(function (e) {
							return h.parseDecimal(e.getID());
						});
						var newCircles = scope.circles.selectedElements.map(h.parseDecimal);

						var toAdd = h.arraySubtract(newCircles, oldCircles);
						var toRemove = h.arraySubtract(oldCircles, newCircles);

						var i;
						for (i = 0; i < toAdd.length; i += 1) {
							circleService.get(toAdd[i]).addPersons([scope.user.id], this.parallel());
						}

						for (i = 0; i < toRemove.length; i += 1) {
							circleService.get(toRemove[i]).removePersons([scope.user.id], this.parallel());
						}
						this.parallel()();
					}), errorService.failOnError(circleState));
				};

				scope.addFriend = function () {
					scope.user.user.addAsFriend();
				};
			}
		};
	}

	addFriendDirective.$inject = ["$timeout", "ssn.errorService", "ssn.circleService"];

	return addFriendDirective;
});