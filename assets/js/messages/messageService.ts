import h from "../helper/helper";
var Observer = require("asset/observer");
import * as Bluebird from "bluebird";

import errorService from "../services/error.service"
import socket from "../services/socket.service"
import Cache from "../services/Cache"

var sessionService = require("services/session.service");
var initService = require("services/initService");

import ChunkLoader, { Chunk } from "../messages/chatChunk"
import ChatLoader from "../messages/chat"
import MessageLoader from "../messages/message"

var messageService;

let chatIDs
let activeChat = 0

messageService = {
	prependChatID: function (chatID) {
		chatIDs = [
			chatID,
			...messageService.getChatIDs().filter((id) => id !== chatID)
		]
	},
	addSocketData: function (data) {
		if (!data) {
			return Bluebird.resolve()
		}

		return Bluebird.try(async () => {
			if (data.chat) {
				console.warn("Add chat")

				const chat = await ChatLoader.load(data.chat)
				messageService.prependChatID(chat.getID())
			}

			if (data.chunk) {
				console.warn("Add chunk")

				const chunk = await ChunkLoader.load(data.chunk)
				const chat = await ChatLoader.get(chunk.getChatID())

				chat.addChunkID(chunk.getID())
				messageService.prependChatID(chat.getID())
			}

			if (data.message) {
				console.warn("Add message")

				const chunk = await ChunkLoader.get(data.message.server.chunkID)
				const chat = await ChatLoader.get(chunk.getChatID())
				const message = await MessageLoader.load(data.message)

				chat.addMessageID(message.getClientID(), message.getTime())
				chat.addUnreadMessage(message.getServerID())

				messageService.prependChatID(chat.getID())
			}

			await Bluebird.resolve()
		})
	},
	loadChatIDs: function () {
		return socket.definitlyEmit("chat.getAllIDs", {}).then(function (response) {
			chatIDs = response.chatIDs
			return chatIDs
		});
	},
	getChatIDs: function () {
		return chatIDs || []
	},
	setActiveChat: (_activeChat) => {
		activeChat = _activeChat
	},
	isActiveChat: (chatID) => {
		return chatID === activeChat
	},
	loadMoreChats: h.cacheUntilSettled(() => {
		return initService.awaitLoading().then(function () {
			if (chatIDs && chatIDs.length > 0) {
				return Bluebird.resolve()
			}

			return messageService.loadChatIDs()
		}).then(function () {
			const unloadedChatIDs = messageService.getChatIDs().filter(function (chatID) {
				return !ChatLoader.isLoaded(chatID)
			})

			if (unloadedChatIDs.length === 0) {
				messageService.allChatsLoaded = true
			}

			return socket.definitlyEmit("chat.getMultiple", {
				ids: unloadedChatIDs.slice(0, 10)
			})
		}).then(function (latest) {
			return latest.chats
		}).map((chatData) => {
			return ChatLoader.load(chatData)
		}, { concurrency: 5 }).catch(errorService.criticalError);
	}),
	sendUnsentMessages: function () {
		var messageSendCache = new Cache("messageSend", { maxEntries: -1, maxBlobSize: -1 });

		return Bluebird.resolve(messageSendCache.all().toArray()).map(function (unsentMessage: any) {
			var data = JSON.parse(unsentMessage.data);

			return messageService.getChat(data.chatID).then(function (chat) {
				return chat.sendUnsentMessage(data, unsentMessage.blobs);
			});
		});
	},
	getChat: function (chatID, cb) {
		return Bluebird.try(function () {
			return ChatLoader.get(chatID);
		}).nodeify(cb);
	},
	sendMessageToUserChatIfExists: function(receiver, message, images) {
		return Bluebird.try(async () => {
			const chatid = await messageService.getUserChat(receiver)

			if (!chatid) {
				return;
			}

			const chat = await ChatLoader.get(chatid)
			const chunk = await ChunkLoader.get(chat.getLatestChunk())

			var otherReceiver = chunk.getReceiver().map(h.parseDecimal)

			if (otherReceiver.length > 2) {
				console.log("send to existing user chat failed as more than two users in receiver list")
				return false;
			}

			if (otherReceiver.indexOf(receiver) === -1) {
				console.log("send to existing user chat failed as other user is not in receiver list")
				return false;
			}

			if (otherReceiver.indexOf(sessionService.getUserID()) > -1) {
				console.log("send to existing user chat failed as own user is not in receiver list")
				return false;
			}

			await messageService.sendMessage(chat, message, images)

			return chat.getID()
		});
	},
	sendNewChat: function (receiver, message, images) {
		return Bluebird.try(function () {
			if (receiver.length === 1) {
				return messageService.sendMessageToUserChatIfExists(receiver[0], message, images);
			}

			return false;
		}).then(function (chat) {
			if (chat) {
				return chat.getID();
			}

			return Chunk.createData(receiver, message, images).then(function (chunkData) {
				return socket.emit("chat.create", {
					initialChunk: chunkData.chunk,
					firstMessage: chunkData.message,
					receiverKeys: chunkData.receiverKeys,
					keys: chunkData.keys
				});
			}).then(function (response) {
				return ChatLoader.load(response.chat);
			}).then(function (chat) {
				return chat.getID();
			});
		});
	},
	sendMessage: function (chatID, message, attachments) {
		return Bluebird.resolve(chatID).then(function (chat) {
			if (typeof chat !== "object") {
				return ChatLoader.get(chat);
			} else {
				return chat;
			}
		}).then(function (chat) {
			return chat.sendMessage(message, attachments);
		});
	},
	getUserChat: function (uid, cb) {
		return initService.awaitLoading().then(function () {
			return socket.definitlyEmit("chat.getChatWithUser", {
				userID: uid
			});
		}).then(function (data) {
			if (data.chatID) {
				return data.chatID;
			}

			return false;
		}).nodeify(cb);
	}
};

Observer.extend(messageService);

socket.channel("notify.chat", function (e, data) {
	if (!e) {
		messageService.addSocketData(data)
	} else {
		errorService.criticalError(e);
	}
});

initService.listen(function () {
	messageService.sendUnsentMessages();
}, "initDone");

export default messageService
