import config from './config.js'
import fetchUtil from './fetch.js'

async function createWebhook() {
  const result = await fetchUtil(`https://api.helius.xyz/v0/webhooks?api-key=${config.helius}`, {
    webhookURL: config.ngrok + '/webhook',
    accountAddresses: ['DCA265Vj8a9CEuX1eb1LWRnDT7uK6q1xMipnNyatn23M'],
    transactionTypes: ['TRANSFER', 'UNKNOWN'],
  })
  return result
}

async function handler() {
  try {
    const result = await createWebhook()
    console.log(result)
    return { ok: true }
  } catch (error) {
    console.error(error)
  }
}

export default handler
