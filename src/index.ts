import { FDisposable, FExecutionContext, FLoggerLabelsExecutionContext, FInitable, FLogger, FExceptionArgument, FDecimal, FDecimalBackendNumber, FExceptionInvalidOperation } from "@freemework/common";
import { FLauncherRuntime } from "@freemework/hosting";

import * as _ from "lodash";

// Providers
import { SettingsProvider, SettingsProviderImpl } from "./provider/settings_provider";
import { StorageProvider } from "./provider/storage_provider";
import { EndpointsProvider } from "./provider/endpoints_provider";
import { HostingProvider } from "./provider/hosting_provider";
import { MessageBusProvider } from "./provider/message_bus_provider";
import { HttpHostIngress } from "./ingress/http_host.ingress";
import { WebSocketHostSubscriber } from "./subscriber/websocket_host_subscriber";
import { MessageBus } from "./messaging/message_bus";
import { Container } from "typescript-ioc";
import { Settings } from "./settings";
import { HttpClientSubscriber } from "./subscriber/http_client_subscriber";
import { EgressApiIdentifier, IngressApiIdentifier, TopicApiIdentifier } from "./misc/api-identifier";
import appInfo from "./utils/app_info";
import { ProviderLocator } from "./provider_locator";
import { SetupServiceProvider } from "./provider/setup_service_provider";
import { SetupService } from "./service/setup_service";
import { ApiProvider } from "./provider/api_provider";
import { Egress } from "./model/egress";
import { Ingress } from "./model/ingress";

// Re-export stuff for embedded user's
export * from "./api/errors";
export { ManagementApi } from "./api/management_api";
export { PublisherApi } from "./api/publisher_api";
export { SubscriberApi } from "./api/subscriber_api";
export { ApiProvider } from "./provider/api_provider";
export { Settings } from "./settings";
// export { ConfigurationProvider } from "./provider/ConfigurationProvider";
//export { EndpointsProvider } from "./provider/EndpointsProvider";
export { HostingProvider } from "./provider/hosting_provider";
//export { MessageBusProvider } from "./provider/MessageBusProvider";
//export { StorageProvider } from "./provider/StorageProvider";

export * from "./misc";

export default async function (executionContext: FExecutionContext, settings: Settings): Promise<FLauncherRuntime> {
	executionContext = new FLoggerLabelsExecutionContext(executionContext, { ...appInfo });

	FDecimal.configure(new FDecimalBackendNumber(8, FDecimal.RoundMode.Trunc));

	const log: FLogger = FLogger.create("EdgeBus");

	{
		log.info(executionContext, "Initializing ConfigurationProvider...");
		// const dbEncriptionKey = await passwordDerivation(configuration.dbEncryptionPassword);
		const ownProvider: SettingsProvider = new SettingsProviderImpl(settings);
		Container.bind(SettingsProvider).provider({ get() { return ownProvider; } });
	}


	log.info(executionContext, "Initializing DI runtime...");
	await FInitable.initAll(executionContext,
		ProviderLocator.default.get(StorageProvider),
		ProviderLocator.default.get(MessageBusProvider),
		ProviderLocator.default.get(ApiProvider),
		ProviderLocator.default.get(EndpointsProvider),
		ProviderLocator.default.get(HostingProvider)
	);


	{
		// Setup Management
		const setupSettings: Settings.Setup | null = ProviderLocator.default.get(SettingsProvider).setup;
		if (setupSettings !== null) {
			const setupService: SetupService = ProviderLocator.default.get(SetupServiceProvider);
			await setupService.setup(executionContext, setupSettings);
		}
	}

	/* ---------HARDCODE--------------- */
	const itemsToDispose: Array<FDisposable> = [];
	try {
		const hardcodedPublisherConfigurations: Array<{
			readonly topicId: TopicApiIdentifier,
			readonly topicName: string;
			readonly topicDescription: string;
			// readonly ingressId: string;
			// readonly publisherPath: string;
			readonly ingressConfiguration: Settings.Setup.Ingress;
		}> = [
				// {
				// 	topicName: "pss-provider-wtf2",
				// 	topicDescription: "PSS Provider WTF2 callbacks",
				// 	ingressId: "ingress.http.9028c574-98b6-4198-8fc7-1355e9ac622e",
				// 	publisherPath: "/v2/callback/cryptoproviders/pss-provider-wtf2"
				// },
				// {
				// 	topicName: "wtf2",
				// 	topicDescription: "WTF2 callbacks",
				// 	ingressId: "ingress.http.afb0ff9b-217d-4a5c-8b33-d76291bb7d81",
				// 	publisherPath: "/v2/callback/cryptoproviders/wtf2"
				// }
			];
		const hardcodedSubscriberConfigurations: Array<{
			readonly topicIds: ReadonlyArray<string>;
			readonly topicNames: ReadonlyArray<string>;
			readonly subscriberIds: ReadonlyArray<string>;
		}> = [
				// {
				// 	topicNames: ["pss-provider-wtf2", "wtf2"],
				// 	subscriberIds: [
				// 		"subscriber.websockethost.devel",
				// 		"subscriber.websockethost.evolution",
				// 		"subscriber.websockethost.presentation",
				// 		"subscriber.websockethost.serg4683-a00d-4269-b116-6959fb9ac889",
				// 		"subscriber.websockethost.maks4683-a00d-4269-b116-6959fb9ac889"
				// 	]
				// },
				// {
				// 	topicNames: ["pss-provider-wtf2", "wtf2"],
				// 	subscriberIds: [
				// 		"subscriber.httpclient.POST.http://localhost:8020",
				// 	]
				// }
			];

		const { setup } = settings;
		if (setup !== null) {
			const { ingresses: ingresses, egresses: egresses, topics } = setup;

			const topicsByIdMap = new Map<string, Settings.Setup.Topic>();
			for (const topic of topics) {
				topicsByIdMap.set(topic.topicId, topic);
			}

			for (const ingress of ingresses) {
				hardcodedPublisherConfigurations.push({
					topicId: TopicApiIdentifier.parse(topicsByIdMap.get(ingress.topicId)!.topicId),
					topicName: topicsByIdMap.get(ingress.topicId)!.name,
					topicDescription: topicsByIdMap.get(ingress.topicId)!.description,
					// ingressId: ingress.ingressId,
					// publisherPath: ingress.path,
					ingressConfiguration: ingress
				});
			}

			for (const egress of egresses) {
				if (egress.kind === Egress.Kind.Webhook) {
					hardcodedSubscriberConfigurations.push({
						topicIds: egress.sourceTopicIds,
						topicNames: egress.sourceTopicIds.map(s => topicsByIdMap.get(s)!.name),
						subscriberIds: [`subscriber.http_client.${egress.httpMethod}.${egress.httpUrl}`]
					});
				} else if (egress.kind === Egress.Kind.WebSocketHost) {
					hardcodedSubscriberConfigurations.push({
						topicIds: egress.sourceTopicIds,
						topicNames: egress.sourceTopicIds.map(s => topicsByIdMap.get(s)!.name),
						subscriberIds: [`subscriber.websocket_host.${egress.egressId}`]
					});
				}
			}
		}

		const endpointsProvider: EndpointsProvider = ProviderLocator.default.get(EndpointsProvider);
		const messageBusProvider: MessageBusProvider = ProviderLocator.default.get(MessageBusProvider);
		const storageProvider: StorageProvider = ProviderLocator.default.get(StorageProvider);

		// Setup HTTP ingress
		for (const hardcodedPublisherConfiguration of hardcodedPublisherConfigurations) {
			const ingressConfiguration = hardcodedPublisherConfiguration.ingressConfiguration;
			if (ingressConfiguration.kind !== Ingress.Kind.HttpHost) {
				throw new FExceptionInvalidOperation(`Not supported yet: ${ingressConfiguration.kind}`);
			}
			const httpPublisherInstance: HttpHostIngress = new HttpHostIngress(
				storageProvider.databaseFactory,
				{
					topicId: hardcodedPublisherConfiguration.topicId,
					topicName: hardcodedPublisherConfiguration.topicName,
					topicDomain: null,
					topicDescription: hardcodedPublisherConfiguration.topicDescription,
					topicMediaType: "application/json"
				},
				IngressApiIdentifier.parse(ingressConfiguration.ingressId),
				messageBusProvider,
				{
					transformers: [],
					bindPath: ingressConfiguration.path,
					successResponseGenerator: () => ({
						headers: ingressConfiguration.responseHeaders,
						body: ingressConfiguration.responseBody,
						statusCode: ingressConfiguration.responseStatusCode,
						statusDescription: ingressConfiguration.responseStatusMessage,
					})
				}
			);
			//harcodedItemsToDispose.push(httpPublisherInstance);
			for (const publisherApiRestEndpoint of endpointsProvider.publisherApiRestEndpoints) {
				publisherApiRestEndpoint.addHttpPublisher(executionContext, httpPublisherInstance);
			}
			await httpPublisherInstance.init(executionContext);
			itemsToDispose.push(httpPublisherInstance);
		}

		// Setup WebSocketHost subscriber
		for (const hardcodedSubscriberConfiguration of hardcodedSubscriberConfigurations) {
			for (const subscriberId of hardcodedSubscriberConfiguration.subscriberIds) {
				const [_, subscriberType, egressIdStr] = subscriberId.split(".");

				const egressId: EgressApiIdentifier = EgressApiIdentifier.parse(egressIdStr);
				const channelFactories: Array<MessageBus.ChannelFactory> = [];
				for (const topicIdStr of hardcodedSubscriberConfiguration.topicIds) {
					const channelFactory = async (): Promise<MessageBus.Channel> => {
						const topicId: TopicApiIdentifier = TopicApiIdentifier.parse(topicIdStr);
						const channel = await messageBusProvider.retainChannel(executionContext, topicId, egressId);
						return channel;
					}
					channelFactories.push(channelFactory);
				}

				for (const subscriberApiRestEndpoint of endpointsProvider.subscriberApiRestEndpoints) {
					switch (subscriberType) {
						case "websocket_host":
							const webSocketHostSubscriber = new WebSocketHostSubscriber(
								{
									baseBindPath: subscriberApiRestEndpoint.bindPath,
									bindServers: subscriberApiRestEndpoint.servers,
									egressId: egressId,
									channelFactories
								},
								FLogger.create(log.name + "." + WebSocketHostSubscriber.name),
							);
							await webSocketHostSubscriber.init(executionContext);
							itemsToDispose.push(webSocketHostSubscriber);
							break;
						case "http_client":
							const httpClientSubscriber = new HttpClientSubscriber(
								{
									deliveryHttpMethod: subscriberId.split(".")[2],
									deliveryUrl: new URL(subscriberId.split(".")[3]),
									egressId: egressId,
									channelFactories
								}
							);
							await httpClientSubscriber.init(executionContext);
							itemsToDispose.push(httpClientSubscriber);
							break;
						default:
							throw new FExceptionArgument(`Unsupported subscriber type ${subscriberType}`);
					}
				}
			}
		}
	} catch (e) {
		for (const hardcodedItem of itemsToDispose) { await hardcodedItem.dispose(); }

		await FDisposable.disposeAll(
			// Endpoints should dispose first (reply 503, while finishing all active requests)
			ProviderLocator.default.get(EndpointsProvider),
			ProviderLocator.default.get(HostingProvider),
			ProviderLocator.default.get(MessageBusProvider),
			ProviderLocator.default.get(StorageProvider)
		);
		throw e;
	}
	/* ------------------------ */

	return {
		async destroy() {
			log.info(executionContext, "Destroying DI runtime...");

			for (const hardcodedItem of itemsToDispose.reverse()) {
				await hardcodedItem.dispose();
			}

			await FDisposable.disposeAll(
				// Endpoints should dispose first (reply 503, while finishing all active requests)
				ProviderLocator.default.get(EndpointsProvider),
				ProviderLocator.default.get(HostingProvider),
				ProviderLocator.default.get(MessageBusProvider),
				ProviderLocator.default.get(StorageProvider)
			);
		}
	};

}
