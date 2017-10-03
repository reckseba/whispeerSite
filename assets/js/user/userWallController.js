/**
* userWallController
**/

var postService = require("services/postService");
var userService = require("users/userService").default;

"use strict";

const h = require("whispeerHelper").default;
const State = require("asset/state");
const userModule = require("user/userModule");

function userWallController($scope, $stateParams) {
	var userObject, identifier = $stateParams.identifier;

	$scope.posts = [];
	$scope.loadingPosts = true;
	$scope.endOfPosts = false;
	$scope.newPost = {
		text: ""
	};

	var sendPostState = new State.default();
	$scope.sendPostState = sendPostState.data;

	$scope.sendPost = function () {
		sendPostState.pending();

		var visibleSelection = ["always:allfriends"], wallUserID = 0;

		if ($scope.newPost.text === "") {
			sendPostState.failed();
			return;
		}

		if (!$scope.user.me) {
			wallUserID = $scope.user.id;
			visibleSelection.push("friends:" + $scope.user.id);
		}

		postService.createPost($scope.newPost.text, visibleSelection, wallUserID, []).then(function () {
			$scope.newPost.text = "";
		}).catch(sendPostState.failed.bind(sendPostState))
        .then(sendPostState.success.bind(sendPostState));
	};

	$scope.loadMorePosts = function () {
		if ($scope.loadingPosts) {
			return;
		}

		$scope.loadingPosts = true;

		postService.getWallPosts(
            // if we do not use the helper here we can drop the dependency.
            // @Nilos decide!
            h.array.last($scope.posts).id,
            userObject.getID(),
            5
        ).then(function (posts) {
	$scope.endOfPosts = posts.length === 0;

	$scope.posts = $scope.posts.concat(posts);
	$scope.loadingPosts = false;
});
	};

	function startLoading() {
		userService.get(identifier).then(function (user) {
			userObject = user;

			return postService.getWallPosts(0, userObject.getID(), 5);
		}).then(function (posts) {
			$scope.endOfPosts = posts.length === 0;

			$scope.posts = posts;
			$scope.loadingPosts = false;
		});
	}

	$scope.$watch(function () {
		return $scope.loading;
	}, function (isUserLoading) {
		if (!isUserLoading) {
			startLoading();
		}
	});
}

userWallController.$inject = ["$scope", "$stateParams"];

userModule.controller("ssn.userWallController", userWallController);
