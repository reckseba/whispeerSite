import * as Bluebird from "bluebird"

import Storage from "./Storage";
import Cache from "../services/Cache"
import keyStore from "./keyStore.service";
import { landingPage } from "./location.manager";
import { withPrefix } from "./storage.service";
import h from "../helper/helper"

export class SessionService {
	sid: string = "";
	loggedin: boolean = false;
	userid: any;
	sessionStorage: Storage = withPrefix("whispeer.session");

	keyStore: any; // This has to change as soon as we port crypto/keyStore

	private loginResolve
	private loginPromise = new Bluebird((loginResolve) => {
		this.loginResolve = loginResolve
	})

	saveSession = () => {
		this.sessionStorage.set("sid", this.sid);
		this.sessionStorage.set("userid", this.userid);
		this.sessionStorage.set("loggedin", true);
	}

	setLoginData = (_sid: string, _userid: any) => {
		this.sid = _sid;
		this.userid = parseInt(_userid, 10)
		this.loggedin = true;

		this.loginResolve()
	}

	awaitLogin = () => this.loginPromise

	setPassword = (password: string) => {
		keyStore.security.setPassword(password);
		this.sessionStorage.set("password", password);
	}

	bootLogin = h.cacheResult<Bluebird<boolean>>(() => this.loadLogin())

	loadLogin = () =>
		this.sessionStorage.awaitLoading().then(() => {
			const loggedin = this.sessionStorage.get("loggedin") === "true" && this.sessionStorage.get("password");
			if (!loggedin) {
				return this.clear().thenReturn(false);
			}

			this.setPassword(this.sessionStorage.get("password"));
			this.setLoginData(this.sessionStorage.get("sid"), this.sessionStorage.get("userid"));

			return true;
		})

	getSID = () => this.sid;

	getUserID = () => this.userid

	isOwnUserID = (id) => parseInt(id, 10) === this.userid

	clear = () =>
		Bluebird.all([
			this.sessionStorage.clear().then(() => console.log("session storage")),
			Bluebird.resolve(Cache.deleteDatabase()).then(() => console.log("cache deletedb")),
		].map(p => p.reflect()))

	logout = () => this.clear().finally(landingPage)

	isLoggedin = () => this.loggedin
}

export default new SessionService();
