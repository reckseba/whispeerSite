define(["angular", "directives/savebutton", "directives/mobile", "directives/isIframe", "localizationModule"], function (angular) {
	"use strict";
	return angular.module("ssn.login", ["ssn.services", "ssn.directives", "localization"]);
});