import ObjectLoader from "../services/cachedObjectLoader"
import * as Bluebird from "bluebird"
import SecuredDataApi, { SecuredData } from "../asset/securedDataWithMetaData"
const keyStoreService = require("crypto/keyStore")

// actually typeof securedData but securedData is not a ts class yet
type SignedKeys = any

type SignedKeysCache = {
	crypt: string,
	friends: string,
	sign: string,
	_hashVersion: string,
	_signature: string,
	_type: string,
	_version: string,
}

export class SignedKeysLoader extends ObjectLoader<SignedKeys, SignedKeysCache>({
	cacheName: "signedKeys",
	getID: ({ signedKeys: { _signature }, signKey }) => `${signKey}-${_signature}`,
	download: () => { throw new Error("profile get by id is not implemented") },
	load: ({ signedKeys, signKey }): Bluebird<SignedKeysCache> => {
		const securedData = SecuredDataApi.load(undefined, signedKeys, { type: "signedKeys" })

		return securedData.verifyAsync(signKey).then(() =>
			securedData.metaGet()
		)
	},
	restore: (signedKeysCache: SignedKeysCache) => {
		const signedKeys = new SecuredData(undefined, signedKeysCache, { type: "signedKeys" }, true)

		const friends = signedKeys.metaAttr("friends")
		const crypt = signedKeys.metaAttr("crypt")

		keyStoreService.security.addEncryptionIdentifier(friends)
		keyStoreService.security.addEncryptionIdentifier(crypt)

		return signedKeys
	}
}) {}
