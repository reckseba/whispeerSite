/**
* messagesController
**/

var ImageUploadService = require("services/imageUploadService");
var errorService = require("services/error.service").errorServiceInstance;
var messageService = require("messages/messageService");
var userService = require("user/userService");

"use strict";

const State = require('asset/state');
const Bluebird = require('bluebird');
const controllerModule = require('controllers/controllerModule');

function messagesController($scope, $state, $stateParams) {
    $scope.canSend = false;
    $scope.topicLoaded = false;

    var sendMessageState = new State.default();
    $scope.sendMessageState = sendMessageState.data;

    $scope.create = {
        text: "",
        setUsers: function (users) {
            $scope.create.users = users;
        },
        users: [],
        images: [],
        removeImage: function (index) {
            $scope.create.images.splice(index, 1);
        },
        addImages: ImageUploadService.fileCallback(function (newImages) {
            $scope.$apply(function () {
                $scope.create.images = $scope.create.images.concat(newImages);
            });
        }),
        send: function (receiver, text, images) {
            images = images || [];

            sendMessageState.pending();

            if (text === "" && images.length === 0) {
                sendMessageState.failed();
                return;
            }

            var newTopicPromise = messageService.sendNewTopic(receiver, text, images).then(function (id) {
                $scope.create.text = "";
                $scope.create.selectedElements = [];
                $scope.goToShow(id);
                $scope.$broadcast("resetSearch");
            });

            errorService.failOnErrorPromise(sendMessageState, newTopicPromise);
        }
    };


    $scope.topics = messageService.data.latestTopics.data;

    function getUser(userid) {
        var findUser = Bluebird.promisify(userService.get.bind(userService));

        return findUser(userid).then(function (user) {
            var loadBasicData = Bluebird.promisify(user.loadBasicData.bind(user));

            return loadBasicData().then(function () {
                return [user.data];
            });
        });
    }

    function loadInitialUser() {
        if (!$stateParams.userid) {
            return Bluebird.resolve([]);
        }

        return messageService.getUserTopic($stateParams.userid).then(function (topicid) {
            if (topicid) {
                $scope.goToShow(topicid);
                return [];
            } else {
                return getUser($stateParams.userid);
            }
        });
    }

    $scope.goToShow = function (topicid) {
        $state.go("app.messages.show", {
            topicid: topicid
        });
    };

    var loadInitialUserPromise = loadInitialUser();

    $scope.getInitialUser = function () {
        return loadInitialUserPromise;
    };

}


messagesController.$inject = ["$scope", "$state", "$stateParams"];

controllerModule.controller("ssn.messagesCreateController", messagesController);
