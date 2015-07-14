/**
* mainController
**/

define(["step", "whispeerHelper", "asset/state", "controllers/controllerModule"], function (step, h, State, controllerModule) {
	"use strict";

	function mainController($scope, cssService, postService, ImageUploadService, filterService, localize, settingsService, errorService) {
		cssService.setClass("mainView");

		$scope.postActive = false;
		$scope.filterActive = false;

		var applyFilterState = new State();
		$scope.applyFilterState = applyFilterState.data;

		$scope.filterSelection = settingsService.getBranch("filterSelection");

		$scope.getFiltersByID = filterService.getFiltersByID;

		$scope.focusNewPost = function () {
			var textarea = jQuery("#newsfeedView-postForm textarea");
			var scope = textarea.scope();

			textarea.focus();
			scope.newPost.text = localize.getLocalizedString("general.zeroContent.firstPostText", {});
			scope.$apply();
		};

		$scope.setTimelineFilter = function (newSelection) {
			$scope.filterSelection = newSelection;
		};

		$scope.applyFilter = function () {
			step(function () {
				settingsService.updateBranch("filterSelection", $scope.filterSelection);

				reloadTimeline(this.parallel());
				settingsService.uploadChangedData(this.parallel());
			}, errorService.failOnError(applyFilterState));
			// TODO: Save for later
		};

		$scope.togglePost = function() {
			$scope.postActive = !$scope.postActive;
		};

		$scope.loadMorePosts = function () {
			$scope.currentTimeline.loadMorePosts(errorService.criticalError);
		};

		$scope.toggleFilter = function() {
			$scope.filterActive = !$scope.filterActive;
		};

		$scope.currentTimeline = null;

		function reloadTimeline(cb) {
			step(function () {
				if ($scope.filterSelection.length === 0) {
					$scope.filterSelection = ["always:allfriends"];
				}

				$scope.currentTimeline = postService.getTimeline($scope.filterSelection);
				$scope.currentTimeline.loadInitial(this);
			}, cb || errorService.criticalError);
		}

		reloadTimeline();
	}

	mainController.$inject = ["$scope", "ssn.cssService", "ssn.postService", "ssn.imageUploadService", "ssn.filterService", "localize", "ssn.settingsService", "ssn.errorService"];

	controllerModule.controller("ssn.mainController", mainController);
});
