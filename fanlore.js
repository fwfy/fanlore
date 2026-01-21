require("dotenv").config({ quiet: true });
const express = require("express");
const app = express();
const cors = require("cors");
const crypto = require("node:crypto");
const fs = require("fs");
const contentDisposition = require("content-disposition");
const { pipeline } = require("node:stream/promises");
const path = require("path");

let VALID_OTPS = new Map();
let NTFY_ENABLED = true;

if (!process.env.FANLORE_PSK)
	throw new Error(
		`PSK not defined in FANLORE_PSK env var. Refusing to run insecurely.`,
	);

if (
	!process.env.NTFY_URL ||
	!process.env.NTFY_TOPIC ||
	!process.env.PUBLIC_URL
) {
	console.warn(
		`The NTFY integration will be disabled because one or more environment variables are unset. (NTFY_URL, NTFY_TOPIC, PUBLIC_URL)`,
	);
	NTFY_ENABLED = false;
}

const PSK = process.env.FANLORE_PSK;

app.use(express.json());
app.use(
	cors({
		origin: "*",
	}),
);

const WORK_ID_MATCHER = /\/(?:works)\/(\d+)/;

function makeOTP(forAction) {
	if (!forAction) throw new Error(`No forAction specified for makeOTP.`);
	let otp = crypto
		.createHash("sha256")
		.update(crypto.randomBytes(32))
		.digest("hex");
	VALID_OTPS.set(otp, forAction);
	return otp;
}

function consumeOTP(otp, forAction) {
	if (!otp) return false;
	if (!forAction) return false;
	if (!VALID_OTPS.has(otp)) return false;
	if (VALID_OTPS.get(otp) != forAction) return false;
	VALID_OTPS.delete(otp);
	return true;
}

async function notify(text, tags = [], actions = []) {
	if (!NTFY_ENABLED) return;
	tags.push("fanlore");
	let options = {
		method: "POST",
		body: JSON.stringify({
			topic: process.env.NTFY_TOPIC,
			message: text,
			actions,
			tags,
		}),
		headers: {},
	};
	if (process.env.NTFY_TOKEN) {
		options.headers["Authorization"] = `Bearer ${process.env.NTFY_TOKEN}`;
	}
	await fetch(process.env.NTFY_URL, options);
}

async function downloadFicByURL(url) {
	try {
		const id = WORK_ID_MATCHER.exec(url)[1];
		if (!id) throw new Error(`No valid fic ID found in submitted URL.`);
		console.log(`Found ID ${id}, sending request!`);
		notify(`Beginning download of fic ID ${id}...`, ["hourglass"]);
		const dl = `https://archiveofourown.org/downloads/${id}/file.epub`;
		const file = await fetch(dl);
		console.log(`Request finished.`);
		const { parameters: cd } = contentDisposition.parse(
			file.headers.get("content-disposition"),
		);
		const filename = cd.filename;
		console.log(`Got filename "${filename}" for ${id}. Saving to file!`);
		await pipeline(
			file.body,
			fs.createWriteStream(path.join(`./bookdrop/`, filename)),
		);
		console.log(`Fic downloaded successfully!`);
		notify(`Fic ID ${id} (${filename}) has finished downloading!`, [
			"white_check_mark",
		]);
	} catch (err) {
		notify(
			`An error occurred while trying to download a fic! Error details are below:\n\n${err}`,
			["warning"],
			[
				{
					action: "http",
					label: "Retry",
					url: `${process.env.PUBLIC_URL}/retry`,
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						url: url,
						otp: makeOTP("retryDownload"),
					}),
				},
			],
		);
		console.error(`An error happened:`, err);
		throw err;
	}
}

app.post("/fanlore/retry", async (req, res) => {
	if (!consumeOTP(req.body.otp, "retryDownload")) {
		res.status(401);
		res.end(`Unauthorized`);
		return;
	}
	try {
		await downloadFicByURL(req.body.url);
	} catch (err) {
		res.status(500);
		res.end(err.toString());
		return;
	}
	res.status(200);
	res.end("OK");
});

app.post("/fanlore/get", async (req, res) => {
	console.log(`Got a request!`);
	let sig = crypto
		.createHash("sha256")
		.update(`${PSK}${req.body.url}`)
		.digest("hex");
	if (req.body.sig !== sig) {
		console.log(`Signature didn't pass.`);
		res.status(401);
		return res.end(`Unauthorized`);
	}
	console.log(`Signature passed!`);
	try {
		console.log(`Attempting download...`);
		await downloadFicByURL(req.body.url);
	} catch (err) {
		res.status(500);
		res.end(err.toString());
		return;
	}
	res.end("OK");
});

app.listen(3388, () => {
	console.log(`Ready for requests!`);
});
