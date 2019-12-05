import * as express from "express";
import { EnsureError } from "@zxteam/ensure";
import { SqlNoSuchRecordError } from "@zxteam/sql";
import { BadRequestPersistentStorageError, ForbiddenPersistentStorageError } from "../data/PersistentStorage";

export function handledException(res: express.Response, error: any) {

	if (error instanceof EnsureError) {
		return res.writeHead(400, "Bad Request").end();
	}
	if (error instanceof SqlNoSuchRecordError) {
		return res.writeHead(404, "No data").end();
	}
	if (error instanceof BadRequestPersistentStorageError) {
		return res.writeHead(400, "Bad request").end();
	}
	if (error instanceof ForbiddenPersistentStorageError) {
		return res.writeHead(403, "Forbidden").end();
	}

	return res.writeHead(500, "Unhandled exception").end();
}
