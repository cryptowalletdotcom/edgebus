import { Configuration as RawConfiguration } from "@zxteam/contract";
import { Configuration as HostingConfiguration } from "@zxteam/hosting";

import { URL } from "url";
import { Router } from "express-serve-static-core";

import { NotifierService } from "./service/NotifierService";
import { InnerError, InvalidOperationError } from "@zxteam/errors";

export interface Configuration {
	/**
	 * Servers
	 */
	readonly servers: ReadonlyArray<HostingConfiguration.WebServer>;

	/**
	 * Endpoints configuration
	 */
	readonly endpoints: ReadonlyArray<Configuration.Endpoint>;

	/**
	 * Connection URL to database
	 */
	readonly notifierServiceOpts: NotifierService.Opts;
}

export namespace Configuration {
	export type Endpoint = RestManagementEndpoint | RestPublisherEndpoint | RestSubscriberEndpoint
		| ExpressRouterManagementEndpoint | ExpressRouterPublisherEndpoint;

	export interface RestManagementEndpoint extends HostingConfiguration.ServerEndpoint, HostingConfiguration.BindEndpoint {
		readonly type: "rest-management";
	}
	export interface RestPublisherEndpoint extends HostingConfiguration.ServerEndpoint, HostingConfiguration.BindEndpoint {
		readonly type: "rest-publisher";
	}
	export interface RestSubscriberEndpoint extends HostingConfiguration.ServerEndpoint, HostingConfiguration.BindEndpoint {
		readonly type: "rest-subscriber";
	}
	export interface ExpressRouterManagementEndpoint extends HostingConfiguration.BindEndpoint {
		readonly type: "express-router-management";
		readonly router: Router;
	}
	export interface ExpressRouterPublisherEndpoint extends HostingConfiguration.BindEndpoint {
		readonly type: "express-router-publisher";
		readonly router: Router;
	}

	export interface SSL {
		readonly caCert?: Buffer;
		readonly clientCert?: {
			readonly cert: Buffer;
			readonly key: Buffer;
		};
	}
}

export function configurationFactory(configuration: RawConfiguration): Configuration {
	const servers: ReadonlyArray<HostingConfiguration.WebServer> = Object.freeze(HostingConfiguration.parseWebServers(configuration));

	const endpoints: ReadonlyArray<Configuration.Endpoint> = Object.freeze(configuration.getString("endpoints").split(" ").map(
		(endpointIndex: string): Configuration.Endpoint => {
			return parseEndpoint(configuration, endpointIndex);
		}
	));

	const notifierServiceOpts: NotifierService.Opts = Object.freeze({
		cacheStorageURL: configuration.getURL("cacheStorage.url"),
		persistentStorageURL: configuration.getURL("persistentStorage.url")
	});

	const appConfig: Configuration = Object.freeze({ servers, endpoints, notifierServiceOpts });
	return appConfig;
}

export class ConfigurationError extends InnerError { }


//  ___           _                                   _
// |_ _|  _ __   | |_    ___   _ __   _ __     __ _  | |
//  | |  | '_ \  | __|  / _ \ | '__| | '_ \   / _` | | |
//  | |  | | | | | |_  |  __/ | |    | | | | | (_| | | |
// |___| |_| |_|  \__|  \___| |_|    |_| |_|  \__,_| |_|


function parseEndpoint(configuration: RawConfiguration, endpointIndex: string): Configuration.Endpoint {
	const endpointConfiguration: RawConfiguration = configuration.getConfiguration(`endpoint.${endpointIndex}`);
	const endpointType: Configuration.Endpoint["type"] = endpointConfiguration.getString("type") as Configuration.Endpoint["type"];
	switch (endpointType) {
		case "rest-management": {
			const httpEndpoint: Configuration.RestManagementEndpoint = Object.freeze({
				type: endpointType,
				servers: endpointConfiguration.getString("servers").split(" "),
				bindPath: endpointConfiguration.getString("bindPath", "/")
			});
			return httpEndpoint;
		}
		case "rest-publisher": {
			const httpEndpoint: Configuration.RestPublisherEndpoint = Object.freeze({
				type: endpointType,
				servers: endpointConfiguration.getString("servers").split(" "),
				bindPath: endpointConfiguration.getString("bindPath", "/")
			});
			return httpEndpoint;
		}
		case "rest-subscriber": {
			const httpEndpoint: Configuration.RestSubscriberEndpoint = Object.freeze({
				type: endpointType,
				servers: endpointConfiguration.getString("servers").split(" "),
				bindPath: endpointConfiguration.getString("bindPath", "/")
			});
			return httpEndpoint;
		}
		case "express-router-management":
		case "express-router-publisher":
			throw new InvalidOperationError(`Endpoint type '${endpointType}' may not be parsed as config item.`);
		default:
			throw new UnreachableNotSupportedEndpointError(endpointType);
	}
}

class UnreachableNotSupportedEndpointError extends Error {
	public constructor(endpointType: never) {
		super(`Non supported endpoint type: ${endpointType}`);
	}
}
