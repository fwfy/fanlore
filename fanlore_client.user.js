// ==UserScript==
// @name         Fanlore Sender
// @namespace    http://fwfy.club
// @version      2026-01-02
// @description  Sends a fic to the Fanlore downloader microservice
// @author       fwfy
// @match        https://archiveofourown.org/works/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=archiveofourown.org
// @grant        none
// ==/UserScript==

const PSK = "insert psk value here";

async function sha256(value) {
	const encoder = new TextEncoder();
	const data = encoder.encode(value);
	const digest = await crypto.subtle.digest("SHA-256", data);
	const bytes = new Uint8Array(digest);
	let result = "";
	for (const b of bytes) {
		result += b.toString(16).padStart(2, "0");
	}
	return result;
}

async function sendToFanlore() {
	try {
		fetch("https://api.example.com/fanlore/get", {
			method: "POST",
			body: JSON.stringify({
				url: document.location.href,
				sig: await sha256(`${PSK}${document.location.href}`),
			}),
			headers: {
				"Content-Type": "application/json",
			},
		});
	} catch (err) {
		alert(`Error when sending to Fanlore:\n\n${err}`);
	}
}

(function () {
	"use strict";
	const toolbar = document.getElementsByClassName("work navigation actions")[0];
	const btn = document.createElement("a");
	btn.href = "#";
	btn.innerText = "Send to Fanlore";
	btn.addEventListener("click", sendToFanlore);
	toolbar.appendChild(btn);
})();
