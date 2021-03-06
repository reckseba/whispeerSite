var templateUrl = require("../../views/directives/modal.html");

"use strict";
const jQuery = require("jquery");
const directivesModule = require("directives/directivesModule");
directivesModule.directive("modal", function () {
	return {
		scope: {
			visible: "=show",
			loading: "=loading"
		},
		restrict: "E",
		templateUrl: templateUrl,
		replace: true,
		transclude: true,
		link: function (scope) {
			var ESC = 27;
			var CLOSEKEYS = [ESC];

			scope.hide = function () {
				scope.visible = false;
			};

			scope.show = function () {
				scope.visible = true;
			};

			scope.toggle = function () {
				scope.visible = !scope.visible;
			};

			jQuery(document).keyup(function (e) {
				if (scope.visible && CLOSEKEYS.indexOf(e.keyCode) > -1) {
					scope.visible = false;
					scope.$applyAsync();
				}
			});
		}
	};
});
