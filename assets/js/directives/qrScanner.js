var templateUrl = require("../../views/directives/qrScanner.html");
var errorService = require("services/error.service").errorServiceInstance;

"use strict";

const directivesModule = require('directives/directivesModule');
const Bluebird = require('bluebird');

function qrScannerDirective($timeout) {
    return {
        scope:	{
            callback: "&",
            state: "="
        },
        restrict: "E",
        templateUrl: templateUrl,
        link: function (scope, iElement) {
            var destroyed = false, theStream;

            function captureToCanvas() {
                if (!scope.state.read && !destroyed) {
                    Bluebird.try(function () {
                        return new Bluebird(function (resolve) {
                            require(["libs/qrreader"], resolve);
                        });
                    }).then(function (qrreader) {
                        var width = 800;
                        var height = 600;

                        var gCanvas = document.createElement("canvas");
                        gCanvas.width = width;
                        gCanvas.height = height;

                        var gCtx = gCanvas.getContext("2d");
                        gCtx.clearRect(0, 0, width, height);

                        gCtx.drawImage(iElement.find("video")[0], 0, 0);

                        var code = qrreader.decodeCanvas(gCanvas);

                        scope.state.read = true;
                        try {
                            theStream.stop();
                        } catch (e) {
                            console.error(e);
                        }

                        scope.callback({code: code});
                    }).catch(function (e) {
                        console.error("Canvas loading failed", e);
                        $timeout(captureToCanvas, 500);
                    });
                }
            }

            function initializeReader() {
                if (destroyed) {
                    return;
                }

                var webkit=false;
                var moz=false;

                return Bluebird.try(function () {
                    if (window.MediaStreamTrack && window.MediaStreamTrack.getSources) {
                        return new Bluebird(function (resolve) {
                            window.MediaStreamTrack.getSources(resolve);
                        });
                    }
                }).then(function (sources) {
                    if (destroyed) {
                        return;
                    }

                    var constraints = {
                        audio: false,
                        video: true
                    };

                    if (sources) {
                        var environmentSources = sources.filter(function (data) {
                            return data.kind === "video" && data.facing === "environment";
                        });

                        if (environmentSources.length === 1) {
                            constraints.video = { optional: [{sourceId: environmentSources[0].id}] };
                        }
                    }

                    return new Bluebird(function (resolve, reject) {
                        if(navigator.getUserMedia) {
                            navigator.getUserMedia(constraints, resolve, reject);
                        } else if(navigator.webkitGetUserMedia) {
                            webkit=true;
                            navigator.webkitGetUserMedia(constraints, resolve, reject);
                        } else if(navigator.mozGetUserMedia) {
                            moz=true;
                            navigator.mozGetUserMedia(constraints, resolve, reject);
                        }
                    });
                }).then(function (stream) {
                    if (destroyed) {
                        return;
                    }

                    scope.state.noDevice = false;
                    theStream = stream;
                    var v = iElement.find("video")[0];

                    if(webkit) {
                        v.src = window.webkitURL.createObjectURL(stream);
                    } else if(moz) {
                        v.mozSrcObject = stream;
                        v.play();
                    } else {
                        v.src = stream;
                    }

                    $timeout(captureToCanvas, 500);
                }).catch(function (e) {
                    errorService.criticalError(e);

                    if (e.name === "DevicesNotFoundError") {
                        scope.state.noDevice = true;

                        $timeout(initializeReader, 1000);
                    }
                });
            }

            scope.$on("$destroy", function() {
                if (theStream) {
                    theStream.stop();
                }
                destroyed = true;
            });

            scope.state = scope.state || {};

            scope.state.available = !!(navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia);
            scope.state.noDevice = false;
            scope.state.read = false;
            scope.state.reset = function () {
                if (scope.state.read) {
                    scope.state.read = false;
                    initializeReader();
                }
            };

            if (scope.state.enabled) {
                initializeReader();
            } else {
                scope.$watch(function () { return scope.state.enabled; }, function (isEnabled) {
                    if (isEnabled) {
                        initializeReader();
                    }
                });
            }
        }
    };
}

qrScannerDirective.$inject = ["$timeout"];

directivesModule.directive("qrScanner", qrScannerDirective);
