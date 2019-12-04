import { CancellationToken, Disposable as DisposableLike } from "@zxteam/contract";
import { Initable, Disposable, safeDispose } from "@zxteam/disposable";
import { Container, Runtime as LauncherRuntime } from "@zxteam/launcher";
import { logger } from "@zxteam/logger";

import * as _ from "lodash";

import { Configuration } from "./Configuration";

import { ConfigurationProvider, ConfigurationProviderImpl } from "./provider/ConfigurationProvider";
import { StorageProvider } from "./provider/StorageProvider";
import { EndpointsProvider } from "./provider/EndpointsProvider";
import { HostingProvider } from "./provider/HostingProvider";
import { MessageBusProvider } from "./provider/MessageBusProvider";
import { HttpPublisher } from "./publisher/HttpPublisher";
import { WebSocketHostSubscriber } from "./subscriber/WebSocketHostSubscriber";

const { name: serviceName, version: serviceVersion } = require("../package.json");

export default async function (cancellationToken: CancellationToken, config: Configuration): Promise<LauncherRuntime> {
	const log = logger.getLogger("RuntimeFactory");

	log.info(`Package: ${serviceName}@${serviceVersion}`);

	// Register DI providers
	Container.bind(ConfigurationProvider).provider({ get() { return new ConfigurationProviderImpl(config); } });

	log.info("Initializing DI runtime...");
	await Initable.initAll(cancellationToken,
		Container.get(StorageProvider),
		Container.get(MessageBusProvider),
		Container.get(EndpointsProvider),
		Container.get(HostingProvider)
	);



	/* ---------HARDCODE--------------- */
	const harcodedItemsToDispose: Array<DisposableLike> = [];
	try {
		const hardcodedConfigurations = [
			{
				topicName: "GITLAB",
				topicDescription: "GITLAB Webhooks test topic",
				publisherId: "publisher.http.5034c67f-f1cb-4fab-aed3-d2cd3b3d50ad",
				subscriberId: "subscriber.websockethost.41dd9c66-09ae-473d-a694-1dcfe347e8af"
			},
			{
				topicName: "WTF1_WALLET_CREATE_TX",
				topicDescription: "WALLET_CREATE_TX уведомление о создании транзакции, либо подписи существующей (происходит при вызове таких методов как sendtoaddress, signtx)",
				publisherId: "publisher.http.18af3285-749a-4fe8-abc0-52a42cd82cb6",
				subscriberId: "subscriber.websockethost.8ed7cb38-1b9d-41bc-b3d4-8fc8aae324b3"
			},
			{
				topicName: "WTF1_WALLET_TX",
				topicDescription: "WALLET_TX уведомление о поступлении транзакции, на которую мы подписаны, имеется возможность подписаться только на приходящие(receive) или исходящие(send) транзакции.",
				publisherId: "publisher.http.991b9ba2-7a76-4de9-8149-3489412a1288",
				subscriberId: "subscriber.websockethost.a775004a-9ae3-4cc8-a439-8540ef89c7a5"
			},
			{
				topicName: "WTF2",
				topicDescription: "WTF2 PSS Provider's callbacks",
				publisherId: "publisher.http.9028c574-98b6-4198-8fc7-1355e9ac622e",
				subscriberId: "subscriber.websockethost.9d65ce07-b8d5-4704-ba42-965c140df5e0"
			}
		];

		const endpointsProvider: EndpointsProvider = Container.get(EndpointsProvider);
		const messageBusProvider: MessageBusProvider = Container.get(MessageBusProvider);

		for (const hardcodedConfiguration of hardcodedConfigurations) {

			const channel = await messageBusProvider.messageBus.retainChannel(
				cancellationToken, hardcodedConfiguration.topicName, hardcodedConfiguration.subscriberId
			);
			harcodedItemsToDispose.push(channel);

			// Setup HTTP publisher
			const httpPublisherInstance: HttpPublisher = new HttpPublisher(
				{
					topicName: hardcodedConfiguration.topicName,
					topicDescription: hardcodedConfiguration.topicDescription,
					mediaType: "application/json"
				},
				hardcodedConfiguration.publisherId,
				messageBusProvider.messageBus,
				{ transformers: [] }
			);
			//harcodedItemsToDispose.push(httpPublisherInstance);
			for (const publisherApiRestEndpoint of endpointsProvider.publisherApiRestEndpoints) {
				publisherApiRestEndpoint.addHttpPublisher(httpPublisherInstance);
			}

			// Setup WebSocketHost subscriber
			for (const subscriberApiRestEndpoint of endpointsProvider.subscriberApiRestEndpoints) {
				const webSocketHostSubscriber = new WebSocketHostSubscriber(channel, {
					baseBindPath: subscriberApiRestEndpoint.bindPath,
					bindServers: subscriberApiRestEndpoint.servers,
					log,
					subscriberId: hardcodedConfiguration.subscriberId
				});
				await webSocketHostSubscriber.init(cancellationToken);
				harcodedItemsToDispose.push(webSocketHostSubscriber);
			}
		}
	} catch (e) {
		for (const hardcodedItem of harcodedItemsToDispose) { await safeDispose(hardcodedItem); }

		await Disposable.disposeAll(
			// Endpoints should dispose first (reply 503, while finishing all active requests)
			Container.get(EndpointsProvider),
			Container.get(HostingProvider),
			Container.get(MessageBusProvider),
			Container.get(StorageProvider)
		);
		throw e;
	}
	/* ------------------------ */






	return {
		async destroy() {
			log.info("Destroying DI runtime...");

			for (const hardcodedItem of harcodedItemsToDispose) { await safeDispose(hardcodedItem); }

			await Disposable.disposeAll(
				// Endpoints should dispose first (reply 503, while finishing all active requests)
				Container.get(EndpointsProvider),
				Container.get(HostingProvider),
				Container.get(MessageBusProvider),
				Container.get(StorageProvider)
			);
		}
	};
}
