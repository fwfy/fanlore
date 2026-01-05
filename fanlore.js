const express = require("express");
const app = express();
const cors = require("cors");
const crypto = require("node:crypto");
const fs = require("fs");
const contentDisposition = require("content-disposition");
const { pipeline } = require("node:stream/promises");
const path = require("path");

if (!process.env.FANLORE_PSK)
	throw new Error(
		`PSK not defined in FANLORE_PSK env var. Refusing to run insecurely.`,
	);

const PSK = process.env.FANLORE_PSK;

app.use(express.json());
app.use(
	cors({
		origin: "https://archiveofourown.org",
	}),
);

const WORK_ID_MATCHER = /\/(?:works)\/(\d+)/;

async function downloadFicByURL(url) {
	const id = WORK_ID_MATCHER.exec(url)[1];
	if (!id) throw new Error(`No valid fic ID found in submitted URL.`);
	console.log(`Found ID ${id}, sending request!`);
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
}

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
		res.end(err);
		console.error(`An error happened:`, err);
		return;
	}
	res.end("OK");
});

app.listen(3388);
