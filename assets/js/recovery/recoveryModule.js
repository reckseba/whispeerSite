define(["angular"], function (angular) {
	"use strict";
	return angular.module("ssn.recovery", ["ssn.services", "ssn.directives", "ssn.models", "ssn.interceptors.config", "localization", "ngRoute"]);
});
