import astroEndpoint from '@lib/astro.js'
import { Keypair } from "@solana/web3.js";
import { getConnection, checkForFinality } from "@lib/wallet.js"


async function connectWallet({ body, prisma }) {
  try {
     const keypair = Keypair.generate()

    // Get the public and private keys
    const publicKey = keypair.publicKey.toString()
    const secretKey = Array.from(keypair.secretKey)

    // Create an object to store the keypair information
    return {
      publicKey, secretKey
    }
  } catch (error) {
    console.error(error)
  }
}

export default connectWallet
