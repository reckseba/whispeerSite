var circleService = require("circles/circleService");
var errorService = require("services/error.service").errorServiceInstance;
var localize = require("i18n/localizationConfig");

"use strict";

const circlesModule = require('controllers/controllerModule');
const h = require("whispeerHelper").default;
const Bluebird = require('bluebird');
const State = require('asset/state');

function circlesShowController($scope, $stateParams, $state) {
    var addUsersToCircleState = new State.default();
    $scope.addUsersToCircle = addUsersToCircleState.data;

    $scope.circleid = $stateParams.circleid;
    $scope.thisCircle = {};
    $scope.circleLoading = true;

    circleService.loadAll().then(function() {
        var theCircle = circleService.get($stateParams.circleid);
        $scope.thisCircle = theCircle.data;
        return theCircle.loadPersons();
    }).then(function() {
        $scope.circleLoading = false;
    }).catch(errorService.criticalError);

    $scope.editingTitle = {
        "success":		true,
        "failure":		false,
        "operation":	false,
        "active":		false
    };

    $scope.editTitle = function () {
        $scope.editingTitle.active = true;
    };

    $scope.saveTitle = function () {
        $scope.editingTitle.success = true;
        $scope.editingTitle.active = false;
    };

    $scope.getLength = function(obj) {
        return obj.length;
    };

    $scope.removeUser = function (user) {
        circleService.get($scope.circleid).removePersons([user.id], errorService.criticalError);
    };

    var usersToAdd;
    $scope.setUsersToAdd = function (users) {
        usersToAdd = users;
    };

    $scope.addUsers = function () {
        addUsersToCircleState.pending();

        var promise = circleService.get($scope.circleid).addPersons(usersToAdd).then(function() {
            $scope.$broadcast("resetSearch");
        });

        errorService.failOnErrorPromise(addUsersToCircleState, promise);
    };

    $scope.removeCircle = function () {
        var response = confirm(localize.getLocalizedString("views.circles.removeCircle"));

        if (!response) {
            return;
        }

        circleService.get($scope.circleid).remove().then(function() {
            if ($scope.mobile) {
                $state.go("app.circles.list");
            } else {
                $state.go("app.circles.new");
            }
        }).catch(errorService.criticalError);
    };
}


circlesShowController.$inject = ["$scope", "$stateParams", "$state"];

circlesModule.controller("ssn.circlesShowController", circlesShowController);
