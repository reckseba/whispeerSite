/**
* friendsController
**/

var cssService = require("services/css.service").default;
var friendsService = require("services/friendsService");
var localize = require("i18n/localizationConfig");
var userService = require("user/userService");

"use strict";

const Bluebird = require("bluebird");
const h = require("whispeerHelper").default;
const controllerModule = require("controllers/controllerModule");

function friendsController($scope)  {
    cssService.setClass("friendsView");
    $scope.friends = [];
    $scope.requests = [];
    $scope.friendsLoading = true;
    $scope.friendsFilter = {
        name: ""
    };

    $scope.removeFriend = function (user) {
        if (confirm(localize.getLocalizedString("magicbar.requests.confirmRemove", { user: user.name }))) {
            user.user.removeAsFriend();
        }
    };

    function loadFriendsUsers() {
        return Bluebird.try(function () {
            var friends = friendsService.getFriends();
            return userService.getMultipleFormatted(friends);
        }).then(function (result) {
            $scope.friends = result;
            $scope.friendsLoading = false;
        });
    }

    function loadRequestsUsers() {
        return Bluebird.try(function () {
            var requests = friendsService.getRequests();

            var getMultipleFormatted = Bluebird.promisify(userService.getMultipleFormatted);
            return getMultipleFormatted(requests);
        }).then(function (result) {
            $scope.requests = result;
        });
    }

    friendsService.awaitLoading().then(function () {
        friendsService.listen(loadFriendsUsers);
        friendsService.listen(loadRequestsUsers);
        loadFriendsUsers();
        loadRequestsUsers();
    });

    $scope.acceptRequest = function (request) {
        request.user.acceptFriendShip();
    };

    $scope.ignoreRequest = function (request) {
        request.user.ignoreFriendShip();
    };
}

friendsController.$inject = ["$scope"];

controllerModule.controller("ssn.friendsController", friendsController);
