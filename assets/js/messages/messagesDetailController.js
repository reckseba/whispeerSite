"use strict";

const Bluebird = require("bluebird")

const h = require("whispeerHelper").default;
const State = require("asset/state");
const messagesModule = require("messages/messagesModule");

const errorService = require("services/error.service").errorServiceInstance;
const initService = require("services/initService")
const messageService = require("messages/messageService").default
const reportService = require("services/report.service").default

const ChatLoader = require("messages/chat").default

const featureToggles = require("services/featureToggles").default

function messagesDetailController($scope, $element, $state, $stateParams, localize) {
	var chatLoadingState = new State.default();
	$scope.topicLoadingState = chatLoadingState.data;

	chatLoadingState.pending();

	var chatID = h.parseDecimal($stateParams.topicid);

	var chatDetailsSavingState = new State.default();
	$scope.chatDetailsSavingState = chatDetailsSavingState.data;

	const addUsersToTopicState = new State.default()
	$scope.addUsersToTopic = addUsersToTopicState.data

	const changeUserState = new State.default()
	$scope.changeUser = changeUserState.data

	const removeUserState = new State.default()
	$scope.removeUser = removeUserState.data

	$scope.saveTitle = function() {
		chatDetailsSavingState.pending();

		if ($scope.chatTitle === $scope.activeChat.getTitle()) {
			$state.go("app.messages.show", {
				topicid: chatID
			});

			return
		}

		const savePromise = $scope.activeChat.setTitle($scope.chatTitle)

		errorService.failOnErrorPromise(chatDetailsSavingState, savePromise);
	};

	$scope.amIAdmin = () =>
		$scope.activeChat && $scope.activeChat.amIAdmin()

	$scope.featureEnabled = (featureName) =>
		featureToggles.isFeatureEnabled(featureName)

	$scope.chatTitle = "";

	$scope.setUsersToAdd = selected =>
		$scope.selectedUsers = selected;

	$scope.currentUser = undefined;
	$scope.toggleAdmin = (user) => {
		if(!$scope.amIAdmin() || changeUserState.isPending()) {
			return
		}

		changeUserState.pending()
		const promise = Bluebird.try(() => {
			$scope.currentUser = user.id
			if($scope.isAdmin(user)) {
				return $scope.activeChat.removeAdmin(user)
			}

			return $scope.activeChat.addAdmin(user)
		}).then(() => {
			$scope.currentUser = undefined
		})

		errorService.failOnErrorPromise(changeUserState, promise);
	}

	$scope.remove = (user) => {
		if($scope.isAdmin(user) || addUsersToTopicState.isPending() || removeUserState.isPending()) {
			return
		}

		removeUserState.pending()

		$scope.currentUser = user.id
		const promise = $scope.activeChat.removeReceiver(user).then(() => {
			$scope.currentUser = undefined
		})

		errorService.failOnErrorPromise(removeUserState, promise);
	};

	$scope.isAdmin = (user) => $scope.activeChat.isAdmin(user)

	$scope.report = () => {
		if(confirm(localize.getLocalizedString("messages.reportConfirm"))) {
			reportService.sendReport("chat", $scope.activeChat.getID());
		}
	}

	var getChatPromise = initService.awaitLoading().then(() =>
		ChatLoader.get(chatID)
	).then(function(chat) {
		messageService.setActiveChat(chatID);
		$scope.activeChat = chat;

		$scope.chatTitle = chat.getTitle() || "";
	});

	$scope.addReceivers = () => {
		if(addUsersToTopicState.isPending() || removeUserState.isPending()) {
			return
		}

		addUsersToTopicState.pending();

		const promise = Bluebird.resolve($scope.selectedUsers).then(data =>
			$scope.activeChat.addReceivers(data)
		).then(() => {
			$scope.$broadcast("resetSearch")
		});

		errorService.failOnErrorPromise(addUsersToTopicState, promise);
	}

	errorService.failOnErrorPromise(chatLoadingState, getChatPromise);
}

messagesDetailController.$inject = ["$scope", "$element", "$state", "$stateParams", "localize"];

messagesModule.controller("ssn.messagesDetailController", messagesDetailController);
