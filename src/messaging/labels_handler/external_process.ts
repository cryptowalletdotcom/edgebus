import { FEnsure, FExecutionContext, FLogger } from "@freemework/common";
import { spawn } from "child_process";
import { Message } from "../../model";

const ensure: FEnsure = FEnsure.create();


export class ExternalProcess {
	private readonly path: string;
	private readonly timeoutMs: number;
	private readonly log: FLogger;
	private timeout: NodeJS.Timeout | null = null;

	constructor(path: string, timeoutMs: number) {
		this.path = path;
		this.timeoutMs = timeoutMs;
		this.log = FLogger.create(ExternalProcess.name);
	}

	public execute(
		executionContext: FExecutionContext,
		message: Message.Id & Message.Data
	): Promise<Array<string>> {
		return new Promise((resolve, reject) => {
			const cmd = spawn(this.path);
			const dataBuffer: Array<Buffer> = [];
			const errorBuffer: Array<Buffer> = [];

			cmd.stderr.on("data", (data: any) => {
				errorBuffer.push(Buffer.from(data));
			});

			cmd.stdout.on("data", (data: any) => {
				dataBuffer.push(Buffer.from(data));
			});

			cmd.once("close", (code: number | null) => {
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

						if (this.timeout) {
							clearTimeout(this.timeout);
						}
						resolve(result);
					} catch (e) {
						if (this.timeout) {
							clearTimeout(this.timeout);
						}
						reject(e);
					}
				} else {
					const errorStr = cmd.killed ?
						`External process killed` :
						`External process close with code: ${code}. ${Buffer.concat(errorBuffer).toString()}`;

					this.log.debug(executionContext, `${errorStr} ${this.path}`);

					if (this.timeout) {
						clearTimeout(this.timeout);
					}
					reject(errorStr);
				}
			});

			const msgBodyStr = message.messageBody.toString();

			this.timeout = setTimeout(() => {
				cmd.kill();
			}, this.timeoutMs);

			if (!cmd.stdin) {
				cmd.kill();
			} else {
				cmd.stdin.write(msgBodyStr);
				cmd.stdin.end();
			}
		});
	}
}
