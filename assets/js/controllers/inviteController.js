/**
* inviteController
**/

var cssService = require("services/css.service").default;
var errorService = require("services/error.service").errorServiceInstance;
var initService = require("services/initService");
var localize = require("i18n/localizationConfig");
var socketService = require("services/socket.service").default;

"use strict";

const Bluebird = require('bluebird');
const h = require('whispeerHelper');
const State = require('asset/state');
const controllerModule = require('controllers/controllerModule');

function inviteController($scope, $location, $state) {
    if ($state.current.name.indexOf("app.invite") > -1) {
        cssService.setClass("inviteView");
    }

    $scope.domain = $location.protocol() + "://" + $location.host() + ( window.location.port ? ":" + window.location.port : "" ) + "/" + localize.getLanguage();
    $scope.anonymous = false;

    var inviteGenerateState = new State.default();
    $scope.inviteGenerateState = inviteGenerateState.data;

    var inviteDisplayState = new State.default();
    $scope.inviteDisplayState = inviteDisplayState.data;

    var code;

    function generateCode() {
        inviteGenerateState.pending();

        var generateCodePromise = socketService.emit("invites.generateCode", {}).then(function(result) {
            code = result.inviteCode;
        });

        return errorService.failOnErrorPromise(inviteGenerateState, generateCodePromise);
    }
    generateCode();

    function activateCode(code, reference) {
        socketService.emit("invites.activateCode", {
            code: code,
            reference: reference
        });
    }

    function getUrl(name) {
        var params = {};

        if (code && !$scope.anonymous) {
            params.code = code;
        }

        if (name) {
            params[name] = null;
        }

        return encodeURIComponent($scope.domain + "/" + h.encodeParameters(params));
    }

    var urls = {
        "facebook": "'http://www.facebook.com/sharer.php?u=' + url('fb')",
        "twitter": "'https://twitter.com/intent/tweet?url=' + url() + '&text=' + text + '&hashtags=' + hashtags",
        "google": "'https://plus.google.com/share?url=' + url('gp')",
        "reddit": "'http://reddit.com/submit?url=' + url() + '&title=' + text",
    };

    function updateSentInvites() {
        var promise = initService.awaitLoading().then(function () {
            return socketService.emit("invites.getMyInvites", {});
        }).then(function (result) {
            $scope.acceptedInvites = result.invites.filter(function (invite) {
                return invite.usedBy.length > 0;
            });

            $scope.unacceptedInvites = result.invites.filter(function (invite) {
                return invite.usedBy.length === 0;
            });
        });

        errorService.failOnErrorPromise(inviteDisplayState, promise);
    }

    updateSentInvites();

    $scope.open = function (type) {
        var url = $scope.$eval(urls[type], {
            url: getUrl.bind(null),
            text: localize.getLocalizedString("views.invite.shareText", {}),
            hashtags: localize.getLocalizedString("views.invite.shareHashTags", {})
        });
        window.open(url);

        if (!$scope.anonymous) {
            activateCode(code, type);
            generateCode();
        }

        updateSentInvites();
    };
}

inviteController.$inject = ["$scope", "$location", "$state"];

controllerModule.controller("ssn.inviteController", inviteController);
