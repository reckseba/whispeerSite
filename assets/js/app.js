define([
	"angular",
	"angularUiRouter",
	"controllers/controllers",
	"services/services",
	"runners/runners",
	"filter/filter",
	"directives/directives",
	"search/loader",
	"models/models",
	"config/interceptorsConfig",
	"localizationModule",
	"emptyInclude"
], function (angular) {
	"use strict";

	return angular.module("ssn", [
		"ssn.controllers",
		"ssn.models",
		"ssn.services",
		"ssn.directives",
		"ssn.filter",
		"ssn.search",
		"ssn.runners",
		"ssn.interceptors.config",
		"ssn.locale.config",

		"localization",
		"ui.router",
		"ngTouch"
	], function ($compileProvider) {
		$compileProvider.imgSrcSanitizationWhitelist(/^\s*(https?|ftp|file|blob|app):|data:image\//);
		$compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|tel|file|app):/);
	});
});
