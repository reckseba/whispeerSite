define([
		"angular",

		"localizationModule"
	], function (angular) {
	"use strict";
	return angular.module("ssn.register", ["ssn.services", "ssn.directives", "localization"]);
});