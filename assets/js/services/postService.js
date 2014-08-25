/**
* postService
**/
define(["step", "whispeerHelper", "validation/validator", "asset/observer", "asset/errors", "asset/securedDataWithMetaData"], function (step, h, validator, Observer, errors, SecuredData) {
	"use strict";

	var service = function ($rootScope, socket, errorService, keyStore, userService, circleService, blobService) {
		var postsById = {};
		var postsByUserWall = {};
		var TimelineByFilter = {};

		var Post = function (data) {
			var thePost = this, id = data.id;
			var securedData = SecuredData.load(data.content, data.meta, { type: "post" });

			this.data = {
				loaded: false,
				id: data.id,
				info: {
					"with": ""
				},
				/* list of images with attributes: loaded, encrypting, decrypting, uploading, percent, url */
				images: [],
				time: securedData.metaAttr("time"),
				isWallPost: false,
				comments: []
			};

			this.getID = function () {
				return id;
			};

			this.uploadImage = function (blob, index) {
				step(function () {
					blob.toURL(this);
				}, h.sF(function (url) {
					thePost.data.images[index].url = url;
					thePost.data.images[index].encrypting = true;
					thePost.data.images[index].loading = false;

					blob.encrypt(this);
				}), h.sF(function (key) {
					keyStore.sym.symEncryptKey(key, securedData.metaAttr("_key"), this);
				}), h.sF(function () {
					thePost.data.images[index].uploading = true;
					thePost.data.images[index].percentage = 0;

					blob.upload(this);
				}), h.sF(function () {
					thePost.data.images[index].uploading = false;
					thePost.data.images[index].percentage = 100;
				}), errorService.criticalError);
			};

			this.loadImage = function (image, index) {
				var blob;
				step(function () {
					blobService.getBlob(image.original.id, this, false);
				}, h.sF(function (_blob) {
					blob = _blob;
					if (blob.isUploaded()) {
						blob.decrypt(this);
					} else {
						thePost.uploadImage(blob, index);
					}
				}), h.sF(function () {
					blob.toURL(this);
				}), h.sF(function (url) {
					thePost.data.images[index].loading = false;
					thePost.data.images[index].url = url;
				}), errorService.criticalError);
			};

			this.loadImages = function () {
				securedData.metaAttr("images").forEach(function (image, index) {
					this.data.images.push({
						loading: true
					});
					this.loadImage(image, index);
				}, this);
			};

			this.loadData = function (cb) {
				step(function () {
					this.parallel.unflatten();
					thePost.getSender(this.parallel());
					thePost.getWallUser(this.parallel());
				}, h.sF(function (sender, walluser, images) {
					var d = thePost.data;

					if (walluser) {
						d.isWallPost = true;
						d.walluser = walluser;
					}

					d.sender = sender;
					securedData.verify(sender.user.getSignKey(), this);
				}), h.sF(function () {
					thePost.getText(this);
				}), h.sF(function (text) {
					var d = thePost.data;

					d.loaded = true;
					d.content = {
						text: text
					};

					window.setTimeout(function () {
						thePost.loadImages();
					});

					this.ne();
				}), cb);
			};

			this.getWallUser = function (cb) {
					var theUser;
					step(function () {
						if (securedData.metaAttr("walluser")) {
							userService.get(securedData.metaAttr("walluser"), this);
						} else {
							this.last();
						}
					}, h.sF(function (user) {
						theUser = user;

						theUser.loadBasicData(this);
					}), h.sF(function () {
						this.ne(theUser.data);
					}), cb);
			};

			this.getSender = function (cb) {
				var theUser;
				step(function () {
					userService.get(securedData.metaAttr("sender"), this);
				}, h.sF(function (user) {
					theUser = user;

					theUser.loadBasicData(this);
				}), h.sF(function () {
					this.ne(theUser.data);
				}), cb);
			};

			this.getText = function (cb) {
				securedData.decrypt(cb);
			};
		};

		function makePost(data) {
			var err = validator.validate("post", data);
			if (err) {
				throw err;
			}

			if (postsById[data.id]) {
				return postsById[data.id];
			}

			var p = new Post(data);
			postsById[p.getID()] = p;
			return p;
		}

		function removeDoubleFilter(filter) {
			var currentFilter, currentFilterOrder = 0;
			var filterOrder = {
				allfriends: 1,
				friendsoffriends: 2,
				everyone: 3
			};

			var i, cur;
			for (i = 0; i < filter.length; i += 1) {
				cur = filter[i];
				if (currentFilterOrder < filterOrder[cur]) {
					currentFilter = cur;
					currentFilterOrder = filterOrder[cur];
				}
			}

			return currentFilter;
		}

		function filterToKeys(filter, cb) {
			var alwaysFilter = [], userFriendsFilter = [], userFilter = [], circleFilter = [];

			if (!filter) {
				filter = ["always:allfriends"];
			}

			var i, map;
			for (i = 0; i < filter.length; i += 1) {
				map = filter[i].split(":");
				switch(map[0]) {
					case "friends":
						userFriendsFilter.push(map[1]);
						break;
					case "always":
						alwaysFilter.push(map[1]);
						break;
					case "circle":
						circleFilter.push(map[1]);
						break;
					case "user":
						userFilter.push(map[1]);
						break;
					default:
						throw new errors.InvalidFilter("unknown group");
				}
			}

			step(function () {
				this.parallel.unflatten();
				circleFilterToKeys(circleFilter, this.parallel());
				userFilterToKeys(userFilter, this.parallel());
				userFriendsFilterToKeys(userFriendsFilter, this.parallel());
			}, h.sF(function (circleKeys, userKeys, userFriendsKeys) {
				var alwaysKeys = alwaysFilterToKeys(alwaysFilter);
				var keys = alwaysKeys.concat(circleKeys).concat(userKeys).concat(userFriendsKeys);

				this.ne(keys);
			}), cb);
		}

		function alwaysFilterToKeys(filter) {
			if (filter.length === 0) {
				return [];
			}

			var theFilter = removeDoubleFilter(filter);

			switch (theFilter) {
				case "allfriends":
					return [userService.getown().getFriendsKey()];
				case "friendsoffriends":
					return [userService.getown().getFriendsLevel2Key()];
				case "everyone":
					//we do not encrypt it anyhow .... this needs to be checked in before!
					throw new Error("should never be here");
				default:
					throw new errors.InvalidFilter("unknown always value");
			}
		}

		function circleFiltersToUser(filter, cb) {
			if (filter.length === 0) {
				cb(null, []);
				return;
			}

			step(function () {
				circleService.loadAll(this);
			}, h.sF(function () {
				var i, user = [];
				for (i = 0; i < filter.length; i += 1) {
					user = user.concat(circleService.get(filter[i]).getUserIDs());
				}

				this.ne(h.arrayUnique(user));
			}), cb);
		}

		function circleFilterToKeys(filter, cb) {
			step(function () {
				circleService.loadAll(this);
			}, h.sF(function () {
				var keys = [], i;
				for (i = 0; i < filter.length; i += 1) {
					keys.push(circleService.get(filter[i]).getKey());
				}

				this.ne(keys);
			}), cb);
		}

		function userFilterToKeys(user, cb) {
			step(function () {
				userService.getMultiple(user, this);
			}, h.sF(function (users) {
				var i, keys = [];
				for (i = 0; i < users.length; i += 1) {
					keys.push(users[i].getContactKey());
				}

				this.ne(keys);
			}), cb);
		}

		function userFriendsFilterToKeys(user, cb) {
			step(function () {
				userService.getMultiple(user, this);
			}, h.sF(function (users) {
				var i, keys = [];
				for (i = 0; i < users.length; i += 1) {
					keys.push(users[i].getFriendsKey());
				}

				this.ne(keys);
			}), cb);
		}

		function registerNewPosts(filter) {
			var filterObject = TimelineByFilter[JSON.stringify(filter)];

			function loadNewPosts() {
				step(function () {
					var beforeID = 0;
					if (filterObject.result.length > 0) {
						beforeID = filterObject.result[0].id;
					}

					socket.emit("posts.getNewestTimeline", {
						filter: filter,
						beforeID: beforeID,
						lastRequestTime: filterObject.requested
					}, this);
				}, h.sF(function (data) {
					if (data.posts) {
						var newPosts = data.posts.map(function (thePost) {
							thePost = makePost(thePost);
							thePost.loadData(this.parallel());

							return thePost.data;
						}, this);

						filterObject.requested = socket.lastRequestTime();

						newPosts.reverse().map(function (e) {
							filterObject.result.unshift(e);
						});
					}
				}));
			}

			window.setInterval(loadNewPosts, 5*60*1000);
		}

		var postService = {
			getTimelinePosts: function (afterID, filter, cb) {
				var result = [], finalFilter = [];
				step(function () {
					var i, circles = [], split;
					for (i = 0; i < filter.length; i += 1) {
						split = filter[i].split(":");
						if (split[0] === "circle") {
							circles.push(split[1]);
						} else {
							finalFilter.push(filter[i]);
						}
					}

					circleFiltersToUser(circles, this);
				}, h.sF(function (users) {
					finalFilter = finalFilter.concat(users.map(function (e) {return "user:" + e;}));

					socket.emit("posts.getTimeline", {
						afterID: afterID,
						filter: finalFilter
					}, this);
				}), h.sF(function (results) {
					var thePost, i, posts = results.posts || [];
					for (i = 0; i < posts.length; i += 1) {
						thePost = makePost(posts[i]);
						thePost.loadData(this.parallel());
						result.push(thePost.data);
					}

					TimelineByFilter[JSON.stringify(finalFilter)] = {
						result: result,
						requested: socket.lastRequestTime()
					};

					registerNewPosts(finalFilter);

					this.parallel()();
				}), h.sF(function () {
					this.ne(result);
				}), cb);
			},
			getWallPosts: function (afterID, userid, cb) {
				var result = [];
				step(function () {
					socket.emit("posts.getWall", {
						afterID: afterID,
						userid: userid
					}, this);
				}, h.sF(function (results) {
					var thePost, i, posts = results.posts || [];
					for (i = 0; i < posts.length; i += 1) {
						thePost = makePost(posts[i]);
						thePost.loadData(this.parallel());
						result.push(thePost.data);
					}

					postsByUserWall[userid] = result;

					this.ne(result);
				}), cb);
			},
			getPostByID: function (postid, cb) {
				step(function () {
					if (postsById[postid]) {
						this.last.ne(postsById[postid]);
					} else {
						socket.emit("posts.getPost", {
							postid: postid
						}, this);
					}
				}, h.sF(function (data) {
					if (data.post) {
						this.ne(makePost(data.post));
					} else {
						throw new Error("error! no post data! maybe post does not exist?");
					}
				}), cb);
			},
			reset: function () {
				postsById = {};
				postsByUserWall = {};
				TimelineByFilter = {};
			},
			createPost: function (content, visibleSelection, wallUserID, cb, images) {
				/*
						meta: {
							contentHash,
							time,
							signature,
							sender: ownid,
							(key),
							(walluser), //for a wallpost
						}
						content //padded!
				*/
				var meta = {}, postKey, imageData;

				function blobToDataSet(blob, cb) {
					step(function () {
						this.parallel.unflatten();
						blob.preReserveID(this.parallel());
						blob.getHash(this.parallel());
					}, h.sF(function (id, hash) {
						this.ne({
							blob: blob,
							meta: {
								imageHash: hash,
								id: id
							}
						});
					}), cb);
				}

				function canvasToBlob(canvas, cb) {
					canvas.toBlob(function (blob) {
						cb(null, blob);
					});
				}

				function imageToBlobs(image, cb) {
					var MINSIZEDIFFERENCE = 1000, original, preview, originalMeta, previewMeta;
					step(function () {
						var original = image.downSize();
						var preview = image.downSize(600);

						originalMeta = {
							width: original.width,
							height: original.height
						};

						previewMeta = {
							width: preview.width,
							height: preview.height
						};

						this.parallel.unflatten();
						canvasToBlob(original, this.parallel());
						canvasToBlob(preview, this.parallel());
					}, h.sF(function (_original, _preview) {
						original = blobService.createBlob(_original);
						preview = blobService.createBlob(_preview);

						original.setMeta(originalMeta);
						preview.setMeta(previewMeta);

						this.parallel.unflatten();
						blobToDataSet(original, this.parallel());

						if (preview.getSize() < original.getSize() - MINSIZEDIFFERENCE) {
							blobToDataSet(preview, this.parallel());
						}
					}), h.sF(function (original, preview) {
						var result = { original: original };
						if (preview) {
							result.preview = preview;
						}

						this.ne(result);
					}), cb);
				}

				function createImageData(images, cb) {
					step(function () {
						images.forEach(function (image) {
							imageToBlobs(image, this.parallel());
						}, this);
					}, h.sF(function (blobs) {
						this.ne(h.joinArraysToObject({
							image: images,
							blob: blobs
						}));
					}), cb);
				}

				step(function () {
					this.parallel.unflatten();

					keyStore.sym.generateKey(this.parallel(), "post key");
					filterToKeys(visibleSelection, this.parallel());
					//hash images, hash downsized images, get image server ids
					createImageData(images, this.parallel());
				}, h.sF(function (key, keys, _imageData) {
					imageData = _imageData;
					postKey = key;

					meta.time = new Date().getTime();
					meta.sender = userService.getown().getID();
					meta.walluser = wallUserID;
					meta.images = imageData.map(function (image) {
						var meta = {original: image.blob.original.meta};
						if (image.blob.preview) {
							meta.preview = image.blob.preview.meta;
						}
						return meta;
					});


					//create post
					//upload images after that!
					this.parallel.unflatten();
					SecuredData.create(content, meta, { type: "post" }, userService.getown().getSignKey(), postKey, this.parallel());
					keys.forEach(function (key) {
						keyStore.sym.symEncryptKey(postKey, key, this.parallel());
					}, this);
				}), h.sF(function (data) {
					data.meta._key = keyStore.upload.getKey(data.meta._key);
					socket.emit("posts.createPost", {
						postData: data
					}, this);
				}), h.sF(function (result) {
					if (result.error) {
						throw new Error("post creation failed on server");
					}

					var newPost = makePost(result.createdPost);

					if (h.parseDecimal(wallUserID) === 0) {
						wallUserID = userService.getown().getID();
					}

					if (postsByUserWall[wallUserID]) {
						postsByUserWall[wallUserID].unshift(newPost.data);
					}

					var f = "[\"always:allfriends\"]";
					if (TimelineByFilter[f]) {
						TimelineByFilter[f].result.unshift(newPost.data);
					}

					newPost.loadData(this);
				}), cb);

				//hash content

				//getUser: walluser
				//visibleSelection to keys
				//encryptKey with visibleSelectionKeys
			}
		};

		Observer.call(postService);

		$rootScope.$on("ssn.reset", function () {
			postService.reset();
		});

		return postService;
	};

	service.$inject = ["$rootScope", "ssn.socketService", "ssn.errorService", "ssn.keyStoreService", "ssn.userService", "ssn.circleService", "ssn.blobService"];

	return service;
});