import * as Bluebird from "bluebird"
import h from "../helper/helper"

var userService = require("user/userService");
var socket = require("services/socket.service").default;
var keyStore = require("services/keyStore.service").default;

var SecuredData = require("asset/securedDataWithMetaData");
import ObjectLoader from "../services/objectLoader"

import ChunkLoader, { Chunk } from "./chatChunk"
import { Chat } from "./chat"

type attachments = { images: any[], files: any[] }

export class Message {
	private _hasBeenSent: boolean
	private _isDecrypted: boolean
	private _isOwnMessage: boolean

	private _serverID: number
	private _clientID: any
	private _securedData: any
	private attachments: attachments

	private sendTime: number
	private senderID: number

	private data: any

	private chunkID: number

	private chat: Chat

	constructor(messageData, chat?: Chat, attachments?: attachments, id?) {
		if (!chat) {
			this.fromSecuredData(messageData);
			return
		}

		this.fromDecryptedData(chat, messageData, attachments, id);
	}

	fromSecuredData = (data) => {
		const { meta, content, server } = data

		this._hasBeenSent = true;
		this._isDecrypted = false;

		var id = Message.idFromData(data)

		this.chunkID = server.chunkID

		this.sendTime = h.parseDecimal(server.sendTime)
		this.senderID = h.parseDecimal(server.sender)

		this._serverID = id.serverID
		this._clientID = id.clientID

		var metaCopy = h.deepCopyObj(meta);
		this._securedData = SecuredData.load(content, metaCopy, {
			type: "message"
		});

		this.setData();
	};

	fromDecryptedData = (chat: Chat, message, attachments, id) => {
		this._hasBeenSent = false;
		this._isDecrypted = true;
		this._isOwnMessage = true;

		this.chat = chat;
		this.attachments = attachments

		this._clientID = id || h.generateUUID();

		this.senderID = h.parseDecimal(userService.getown().getID())

		var meta = {
			createTime: new Date().getTime(),
			messageUUID: this._clientID
		};

		this._securedData = Message.createRawSecuredData(message, meta);

		this.setData();

		this.data.text = message;
		this.data.images = attachments.images.map((image) => {
			if (!image.convertForGallery) {
				return image;
			}

			return image.convertForGallery();
		});

		this.data.files = attachments.files.map((file) => ({
			...file.getInfo(),
			getProgress: () => {
				return file.getProgress()
			}
		}))

		this.loadSender();
		this.prepareAttachments();
	};

	private prepareImages = h.cacheResult<Bluebird<any>>(() => {
		return Bluebird.resolve(this.attachments.images).map((image: any) => {
			return image.prepare();
		});
	})

	private prepareFiles = h.cacheResult<Bluebird<any>>(() => {
		return Bluebird.resolve(this.attachments.files).map((file: any) => {
			return file.prepare();
		});
	})

	hasAttachments = () => {
		return this.attachments.images.length !== 0 || this.attachments.files.length !== 0
	}

	private prepareAttachments = () => {
		return Bluebird.all([this.prepareFiles(), this.prepareImages()])
	}

	setData = () => {
		this.data = {
			text: "",
			timestamp: this.getTime(),
			date: new Date(this.getTime()),

			loading: true,
			loaded: false,
			sent: this._hasBeenSent,

			sender: {
				"id": this.senderID,
				"name": "",
				"url": "",
				"image": "assets/img/user.png"
			},

			images: this._securedData.metaAttr("images"),

			id: this._clientID,
			obj: this
		};
	};

	getChunkID = () => {
		return this.chunkID || this.chat.getLatestChunk()
	}

	hasBeenSent = () => {
		return this._hasBeenSent;
	};

	uploadAttachments = h.cacheResult<Bluebird<any>>((chunkKey) => {
		return this.prepareAttachments().then(() => {
			const attachments = [...this.attachments.images, ...this.attachments.files]

			return Bluebird.all(attachments.map((attachment) => {
				return attachment.upload(chunkKey);
			}));
		}).then((imageKeys) => {
			return h.array.flatten(imageKeys);
		});
	})

	sendContinously = h.cacheResult<any>(() => {
		return h.repeatUntilTrue(Bluebird, () => {
			return this.send();
		}, 2000);
	})

	send = () => {
		if (this._hasBeenSent) {
			throw new Error("trying to send an already sent message");
		}

		return Bluebird.try(async () => {
			await socket.awaitConnection()

			const chunk = await ChunkLoader.get(this.chat.getLatestChunk())

			this._securedData.setParent(chunk.getSecuredData());

			const imagesInfo = await this.prepareImages()
			const filesInfo = await this.prepareFiles()

			const extractImagesInfo = (infos, key) => {
				return infos.map((info) =>
					h.objectMap(info, (val) => val[key])
				)
			}

			const filesContent = filesInfo.map((info) => info.content)
			const filesMeta = filesInfo.map((info) => info.meta)

			const imagesContent = extractImagesInfo(imagesInfo, "content")
			const imagesMeta = extractImagesInfo(imagesInfo, "meta")

			this._securedData.metaSetAttr("images", imagesMeta)
			this._securedData.contentSetAttr("images", imagesContent)
			this._securedData.metaSetAttr("files", filesMeta)
			this._securedData.contentSetAttr("files", filesContent)

			const chunkKey = chunk.getKey();

			const messageIDs = this.chat.getMessages()

			const messages = messageIDs.filter(({ id }) =>
				MessageLoader.isLoaded(id)
			).map(({ id }) =>
				MessageLoader.getLoaded(id)
			)

			const sentMessages = messages.filter((m) => m.hasBeenSent())
			const unsentMessages = messages.filter((m) => !m.hasBeenSent())

			const messageIndex = unsentMessages.findIndex((m) => m === this)

			if (unsentMessages[messageIndex - 1]) {
				await unsentMessages[messageIndex - 1].sendContinously()
			}

			const newest = h.array.last(sentMessages)

			if (newest && newest.getChunkID() === this.chat.getLatestChunk()) {
				this._securedData.setAfterRelationShip(newest.getSecuredData());
			}

			const signAndEncryptPromise = this._securedData._signAndEncrypt(userService.getown().getSignKey(), chunkKey);
			const keys = await this.uploadAttachments(chunkKey)
			const request = await signAndEncryptPromise

			const response = await socket.emit("chat.message.create", {
				chunkID: chunk.getID(),
				message: request,
				keys: keys.map(keyStore.upload.getKey)
			});

			if (response.success) {
				this._hasBeenSent = true;
				this.data.sent = true;
			}

			if (response.server) {
				this.sendTime = h.parseDecimal(response.server.sendTime)
				this._serverID = h.parseDecimal(response.server.id)
				this.chunkID = h.parseDecimal(response.server.chunkID)
				this.data.timestamp = this.getTime();
			}

			return response.success;
		}).catch(socket.errors.Disconnect, (e) => {
			console.warn(e);
			return false;
		}).catch(socket.errors.Server, () => {
			return false
		});
	};

	getSecuredData = () => {
		return this._securedData;
	};

	getServerID = () => {
		return this._serverID;
	};

	getClientID = () => {
		return this._clientID;
	};

	getTopicID = () => {
		return this.chunkID
	}

	getTime = () => {
		if (this.getServerID()) {
			return this.sendTime;
		}

		return h.parseDecimal(this._securedData.metaAttr("createTime"));
	};

	isOwn = () => {
		return this._isOwnMessage;
	};

	loadSender = () => {
		return Bluebird.try(() => {
			return userService.get(this.senderID);
		}).then((sender) => {
			return sender.loadBasicData().thenReturn(sender);
		}).then((sender) => {
			this.data.sender = sender.data;
			this._isOwnMessage = sender.isOwn();

			return sender;
		});
	};

	load = () => {
		return this.loadSender().then((sender) => {
			return Bluebird.all([
				this.decrypt(),
				this.verify(sender.getSignKey())
			]);
		}).then(() => {
			return;
		})
	};

	verifyParent = (chunk) => {
		this._securedData.checkParent(chunk.getSecuredData())
	};

	verify = (signKey) => {
		if (!this._hasBeenSent) {
			throw new Error("verifying unsent message")
		}

		return this._securedData.verify(signKey)
	};

	getText = () => {
		return this.data.text
	}

	decrypt = () => {
		if (this._isDecrypted) {
			return Bluebird.resolve(this._securedData.contentGet())
		}

		return Bluebird.try(() => {
			return this._securedData.decrypt();
		}).then(() => {
			const content = this._securedData.contentGet()

			if (typeof content === "string") {
				this.data.text = content
			} else {
				this.data.text = content.message

				if (content.files) {
					this.data.files = content.files.map((file, index) => ({
						...file,
						...this._securedData.metaAttr("files")[index]
					}))
				}

				if (content.images) {
					this.data.images = content.images.map((imageContent, index) => {
						const imageMeta = this._securedData.metaAttr("images")[index]

						const data =  h.objectMap(imageMeta, (val, key) => {
							return {
								...val,
								...imageContent[key]
							}
						})

						return data
					})
				}
			}

			return content
		})
	}

	static createRawSecuredData(message, meta, chunk?: Chunk) {
		var secured = SecuredData.createRaw({ message }, meta, {
			type: "message",
		});

		if (chunk) {
			secured.setParent(chunk.getSecuredData())
		}

		return secured;
	};

	static createRawData(message, meta, chunk: Chunk) {
		var secured = Message.createRawSecuredData(message, meta, chunk);
		return secured._signAndEncrypt(userService.getown().getSignKey(), chunk.getKey());
	};

	static idFromData(data) {
		var serverID = h.parseDecimal(data.server.id)
		var clientID = data.server.uuid

		return {
			serverID,
			clientID
		}
	}
}

const loadHook = (messageResponse) => {
	const message = new Message(messageResponse)

	return message.load().thenReturn(message)
}

const downloadHook = (id) => {
	return socket.emit("chat.message.get", { id })
}

const idHook = (response) => {
	return response.server.uuid
}

const hooks = {
	downloadHook, loadHook, idHook
}

export default class MessageLoader extends ObjectLoader<Message>(hooks) {}
