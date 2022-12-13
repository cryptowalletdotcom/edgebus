import { FLogger } from "@freemework/common";
import { FWebServer } from "@freemework/hosting";
import { Container } from "typescript-ioc";

import * as express from "express";

import { BaseRestEndpoint, HttpGet } from "./BaseRestEndpoint";
import { Configuration } from "../Configuration";
import { BuildInfo } from "../provider/BuildInfo";

export class InfoRestEndpoint extends BaseRestEndpoint {
	private readonly _buildInfo: BuildInfo;

	public constructor(
		servers: ReadonlyArray<FWebServer>,
		opts: Configuration.BaseRestEndpoint,
		log: FLogger,
	) {
		super(servers, opts);
		this._buildInfo = Container.get(BuildInfo);
	}

	// protected setupBodyObjectParser(): void {
	// 	//Skip
	// }

	// protected setupBodyRawParser(): void {
	// 	//Skip
	// }

	// protected setupMonitoring(): void {
	// 	//Skip
	// }

	@HttpGet("/")
	private async _getInfo(req: express.Request, res: express.Response): Promise<void> {
		res.setHeader("Content-Type", "application/json");
		res.end(JSON.stringify({
			// "buildConfiguration": this._buildInfo.buildConfiguration,
			// "buildDate": this._buildInfo.buildDate.toISOString(),
			// "repositoryCommit": this._buildInfo.repositoryCommit,
			"version": this._buildInfo.version,
			"title": this._buildInfo.title,
			"description": this._buildInfo.description,
			// "company": this._buildInfo.company,
			// "copyright": this._buildInfo.copyright,
			// "product": this._buildInfo.product
		}, null, "\t"));
	}
}
