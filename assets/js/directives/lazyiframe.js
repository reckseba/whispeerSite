define(["directives/directivesModule"], function (directivesModule) {
	"use strict";

	function lazyiframeDirective() {
		return {
			restrict: "E",
			template: "",
			link: function (scope, iElement, iAttrs) {
				var attributes = {};

				Object.keys(iAttrs.$attr).filter(function (attr) {
					return attr.indexOf("ng") !== 0;
				}).map(function (attr) {
					return {
						key: attr,
						val: iAttrs.$attr[attr]
					};
				}).forEach(function (attr) {
					attributes[attr.val] = iAttrs[attr.key];
				});

				iElement.append(
					jQuery("<iframe>").attr(attributes)
				);
			}
		};
	}

	directivesModule.directive("lazyiframe", lazyiframeDirective);
});
