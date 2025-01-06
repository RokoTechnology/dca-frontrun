import{ stat, mkdir, writeFile }from"fs/promises.mjs";
import{ checksum }from"./utils.mjs";
const mkdirIfNotExists = async (path) => {
  if (await stat(path).then(() => false).catch(() => true))
    await mkdir(path);
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
    appChecksum = checksum(appChecksum + path + method + code2);
    ops.push(writeFile(name, "//" + checksum(code2) + "\n" + code2));
  }
  const code = app.fetch.toString();
  appChecksum = checksum(appChecksum + code);
  ops.push(writeFile(`.elysia/handler.js`, "//" + appChecksum + "\n" + code));
  await Promise.all(ops);
  console.log("DONE");
};
export {
  manifest
};
