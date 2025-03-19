import "dotenv/config"

import { Elysia } from "elysia";
import { swagger } from '@elysiajs/swagger'
import config from './config.js'
import keyEp from './key.js'
import fetchUtil from './fetch.js'
import endpointHandler from './ep.js'
import webhookEp from './webhook.js'
import dcaEp from './dca.js'
import queryEp from './query.js'


let prisma = null
async function getContext(isTest) {
  if (isTest) {
    return testCtx(mockCtx())
  }
  if (!prisma) {
    // prisma = connectPrisma()
  }
  return {
    isContext: true,
    fetch: fetchUtil
  }
}

const app = new Elysia()
app.onError(({ code, error, request }) => {
  const path = new URL(request.url).pathname
  console.error(error)
  return { ok: false }
})
app.use(swagger())
app.get("/healthz", true)
app.derive(({ body, query, params, headers }) => {
  const parsed = {
    body, query, params,
    headers: { ...headers }
  }
  return { parsed }
})

app.post('/key', async (req) => endpointHandler(req, keyEp, getContext))
app.post('/webhook', async (req) => endpointHandler(req, webhookEp, getContext))
app.post('/dca', async (req) => endpointHandler(req, dcaEp, getContext))
app.post('/query', async (req) => endpointHandler(req, queryEp, getContext))

app.listen(config.port, () => console.log('Roko REST listening on port', config.port))
