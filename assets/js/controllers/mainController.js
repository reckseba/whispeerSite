/**
* mainController
**/

define(["step", "whispeerHelper", "asset/state", "asset/Image"], function (step, h, State, MyImage) {
	"use strict";

	function mainController($scope, cssService, postService, blobService, errorService) {
		cssService.setClass("mainView");

		$scope.canSend = true;

		var sendPostState = new State();
		$scope.sendPostState = sendPostState.data;

		$scope.postActive = false;
		$scope.filterActive = false;
		$scope.newPost = {
			text: "",
			readers: ["always:allfriends"],
			images: [],
			removeImage: function (index) {
				$scope.newPost.images.splice(index, 1);
			},
			addImages: MyImage.callBackForMultipleFiles(function (e, newImages) {
				$scope.$apply(function () {
					newImages.forEach(function (newImage) {
						$scope.newPost.images.push({
							name: newImage._name,
							data: newImage,
							url: newImage._image.src
						});
					});
				});
			})
		};

		$scope.filterSelection = ["always:allfriends"];

		$scope.$on("selectionChange:postReaders", function (event, newSelection) {
			$scope.newPost.readers = newSelection.map(function (e) {
				return e.id;
			});
		});

		$scope.$on("selectionChange:timelineFilter", function (event, newSelection) {
			$scope.filterSelection = newSelection.map(function (e) {
				return e.id;
			});

			reloadTimeline();
		});

		$scope.togglePost = function() {
			$scope.postActive = !$scope.postActive;
		};

		$scope.loadMorePosts = function () {
			$scope.currentTimeline.loadMorePosts(errorService.criticalError);
		};

		$scope.sendPost = function () {
			sendPostState.pending();

			if ($scope.newPost.text === "") {
				sendPostState.failed();
				return;
			}

			step(function () {
				if ($scope.canSend) {
					$scope.canSend = false;

					var images = $scope.newPost.images.map(function (i) { return i.data; });

					if (images.length === 0) {
						this.ne([]);
						return;
					}

					images.forEach(function (image) {
						blobService.prepareImage(image, this.parallel());
					}, this);
				}
			}, h.sF(function (blobs) {
				blobs.forEach(function (blob, index) {
					$scope.newPost.images[index].upload = blob.original.blob.getUploadStatus();
				});

				postService.createPost($scope.newPost.text, $scope.newPost.readers, 0, this, blobs);
			}), function (e) {
				$scope.canSend = true;
				$scope.postActive = false;

				if (!e) {
					$scope.newPost.text = "";
					$scope.newPost.images = [];
				}

				this(e);
			}, errorService.failOnError(sendPostState));
		};
		$scope.toggleFilter = function() {
			$scope.filterActive = !$scope.filterActive;
		};

		$scope.currentTimeline = null;

		function reloadTimeline() {
			step(function () {
				$scope.currentTimeline = postService.getTimeline($scope.filterSelection);
				$scope.currentTimeline.loadInitial(this);
			}, errorService.criticalError);
		}

		reloadTimeline();
	}

	mainController.$inject = ["$scope", "ssn.cssService", "ssn.postService", "ssn.blobService", "ssn.errorService"];

	return mainController;
});