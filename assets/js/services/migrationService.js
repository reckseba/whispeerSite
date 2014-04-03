define(["step", "whispeerHelper"], function (step, h) {
	"use strict";

	//get users migration state

	//load next migration to do (requirejs dynamic loading)

	//execute migration, pass $injector

	//after success: update users migration state

	var migrations = ["profileImageMigration"];

	var service = function ($injector) {
		var doMigration = function () {
			var ownUser = $injector.get("ssn.userService").getown(), migrationState;
			step(function () {
				ownUser.getMigrationState(this);
			}, h.sF(function (state) {
				migrationState = state || 0;
				if (migrationState < migrations.length) {
					require(["migrations/" + migrations[migrationState]], this.ne, this);
				}
			}), h.sF(function (migration) {
				migration($injector, this);
			}), h.sF(function (success) {
				if (!success) {
					//AUTSCH!
				} else {
					ownUser.setMigrationState(migrationState + 1, this);
				}
			}), function (e) {
				if (e) {
					console.error(e);
					//TODO: error handling!
				}
			});
		};

		return doMigration;
	};

	service.$inject = ["$injector"];

	return service;
});
