"use strict";

const electron = require("electron");
const { app, BrowserWindow, Menu, ipcMain } = electron;
const url = require("url");
const path = require("path");
const axios = require("axios");
const fs = require("fs");

require("electron-reload")(__dirname, {
	electron: path.join(__dirname, "node_modules", ".bin", "electron.cmd")
});

let mainWindow;
let addWindow;
let domainList;
let resultsArr = [];
let apikey;
let idx = 0;
let timeOutIds = [];
let speed;

//Listen for the app to be ready

app.on("ready", function () {
	//create new window
	mainWindow = new BrowserWindow({
		width: 1100,
		height: 850,
		webPreferences: {
			nodeIntegration: true,
			nodeIntegrationInWorker: true
		}
	});
	//Load html into window
	mainWindow.loadURL(
		url.format({
			pathname: path.join(__dirname, "mainWindow.html"),
			protocol: "file:",
			slashes: true
		})
	);
	//Quit app when closed
	mainWindow.on("closed", function () {
		app.quit();
	});

	//Build menu from template
	const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
	//Insert the menu
	Menu.setApplicationMenu(mainMenu);
});

//Handle add window

function createAddWindow () {
	//create new window
	addWindow = new BrowserWindow({
		width: 300,
		height: 200,
		title: "Add Shopping List Item",
		webPreferences: {
			nodeIntegration: true
		}
	});
	//Load html into window
	addWindow.loadURL(
		url.format({
			pathname: path.join(__dirname, "addWindow.html"),
			protocol: "file:",
			slashes: true
		})
	);
	//Garbage Collection handle
	addWindow.on("close", function () {
		addWindow = null;
	});
}

//Catch item:add

ipcMain.on("item:add", function (e, item) {
	mainWindow.webContents.send("item:add", item);
	addWindow.close();
});

ipcMain.on("domain:send", function (e, formValues) {
	idx = 0;
	speed = formValues.speed;
	apikey = formValues.apikey;
	domainList = formValues.domainLis;
	if (domainList.length > 0) {
		domainList = domainList.split("\n");
		mainWindow.webContents.send("list:length", domainList.length);
		scrape();
	} else {
		mainWindow.webContents.send("list:error");
	}
});

ipcMain.on("page:reload", function (e) {
	mainWindow.reload();
	stopScraping();
});

ipcMain.on("domain:save", function (e, fileName) {
	if (fileName === undefined) {
		mainWindow.webContents.send("file:notSaved");
		return;
	}

	if (resultsArr.length === 0) {
		mainWindow.webContents.send("file:empty");
		return;
	}

	let data = [];

	data.push(
		"url,category 1 name,category 1 value,category 2 name, category 2 value, category 3 name, category 3 value, category 4 name, category 4 value"
	);

	resultsArr.forEach((cur) => {
		let newStr = `${cur.url}`;
		const list = cur.catList;
		if (typeof list !== "undefined" && typeof list[0] !== "undefined") {
			list.forEach((current) => {
				newStr = `${newStr},${current.name},${current.value}`;
			});
		} else {
			newStr = `${newStr},"","","","","","","",""`;
		}

		data.push(newStr);
	});

	data = data.join("\n");

	fs.writeFile(fileName, data, function (err) {
		if (err) {
			mainWindow.webContents.send("file:notSaved");
			return;
		} else {
			mainWindow.webContents.send("file:save");
		}
	});
});

ipcMain.on("scrape:stop", function (e) {
	stopScraping();
});

function stopScraping () {
	timeOutIds.forEach((cur) => {
		clearTimeout(cur);
	});
	mainWindow.webContents.send("scrape:stopped");
}

function scrape () {
	resultsArr = [];
	timeOutIds = [];
	mainWindow.webContents.send("domain:number", domainList.length);
	for (let i = 0; i < domainList.length; i++) {
		(function (i) {
			const timeOutId = setTimeout(function () {
				test(i);
			}, speed * i);
			timeOutIds.push(timeOutId);
		})(i);
	}
}

function test (i) {
	axios
		.get(
			`http://uclassify.com/browse/uclassify/iab-taxonomy-v2/ClassifyUrl?readkey=${apikey}&url=${domainList[
				i
			]}&output=json&version=1.01`
		)
		.then((res) => {
			if (res.data.success) {
				const objItself = res.data.cls1;
				const objKeys = Object.keys(res.data.cls1);
				let convArray = [];
				objKeys.forEach((cur) => {
					convArray.push({ name: cur, value: objItself[cur] });
				});

				convArray.sort((a, b) => {
					return b.value - a.value;
				});

				const newObj = {
					url: domainList[i],
					catList: convArray.slice(0, 4)
				};

				resultsArr.push(newObj);

				//console.log(resultsArr[0].catList[3]);
			} else {
				throw new Error(res.data.errorMessage);
			}
		})
		.then(() => {
			idx++;
			const numberText = idx;
			mainWindow.webContents.send("result:number", numberText);
		})
		.catch((e) => {
			//console.log(e.message);
			idx++;
			const numberText = idx;
			mainWindow.webContents.send("result:number", numberText);
			mainWindow.webContents.send("result:error");
		});
}

//Create menu template
const mainMenuTemplate = [
	{
		label: "File",
		submenu: [
			{
				label: "Quit",
				accelerator: process.platform == "darwin" ? "Command+Q" : "Ctrl+Q",
				click () {
					app.quit();
				}
			}
		]
	}
];

// If mac, add empty object to menu

if (process.platform == "darwin") {
	mainMenuTemplate.unshift({});
}

// Add developer tools item if not in prod
if (process.env.NODE_ENV !== "production") {
	mainMenuTemplate.push({
		label: "Developer Tools",
		submenu: [
			{
				label: "Toggle DevTools",
				accelerator: process.platform == "darwin" ? "Command+I" : "Ctrl+I",
				click (item, focusedWindow) {
					focusedWindow.toggleDevTools();
				}
			},
			{
				role: "reload"
			}
		]
	});
}
