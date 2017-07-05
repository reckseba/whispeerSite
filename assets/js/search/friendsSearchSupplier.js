var userService = require("user/userService");

"use strict";
const angular = require('angular');
const Bluebird = require('bluebird');

module.exports = function () {
    angular.module("ssn.search").factory("friendsSearchSupplier", [function () {
        var Search = function () {};

        Search.prototype.search = function (query) {
            if (query.length < 3) {
                return Bluebird.reject(new Error("minimum3letters"));
            }

            var action = Bluebird.promisify(userService.queryFriends.bind(userService));

            return action(query).bind(this).map(function (user) {
                var loadBasicData = Bluebird.promisify(user.loadBasicData.bind(user));
                return loadBasicData().then(function () {
                    return user;
                });
            }).then(function (users) {
                return users.map(function (e) {
                    return e.data;
                });
            });
        };

        return Search;
    }]);
};
