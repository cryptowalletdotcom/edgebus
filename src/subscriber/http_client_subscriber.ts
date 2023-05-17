import { FDisposableBase, FException, FExecutionContext, FHttpClient, FInitableBase, FLogger } from "@freemework/common";

import { OutgoingHttpHeaders } from "http";

import { MessageBus } from "../messaging/message_bus";
import { Message } from "../model/message";
import { Egress } from "../model/egress";
import { EgressApiIdentifier } from "../misc/api-identifier";

export class HttpClientSubscriber extends FInitableBase {

	private readonly _log: FLogger;
	private readonly _channelsFactories: ReadonlyArray<MessageBus.ChannelFactory>;
	private readonly _method: string | null;
	private readonly _url: URL;
	private readonly _client: FHttpClient;
	private readonly _onMessageBound: MessageBus.Channel.Callback;
	private _channels: ReadonlyArray<MessageBus.Channel> | null;

	public constructor(
		opts: HttpClientSubscriber.Opts
	) {
		super();

		this._log = FLogger.create(this.constructor.name);
		this._client = new FHttpClient();
		this._channelsFactories = opts.channelFactories;
		this._channels = null;

		this._onMessageBound = this._onMessage.bind(this);

		this._method = opts.deliveryHttpMethod !== undefined ? opts.deliveryHttpMethod : null;
		this._url = opts.deliveryUrl;

		this._log.trace(FExecutionContext.Empty, () => `Construct with delivery target '${this._url}' (method: '${this._method}').`);
	}

	protected async onInit(): Promise<void> {
		const channels: Array<MessageBus.Channel> = [];
		try {
			for (const channelFactory of this._channelsFactories) {
				const channel: MessageBus.Channel = await channelFactory();
				channels.push(channel);
				channel.addHandler(this._onMessageBound);
			}
		} catch (e) {
			await FDisposableBase.disposeAll(...channels);
			throw e;
		}
		this._channels = Object.freeze(channels);
	}
	protected async onDispose(): Promise<void> {
		if (this._channels !== null) {
			for (const channel of this._channels) {
				await channel.dispose();
				channel.removeHandler(this._onMessageBound); // Prevent memory leaks
			}
			this._channels = null;
		}
	}

	private async _onMessage(executionContext: FExecutionContext, event: MessageBus.Channel.Event): Promise<void> {
		try {
			const message: Message.Id & Message.Data = event.data;

			const messageHttpMethod: string | null = HttpClientSubscriber._extractHttpMethod(message);
			const messageHeaders: OutgoingHttpHeaders = HttpClientSubscriber._extractHttpHeaders(message);
			const body: Buffer = HttpClientSubscriber._extractHttpBody(message);

			let method: string;
			if (this._method !== null) {
				method = this._method;
			} else if (messageHttpMethod !== null) {
				method = messageHttpMethod;
			} else {
				method = "POST";
			}

			const response = await this._client.invoke(executionContext, {
				url: this._url,
				method,
				headers: messageHeaders,
				body
			});
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				event.delivered = true;
				this._log.info(executionContext, () => `Event from topic '${event.source.topicName}' was delivered successfully.`);
			} else {
				event.delivered = false;
				this._log.info(executionContext, () => `Request failure, response code ${response.statusCode}`);
			}
		} catch (e) {
			event.delivered = false;
			const err: FException = FException.wrapIfNeeded(e);
			this._log.info(executionContext, () => `Event from topic '${event.source.topicName}' was NOT delivered. ${err.message}`);
			this._log.debug(executionContext, () => `Event from topic '${event.source.topicName}' was NOT delivered.`, err);
		}
	}

	private static _extractHttpMethod(message: Message.Data): string | null {
		const messageBody: Buffer = Buffer.from(message.transformedBody);
		const parsedMessageBody: any = JSON.parse(messageBody.toString("utf8"));
		const originalHttpMethod: any = parsedMessageBody.method;
		if (typeof originalHttpMethod === "string") {
			return originalHttpMethod;
		}
		return null;
	}

	private static _extractHttpHeaders(message: Message.Data): OutgoingHttpHeaders {
		const messageHeaders: {
			readonly [name: string]: string;
		} = message.headers;
		return messageHeaders;
	}

	private static _extractHttpBody(message: Message.Data): Buffer {
		const messageBody: Buffer = Buffer.from(message.transformedBody);

		const parsedMessageBody: any = JSON.parse(messageBody.toString("utf8"));
		const bodyData: Buffer = Buffer.from(JSON.stringify(parsedMessageBody.body), "utf-8");

		return bodyData;
	}
}

export namespace HttpClientSubscriber {
	export interface Opts {
		readonly egressId: EgressApiIdentifier;
		readonly deliveryUrl: URL;
		readonly deliveryHttpMethod?: "GET" | "POST" | "PUT" | "DELETE" | string;
		readonly channelFactories: ReadonlyArray<MessageBus.ChannelFactory>;
	}
}
