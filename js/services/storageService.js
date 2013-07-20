/* jshint undef: true, unused: true */
/* global localStorage */


/**
* StorageService
**/
define([], function () {
	"use strict";

	var available = true, polyfill = {};

	var service = function () {
		return {
			get: function getF(key) {
				if (available) {
					return localStorage.getItem(key);
				} else {
					return polyfill[key];
				}
			},

			set: function setF(key, data) {
				if (available) {
					localStorage.setItem(key, data);
				} else {
					polyfill[key] = data;
				}
			},

			remove: function removeF(key) {
				if (available) {
					localStorage.removeItem(key);
				} else {
					delete polyfill[key];
				}
			},

			clear: function clearF() {
				polyfill = {};
				localStorage.clear();
			}
		};
	};

	service.$inject = [];

	return service;
});