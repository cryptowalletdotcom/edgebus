import { FEnsure, FExecutionContext, FLogger } from "@freemework/common";
import { LabelHandler, Message } from "../../model";
import { LabelsHandlerBase } from "./labels_handler_base";
import { spawn } from "child_process";
import path = require("path");

const ensure: FEnsure = FEnsure.create();

export class ExternalLabelsHandler extends LabelsHandlerBase {
	private static readonly LABEL_HANDLERS_FOLDER = "label_handlers"

	private readonly externalProcessPath: LabelHandler.ExternalProcess["externalProcessPath"];
	private readonly log: FLogger;

	constructor(externalProcessPath: LabelHandler.ExternalProcess["externalProcessPath"]) {
		super();
		this.externalProcessPath = externalProcessPath;
		this.log = FLogger.create(ExternalLabelsHandler.name);
	}

	public execute(
		executionContext: FExecutionContext,
		message: Message.Id & Message.Data
	): Promise<Array<string>> {
		return new Promise((resolve, reject) => {
			const cmd = spawn(this.getLabelHandlerFullPath(this.externalProcessPath));
			const dataBuffer: Array<Buffer> = [];
			const errorBuffer: Array<Buffer> = [];

			cmd.stderr.on("data", (data) => {
				errorBuffer.push(Buffer.from(data));
			});

			cmd.stdout.on("data", (data) => {
				dataBuffer.push(Buffer.from(data));
			});

			cmd.once("close", (code) => {
				if (code === 0) {
					const dataStr = Buffer.concat(dataBuffer).toString();
					this.log.info(executionContext, dataStr);
					try {
						const dataRaw = JSON.parse(dataStr);
						const data = ensure.array(dataRaw);
						const result: Array<string> = [];
						for (const item of data) {
							result.push(ensure.string(item));
						}

						resolve(result);
					} catch (e) {
						reject(e);
					}
				} else {
					const errorStr = Buffer.concat(errorBuffer).toString();
					reject(errorStr);
				}
			});

			const msgBodyStr = message.messageBody.toString();
			cmd.stdin?.write(msgBodyStr);
			cmd.stdin?.end();
		});
	}

	private getLabelHandlerFullPath(labelHandlerPath: string) {
		const fullPath = path.join(process.cwd(), ExternalLabelsHandler.LABEL_HANDLERS_FOLDER, labelHandlerPath);
		return fullPath;
	}
}
