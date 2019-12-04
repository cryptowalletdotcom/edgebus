import { CancellationToken } from "@zxteam/contract";
import { InvalidOperationError, CancelledError, AggregateError } from "@zxteam/errors";
import { Initable, Disposable } from "@zxteam/disposable";


import { MessageBus } from "./MessageBus";

import { Message } from "../model/Message";
import { Topic } from "../model/Topic";
import { Subscriber } from "../model/Subscriber";
import { SubscriberChannelBase } from "../utils/SubscriberChannelBase";

export class MessageBusLocal extends Initable implements MessageBus {
	private readonly _messageQueues: Map<Topic["topicName"], Map<Subscriber["subscriberId"], Array<Message>>>;
	private readonly _channels: Map<Subscriber["subscriberId"], MessageBusLocalChannel>;

	public constructor(opts?: MessageBusLocal.Opts) {
		super();
		this._messageQueues = new Map();
		this._channels = new Map();
	}

	public async markChannelForDestory(
		cancellationToken: CancellationToken, topicName: Topic["topicName"], subscriberId: Subscriber["subscriberId"]
	): Promise<void> {
		// NOP
	}

	public async publish(
		cancellationToken: CancellationToken, topicName: Topic["topicName"], message: Message
	): Promise<void> {
		const messageId = message.messageId;

		let topicQueuesMap: Map<Subscriber["subscriberId"], Array<Message>> | undefined = this._messageQueues.get(topicName);
		if (topicQueuesMap === undefined) {
			topicQueuesMap = new Map();
			this._messageQueues.set(topicName, topicQueuesMap);
		}

		for (const [subscriberId, queue] of topicQueuesMap) {
			console.log(`Forward message '${messageId}' to subscriber ${subscriberId}`);
			queue.push(message);
			const channel = this._channels.get(subscriberId);
			if (channel !== undefined) {
				channel.wakeUp();
			}
		}
	}

	public async retainChannel(
		cancellationToken: CancellationToken, topicName: Topic["topicName"], subscriberId: Subscriber["subscriberId"]
	): Promise<MessageBus.Channel> {
		if (this._channels.has(subscriberId)) {
			throw new InvalidOperationError("Wrong operation. Cannot retain chanel twice.");
		}

		let topicQueuesMap: Map<Subscriber["subscriberId"], Array<Message>> | undefined = this._messageQueues.get(topicName);
		if (topicQueuesMap === undefined) {
			topicQueuesMap = new Map();
			this._messageQueues.set(topicName, topicQueuesMap);
		}

		let queue = topicQueuesMap.get(subscriberId);
		if (queue === undefined) {
			queue = [];
			topicQueuesMap.set(subscriberId, queue);
		}

		const channel = new MessageBusLocalChannel(subscriberId, queue);
		this._channels.set(subscriberId, channel);

		return channel;
	}

	protected onInit(cancellationToken: CancellationToken): void | Promise<void> {
		// TODO
	}

	protected onDispose(): void | Promise<void> {
		// TODO
	}
}

export namespace MessageBusLocal {
	export interface Opts {
		// TODO
	}
}


class MessageBusLocalChannel extends SubscriberChannelBase<Message.Id & Message.Data> implements MessageBus.Channel {
	private readonly _queue: Array<Message>;
	private readonly _subscriberId: Subscriber["subscriberId"];
	private _tickInterval: NodeJS.Timeout | null;
	private _insideTick: boolean;

	public constructor(subscriberId: Subscriber["subscriberId"], queue: Array<Message>) {
		super();
		this._subscriberId = subscriberId;
		this._insideTick = false;
		this._queue = queue;
		if (this._queue.length > 0) {
			this._tickInterval = setInterval(this._tick.bind(this), 500);
		} else {
			this._tickInterval = null;
		}
	}

	public wakeUp(): void {
		if (this._tickInterval === null && this._queue.length > 0) {
			this._tickInterval = setInterval(this._tick.bind(this), 500);
		}
	}

	protected onDispose() {
		// NOP
	}

	private async _tick(): Promise<void> {
		if (this._insideTick === true) { return; }
		this._insideTick = true;
		try {
			if (this._queue.length === 0) {
				if (this._tickInterval !== null) {
					clearInterval(this._tickInterval);
					this._tickInterval = null;
				}
				return;
			}

			const message: Message = this._queue[0];
			try {
				await this.notify({ data: message });
				this._queue.pop(); // OK, going to next message
			} catch (e) {
				console.error(`Cannot deliver message '${message.messageId}' to subscriber '${this._subscriberId}'`);
			}
		} finally {
			this._insideTick = false;
		}
	}
}
