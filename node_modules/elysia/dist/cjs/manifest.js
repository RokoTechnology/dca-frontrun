"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var manifest_exports = {};
__export(manifest_exports, {
  manifest: () => manifest
});
module.exports = __toCommonJS(manifest_exports);
var import_promises = require("fs/promises");
var import_utils = require("./utils");
const mkdirIfNotExists = async (path) => {
  if (await (0, import_promises.stat)(path).then(() => false).catch(() => true))
    await (0, import_promises.mkdir)(path);
};
const manifest = async (app) => {
  await app.modules;
  app.compile();
  console.log(process.cwd());
  await mkdirIfNotExists(".elysia");
  await mkdirIfNotExists(".elysia/routes");
  const ops = [];
  let appChecksum = 0;
  for (const route of app.routes) {
    const { path, method } = route;
    const code2 = route.compile().toString();
    const name = `.elysia/routes/${path === "" ? "index" : path.endsWith("/") ? path.replace(/\//g, "_") + "index" : path.replace(/\//g, "_")}.${method.toLowerCase()}.js`;
    appChecksum = (0, import_utils.checksum)(appChecksum + path + method + code2);
    ops.push((0, import_promises.writeFile)(name, "//" + (0, import_utils.checksum)(code2) + "\n" + code2));
  }
  const code = app.fetch.toString();
  appChecksum = (0, import_utils.checksum)(appChecksum + code);
  ops.push((0, import_promises.writeFile)(`.elysia/handler.js`, "//" + appChecksum + "\n" + code));
  await Promise.all(ops);
  console.log("DONE");
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  manifest
});
