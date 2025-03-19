import getDb from './db.js'
const db = getDb()
import fetchUtil from './fetch.js'
import { convertAmount, USDC_DECIMALS } from './wallet.js'
import base58 from 'bs58'


const SLIPPAGE = 123
const SOL = 'So11111111111111111111111111111111111111112'
const SOL_PRICE = 200
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'


function getDCATokens(txData) {
    const dcaProgramId = "DCA265Vj8a9CEuX1eb1LWRnDT7uK6q1xMipnNyatn23M";

    // Find the DCA instruction
    const dcaInstruction = txData.instructions.find(
        instruction => instruction.programId === dcaProgramId
    );

    if (dcaInstruction) {
        return {
            input: dcaInstruction.accounts[3],  // 4th account is input mint
            output: dcaInstruction.accounts[4]  // 5th account is output mint
        };
    }

    return null;
}

function getInputAmount(txData) {
    // Get all token balance changes
    const allChanges = txData.accountData
        .flatMap(account => account.tokenBalanceChanges)
        .filter(change => change); // Remove empty changes

    // Get input token from DCA instruction
    const tokens = getDCATokens(txData);
    if (!tokens) return null;

    // Find transfer for input token
    const transfer = allChanges.find(change =>
        change.mint === tokens.input
    );

    if (transfer) {
        return Math.abs(parseFloat(transfer.rawTokenAmount.tokenAmount)) /
               Math.pow(10, transfer.rawTokenAmount.decimals);
    }

    return null;
}

const RUG_LIST = {}
async function rugCheck(address) {
  try {
    if (RUG_LIST[address] === undefined) {
      const url = `https://api.rugcheck.xyz/v1/tokens/${address}/report`
      RUG_LIST[address] = await fetchUtil(url, null, 'GET')
    }
    const found = RUG_LIST[address]
    return {
      ok: true,
      symbol: found.tokenMeta.symbol,
      score: found.score,
      decimals: found.token.decimals
    }
  } catch (_) {
    return { ok: false }
  }
}

function decodeDCAInstructionData(txData, inputMint) {
  try {
    const dcaProgramId = "DCA265Vj8a9CEuX1eb1LWRnDT7uK6q1xMipnNyatn23M";
    const dcaInstruction = txData.instructions.find(
        instruction => instruction.programId === dcaProgramId
    );
    if (!dcaInstruction) return null;

    const decoded = base58.decode(dcaInstruction.data);
    const view = new DataView(decoded.buffer);

    // Define constants
    const decimals = inputMint === USDC ? 6 : 9;
    // Helper to adjust values based on decimals and convert to USD
    const adjustAmount = (amount) => {
      const tokenAmount = Number(amount) / Math.pow(10, decimals);
      if (inputMint === USDC) {
        return tokenAmount; // USDC is already in USD
      } else {
        return tokenAmount * SOL_PRICE; // Convert SOL to USD
      }
    };

    const result = {
      inAmount: adjustAmount(view.getBigUint64(16, true)),
      inAmountPerCycle: adjustAmount(view.getBigUint64(24, true)),
      cycleFrequency: Number(view.getBigUint64(32, true)),  // Time in seconds
    };
    result.cycleMinutes = result.cycleFrequency / 60
    result.perMinute = Math.round(100 * result.inAmountPerCycle / result.cycleMinutes) / 100
    result.minutes = Math.ceil(result.inAmount / result.perMinute)
    return result
  } catch (e) {
    console.log(e);
    return null;
  }
}

async function getQuote(outputMint, amount) {
  const params = new URLSearchParams({
    inputMint: USDC,
    outputMint,
    amount,
    slippageBps: SLIPPAGE
  });

  const url = `https://quote-api.jup.ag/v6/quote?${params.toString()}`
  const result = await fetchUtil(url, null, 'GET')
  return result
}

const ts = () => new Intl.DateTimeFormat(0, { timeStyle: 'medium' }).format();

async function handler(params) {
  try {
    // console.log(params)
    const data = params[0] || {}
    const type = data.type
    // console.log(type)
    const signature = data.signature
    db.insert(data)
    const token = getDCATokens(data)
    if (![SOL, USDC].includes(token?.input)) {
      return
    }
    let amount = getInputAmount(data)
    if (!amount) {
      return
    }
    if (token.input === SOL) {
      amount = amount * SOL_PRICE
    }
    if (amount < 500) {
      return
    }
    const rug = await rugCheck(token.output)
    if (!rug?.ok || rug.score > 2500) {
      return
    }
    const dcaData = decodeDCAInstructionData(data, token.input)
    if (dcaData.perMinute < 50 || dcaData.minutes < 3) {
      return
    }
    console.log(ts(), token.output, rug.symbol, dcaData.perMinute, 'per minute for', dcaData.minutes, 'minutes', rug.score)
    // const tradeAmount = convertAmount(amount / 1000, USDC_DECIMALS)
    // const quote = await getQuote(token.output, tradeAmount)
    // console.log(quote)
  } catch (error) {
    console.error(error)
  }
}

export default handler
