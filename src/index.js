import "dotenv/config"

import { Elysia } from "elysia";
import { swagger } from '@elysiajs/swagger'
import config from './config.js'
import keyEp from './key.js'
import fetchUtil from './fetch.js'
import endpointHandler from './ep.js'


let prisma = null
async function getContext(isTest) {
  if (isTest) {
    return testCtx(mockCtx())
  }
  if (!prisma) {
    prisma = connectPrisma()
  }
  const ep = getEndpoints(config.env)
  return {
    isContext: true,
    fetch: fetchUtil
  }
}

const app = new Elysia()
app.onError(({ code, error, request }) => {
  const path = new URL(request.url).pathname
  err({ code, error, path })
  return { error: error.toString() }
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
// app.post('/refetch-symbols', async (req) => endpointHandler(req, refetchSymbols, getContext))

app.listen(config.port, () => log('Account REST listening on port', config.port))
