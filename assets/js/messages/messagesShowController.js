/**
* messagesController
**/

var Burst = require("./burst");

var errorService = require("services/error.service").errorServiceInstance;
var ImageUploadService = require("services/imageUploadService");
var messageService = require("messages/messageService");
var TopicUpdate = require("models/topicUpdate");

"use strict";

const jQuery = require('jquery');
const h = require("whispeerHelper").default;
const State = require('asset/state');
const Bluebird = require('bluebird');
const messagesModule = require('messages/messagesModule');

function messagesController($scope, $element, $state, $stateParams, $timeout) {
    var topicLoadingState = new State.default();
    $scope.topicLoadingState = topicLoadingState.data;

    var topicID = h.parseDecimal($stateParams.topicid);

    $scope.canSend = false;
    $scope.topicLoaded = false;

    $scope.hideOverlay = false;

    $scope.doHideOverlay = function () {
        $scope.hideOverlay = true;
    };

    $scope.images = {
        images: [],
        removeImage: function (index) {
            $scope.images.images.splice(index, 1);
        },
        addImages: ImageUploadService.fileCallback(function (newImages) {
            $scope.$apply(function () {
                $scope.images.images = $scope.images.images.concat(newImages);
            });
        })
    };

    $scope.markRead = function () {
        $scope.activeTopic.obj.markRead(errorService.criticalError);
    };

    $scope.loadMoreMessages = function () {
        var loadMore = Bluebird.promisify($scope.activeTopic.obj.loadMoreMessages.bind($scope.activeTopic.obj));

        $scope.loadingMessages = true;
        return loadMore().then(function () {
            $scope.loadingMessages = false;
        });
    };

    $scope.$on("$destroy", function () {
        messageService.setActiveTopic(0);
    });

    topicLoadingState.pending();

    function loadMoreUntilFull() {
        Bluebird.delay(500).then(function () {
            var scroller = $element.find(".scroll-pane");

            var outerHeight = scroller.height();
            var innerHeight = 0;
            scroller.children().each(function(){
                innerHeight = innerHeight + jQuery(this).outerHeight(true);
            });

            if (outerHeight > innerHeight) {
                return $scope.loadMoreMessages().then(function () {
                    loadMoreUntilFull();

                    return null;
                });
            }
        });
    }

    var loadTopicsPromise = messageService.getTopic(topicID).then(function (topic) {
        messageService.setActiveTopic(topicID);
        $scope.activeTopic = topic.data;

        $scope.canSend = true;
        $scope.newMessage = false;
        return topic.loadInitialMessages().thenReturn(topic);
    }).then(function (topic) {
        $scope.topicLoaded = true;

        if (topic.data.messagesAndUpdates.length > 0) {
            topic.markRead(errorService.criticalError);
        }

        loadMoreUntilFull();

        return null;
    });

    errorService.failOnErrorPromise(topicLoadingState, loadTopicsPromise);

    var sendMessageState = new State.default();
    $scope.sendMessageState = sendMessageState.data;

    $scope.sendMessage = function () {
        sendMessageState.pending();

        var images = $scope.images.images;
        var text = $scope.activeTopic.newMessage;

        if (text === "" && images.length === 0) {
            sendMessageState.failed();
            return;
        }

        $scope.canSend = false;

        var sendMessagePromise = messageService.sendMessage($scope.activeTopic.id, text, images).then(function () {
            $scope.activeTopic.newMessage = "";
            $scope.images.images = [];
            $scope.markRead(errorService.criticalError);
            $timeout(function () {
                sendMessageState.reset();
            }, 2000);
        });

        sendMessagePromise.finally(function () {
            $scope.canSend = true;
        });

        errorService.failOnErrorPromise(sendMessageState, sendMessagePromise);
    };

    var bursts = [], burstTopic;

    function getNewElements(messagesAndUpdates, bursts) {
        return messagesAndUpdates.filter(function (message) {
            return bursts.reduce(function (prev, current) {
                return prev && !current.hasItem(message);
            }, true);
        });
    }

    function calculateBursts(messages) {
        var bursts = [new Burst(TopicUpdate)];
        var currentBurst = bursts[0];

        messages.sort(function (m1, m2) {
            return m2.getTime() - m1.getTime();
        });

        messages.forEach(function (messageOrUpdate) {
            if(!currentBurst.fitsItem(messageOrUpdate)) {
                currentBurst = new Burst(TopicUpdate);
                bursts.push(currentBurst);
            }

            currentBurst.addItem(messageOrUpdate);
        });

        return bursts;
    }

    function hasMatchingMessage(oldBurst, newBurst) {
        var matchingMessages = newBurst.getItems().filter(function (message) {
            return oldBurst.hasItem(message);
        });

        return matchingMessages.length > 0;
    }

    function addBurst(bursts, burst) {
        bursts.push(burst);

        return true;
    }

    function mergeBurst(oldBurst, newBurst) {
        var newMessages = newBurst.getItems().filter(function (message) {
            return !oldBurst.hasItem(message);
        });

        newMessages.forEach(function (message) {
            oldBurst.addItem(message);
        });

        return true;
    }

    function addBurstOrMerge(bursts, burst) {
        var possibleMatches = bursts.filter(function (oldBurst) {
            return hasMatchingMessage(oldBurst, burst);
        });

        if (possibleMatches.length === 0) {
            return addBurst(bursts, burst);
        }

        if (possibleMatches.length === 1) {
            return mergeBurst(possibleMatches[0], burst);
        }

        if (possibleMatches.length > 1) {
            errorService.criticalError(new Error("Burst merging possible matches > 1 wtf..."));
            return false;
        }
    }

    function mergeBursts(bursts, newBursts) {
        return newBursts.reduce(function (prev, burst) {
            return prev && addBurstOrMerge(bursts, burst);
        }, true);
    }

    function getBursts() {
        if (!$scope.activeTopic || $scope.activeTopic.messagesAndUpdates.length === 0) {
            return [];
        }

        var messagesAndUpdates = $scope.activeTopic.messagesAndUpdates;

        if (burstTopic !== $scope.activeTopic.id) {
            bursts = calculateBursts(messagesAndUpdates);
            burstTopic = $scope.activeTopic.id;

            return bursts;
        }

        var newElements = getNewElements(messagesAndUpdates, bursts);
        if (newElements.length === 0) {
            return bursts;
        }

        bursts.forEach(function (burst) {
            burst.removeAllExceptLast();
        });

        var newBursts = calculateBursts(messagesAndUpdates);
        if (!mergeBursts(bursts, newBursts)) {
            console.warn("Rerender all bursts!");
            bursts = newBursts;
        }

        return bursts;
    }

    $scope.messageBursts = function() {
        var bursts = getBursts();

        bursts.sort(function (b1, b2) {
            return b1.firstItem().getTime() - b2.firstItem().getTime();
        });

        return bursts;
    };

    $scope.showMessageOptions = false;
    $scope.toggleMessageOptions = function() {
        $scope.showMessageOptions = !$scope.showMessageOptions;
    };
}

messagesController.$inject = ["$scope", "$element", "$state", "$stateParams", "$timeout"];

messagesModule.controller("ssn.messagesShowController", messagesController);
