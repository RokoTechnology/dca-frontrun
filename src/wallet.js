import {
  Connection, Keypair, PublicKey,
  ComputeBudgetProgram, Transaction, LAMPORTS_PER_SOL,
  VersionedTransaction,
  TransactionMessage,
  TransactionInstruction,
  AddressLookupTableAccount
} from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getMint
} from '@solana/spl-token';
import fetchUtil from '@lib/fetch.js'
import bs58 from 'bs58'

export const FEE_WALLET = process.env.FEE_WALLET || '5sff31ZBNZuT7iAtown5Pf1yzpkGczLy6W5G5nuywFBT'
export const FEE_BPS = 40
export const SOL_RPC = 'https://mainnet.helius-rpc.com/?api-key=b5ef5936-2bac-4f43-8409-1244c72e5564'
const connection = new Connection(SOL_RPC, 'confirmed')

export const SOL_MINT = 'So11111111111111111111111111111111111111112'
export const SOL_DECIMALS = 9
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
export const USDC_DECIMALS = 6


export function getWallet(secretPrivate) {
  if (!secretPrivate || secretPrivate === 'NOT_SET') {
    throw new Error('creating secret from bad input')
  }
  if (secretPrivate[0] !== '[') {
    secretPrivate = '[' + secretPrivate + ']'
  }
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(secretPrivate)))
}

export function pub(address) {
  return new PublicKey(address)
}

export function getConnection() {
  return connection
}

export const lamportsToSol = (lamports) => lamports / LAMPORTS_PER_SOL;
export const solToMicroLamports = (sol) => Math.floor(sol * LAMPORTS_PER_SOL * 1_000);

// Fee constants (in microLamports)
const FEE_CONSTANTS = {
  MIN_FEE: solToMicroLamports(0.000_001),
  MAX_FEE: solToMicroLamports(0.001),
  MIN_MULTIPLIER: 0.001,     // Infra level
  DYNAMIC_MULTIPLIER: 0.01,  // Base multiplier for dynamic
  HIGH_MULTIPLIER: 0.1,      // Multiplier for high priority
  ULTRA_MULTIPLIER: 1,       // Multiplier for ultra priority
};

// Fee tier options
export const FEE_TIERS = {
  MIN: 'min',
  DYNAMIC: 'dynamic',
  HIGH: 'high',
  ULTRA: 'ultra'
};

/**
 * Get the priority fee instruction with specified tier
 * @param {Transaction} tx - The transaction to estimate fees for
 * @param {string} tier - Fee tier (dynamic, high, or ultra)
 * @returns {Object} Object containing instruction and fee details
 */
export async function getPriority(tx, executionConfig = {}) {
  console.log({ executionConfig })
  // Serialize and encode transaction
  const encoded = bs58.encode(tx.serialize({ requireAllSignatures: false }));
  console.log('Encoded transaction:', { encoded });

  // Get fee estimate from RPC
  const result = await fetchUtil(SOL_RPC, {
    jsonrpc: "2.0",
    id: "1",
    method: "getPriorityFeeEstimate",
    params: [{
      transaction: encoded,
      options: {
        includeAllPriorityFeeLevels: true
      },
    }]
  });

  const fees = result?.result?.priorityFeeLevels;
  if (!fees) {
    console.error(result)
    throw new Error('Bad response in getPriority');
  }
  console.log('RPC fee estimates:', { fees });

  // Calculate base fee (use high as base)
  let baseFee = Math.max(fees.high, FEE_CONSTANTS.MIN_FEE);

  // Apply multiplier based on tier
  let multiplier;
  switch (executionConfig.fee) {
    case FEE_TIERS.ULTRA:
      multiplier = FEE_CONSTANTS.ULTRA_MULTIPLIER;
      break;
    case FEE_TIERS.HIGH:
      multiplier = FEE_CONSTANTS.HIGH_MULTIPLIER;
      break;
    case FEE_TIERS.DYNAMIC:
      multiplier = FEE_CONSTANTS.DYNAMIC_MULTIPLIER;
      break;
    default:
      multiplier = FEE_CONSTANTS.MIN_MULTIPLIER;
  }

  // Calculate final fee with exponential scaling
  let microLamports = Math.floor(baseFee * multiplier);

  // Apply minimum and maximum constraints
  microLamports = Math.max(microLamports, FEE_CONSTANTS.MIN_FEE);
  microLamports = Math.min(microLamports, (executionConfig?.solFee ? solToMicroLamports(executionConfig.solFee) : FEE_CONSTANTS.MAX_FEE));

  console.log('Calculated fee:', {
    baseFee,
    multiplier,
    microLamports
  });

  return {
    instruction: ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
    microLamports
  };
}

export async function setPriority(tx, executionConfig) {
  const prioIx = await getPriority(tx, executionConfig)
  tx.instructions = [prioIx.instruction, ...tx.instructions]
  return tx
}

export function getBudget(units) {
  return ComputeBudgetProgram.setComputeUnitLimit({
    units
  });
}

export async function getTx(feePayer) {
  const tx = new Transaction()
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash
  if (feePayer) {
    tx.feePayer = feePayer ? pub(feePayer) : undefined
  }
  tx.confirmOptions = {
    skipPreflight: true,
    maxRetries: 12,
    commitment: 'confirmed'
  }
  return tx
}

/**
 * Internal helper to perform a series of transaction checks
 * @param {string} signature Transaction signature
 * @param {number} attempts Number of attempts
 * @param {number} delayMs Delay between attempts in ms
 * @param {string} phase Phase name for logging
 * @returns {Promise<ParsedTransaction|null>} Transaction info or null if not found
 */
async function checkWithRetries(signature, attempts, delayMs, phase) {
  for (let i = 0; i < attempts; i++) {
    try {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      const tx = await getConnection().getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });
      if (tx) return tx;
    } catch (e) {
      console.error(`${phase} check ${i + 1} failed:`, e);
    }
  }
  return null;
}

/**
 * Checks transaction finality with progressive retry timing
 * @param {string} signature Transaction signature
 * @returns {Promise<ParsedTransaction|null>} Transaction info or null if not found
 */
export async function checkForFinality(signature) {
  // Quick checks (250ms spacing)
  let tx = await checkWithRetries(signature, 8, 333, 'Quick');
  if (tx) return tx;

  // Medium checks (500ms spacing)
  tx = await checkWithRetries(signature, 5, 666, 'Medium');
  if (tx) return tx;

  // Slow checks (1s spacing)
  tx = await checkWithRetries(signature, 3, 1666, 'Slow');
  return tx;
}

/**
 * Rounds an amount to the specified number of decimal places
 * @param {number} amt - The amount to round
 * @param {number} decimals - Number of decimal places
 * @returns {number} - Rounded amount
 */
export function roundAmount(amt, decimals) {
  const multi = Math.pow(10, decimals)
  return Math.floor(amt * multi) / multi
}

/**
 * Converts an amount to base units considering decimals
 * @param {number|string} amt - The amount to convert
 * @param {number} decimals - Number of decimal places
 * @returns {number} - Amount in base units as a number
 */
export function convertAmount(amt, decimals) {
  console.log('convertAmount', amt, decimals)
  if (!amt || !decimals) {
    throw new Error('Bad amount / decimals in convertAmount')
  }

  // Convert to string and handle decimal points precisely
  const amtString = amt.toString()
  let result

  if (amtString.includes('.')) {
    // Remove decimal point and pad with zeros if needed
    const [whole, fraction] = amtString.split('.')
    const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals)
    result = Number(whole + paddedFraction)
  } else {
    const multi = Math.pow(10, decimals)
    result = Math.floor(Number(amt) * multi)
  }

  console.log('convertAmount result', result)
  return result
}

// Helper for fee calculations specifically
export function calculateFeeAmounts(amount, decimals) {
  const baseUnits = convertAmount(amount, decimals)
  const feeAmount = Math.floor(baseUnits * 0.004) // 40 bps = 0.4%
  const transferAmount = baseUnits - feeAmount
  return {
    feeAmount,
    transferAmount
  }
}

export function convertLamports(amt) {
  return convertAmount(amt, 9)
}

export function isSol(address) {
  return address === SOL_MINT
}

export function isUsdc(address) {
  return address === USDC_MINT
}

export async function getTokenAccount(pubKey, tokenMint) {
  const tokenAccount = await getAssociatedTokenAddress(
    pub(tokenMint),
    pub(pubKey),
    true
  )
  return tokenAccount.toBase58()
}

export async function getTokenBalance(pubKey, tokenMint) {
  const tokenAccount = await getTokenAccount(pubKey, tokenMint)
  const info = await connection.getTokenAccountBalance(pub(tokenAccount))
  return info?.value?.uiAmount || 0
}

export async function getDecimals(tokenMint) {
  if (tokenMint === USDC_MINT) {
    return USDC_DECIMALS
  }
  if (tokenMint === SOL_MINT) {
    return SOL_DECIMALS
  }
  const mintInfo = await getMint(connection, pub(tokenMint))
  if (!mintInfo?.decimals) {
    throw new Error('Bad decimals in getDecimals')
  }
  return mintInfo.decimals
}

export function getAuthMessage(publicKey, token) {
  return `I am the owner of ${publicKey}. This message is for Trade Relay only. [Request #${token}]`
}

function timeout(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Confirmation timeout')), ms);
  });
}

/**
 * Internal shared transaction sending logic
 */
async function sendAndConfirmWithRetry(
  buildTransaction,
  signer,
  {
    maxRetries = 12,
    confirmTimeout = 10_000,
    executionConfig
  } = {}
) {
  let lastError = null;
  let lastSignature = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (lastSignature) {
        const confirmedTx = await checkForFinality(lastSignature);
        if (confirmedTx) {
          console.log(`Previous transaction confirmed on attempt ${attempt + 1}`);
          return lastSignature;
        }
      }
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

      const tx = await buildTransaction({
        blockhash,
        attempt,
        executionConfig
      });
      console.log(`Attempt ${attempt + 1}/${maxRetries} with ${Math.pow(2, attempt)}x fee multiplier`);

      lastSignature = await connection.sendRawTransaction(
        tx.serialize(),
        {
          skipPreflight: true,
          maxRetries: 1
        }
      );

      try {
        const confirmation = await Promise.race([
          connection.confirmTransaction({
            signature: lastSignature,
            blockhash,
            lastValidBlockHeight
          }, 'confirmed'),
          timeout(confirmTimeout)
        ]);

        if (confirmation?.value?.err) {
          const error = confirmation.value.err;
          console.log('Transaction error details:', error);

          // Immediately throw on 3012 without retry
          if (error.InstructionError?.[1]?.Custom === 3012) {
            throw new Error('Proposal already reclaimed');
          }

          throw new Error(`Transaction confirmed with error: ${JSON.stringify(error)}`);
        }

        console.log(`Transaction succeeded on attempt ${attempt + 1}`);
        return lastSignature;
      } catch (confirmError) {
        if (confirmError.message === 'Confirmation timeout') {
          console.log('Confirmation timed out, will check again before retry');
          const confirmedTx = await checkForFinality(lastSignature);
          if (confirmedTx) {
            console.log('Transaction confirmed after timeout');
            return lastSignature;
          }
          throw new Error('Confirmation timeout');
        }
        throw confirmError;
      }
    } catch (error) {
      lastError = error;
      const errorMessage = error?.message || 'Unknown error';
      console.log(`Attempt ${attempt + 1} failed:`, errorMessage);

      // Immediately throw 3012 error without retry
      if (errorMessage === 'Proposal already reclaimed') {
        throw error;
      }

      // Safely check for NaN error
      if (errorMessage && typeof errorMessage === 'string' && errorMessage.includes('NaN cannot be converted')) {
        throw new Error('Fee calculation failed: NaN error occurred');
      }

      if (lastSignature) {
        const confirmedTx = await checkForFinality(lastSignature);
        if (confirmedTx) {
          console.log(`Transaction confirmed while checking error`);
          return lastSignature;
        }
      }
    }
  }

  if (lastSignature) {
    const confirmedTx = await checkForFinality(lastSignature);
    if (confirmedTx) {
      return lastSignature;
    }
  }
  throw new Error(`Transaction failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Send a legacy transaction using TransactionInstructions
 */
export async function sendInstructions(instructions, signer, options = {}) {
  return sendAndConfirmWithRetry(
    async ({ blockhash, attempt, executionConfig }) => {
      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer = signer.publicKey;

      // Add instructions first for fee estimation
      tx.add(...instructions);

      const priority = await getPriority(tx, executionConfig);
      const multiplier = Math.pow(2, attempt);
      const adjustedMicroLamports = Math.floor(priority.microLamports * multiplier);

      console.log('Legacy tx fee calculation:', {
        baseMicroLamports: priority.microLamports,
        multiplier,
        adjustedMicroLamports
      });

      const adjustedPriorityIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: adjustedMicroLamports
      });

      // Rebuild with correct order
      tx.instructions = [];
      tx.add(adjustedPriorityIx, ...instructions);
      tx.sign(signer);
      return tx;
    },
    signer,
    options
  );
}

export async function sendMessage(message, accounts = [], signer, options = {}) {
  if (!signer?.publicKey) {
    throw new Error('Signer with public key is required');
  }

  return sendAndConfirmWithRetry(
    async ({ blockhash, attempt, executionConfig }) => {
      const msgInstructions = message.instructions;

      // Create versioned message to match the multisig structure
      const baseMessage = new TransactionMessage({
        payerKey: signer.publicKey,
        recentBlockhash: blockhash,
        instructions: msgInstructions,
        addressTableLookups: message.addressTableLookups || [] // Keep original lookups
      }).compileToV0Message(accounts);

      // Create transaction for fee estimation
      const feeTx = new VersionedTransaction(baseMessage);

      const priority = await getPriority(feeTx, executionConfig);
      const multiplier = Math.pow(2, attempt);
      const adjustedMicroLamports = Math.floor(priority.microLamports * multiplier);

      // Create final message with priority instruction
      const finalMessage = new TransactionMessage({
        payerKey: signer.publicKey,
        recentBlockhash: blockhash,
        instructions: [priority.instruction, ...msgInstructions],
        addressTableLookups: message.addressTableLookups || []
      }).compileToV0Message(accounts);

      const tx = new VersionedTransaction(finalMessage);

      const serializedSize = tx.serialize().length;
      console.log('Final transaction size:', serializedSize, 'bytes');

      if (serializedSize > 1232) {
        throw new Error(`Transaction too large: ${serializedSize} > 1232 bytes`);
      }

      tx.sign([signer]);
      return tx;
    },
    signer,
    options
  );
}

export function safeDecimalStr(amount, decimals) {
  // Handle edge cases
  if (decimals < 0) throw new Error('Decimals must be non-negative')
  if (!amount) return '0'

  // Convert input to string, handling different types
  const amountStr = (typeof amount === 'bigint')
    ? amount.toString()
    : String(BigInt(amount)) // Handles numbers and numeric strings

  if (decimals === 0) return amountStr

  const length = amountStr.length

  // Handle numbers smaller than 1
  if (length <= decimals) {
    return '0.' + '0'.repeat(decimals - length) + amountStr
  }

  // Insert decimal point for numbers >= 1
  const decimalIndex = length - decimals
  return amountStr.slice(0, decimalIndex) + '.' + amountStr.slice(decimalIndex)
}

export function safeDecimal(amount, decimals) {
  return Number(bigintToDecimalStr(amount, decimals))
}

const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
export function getMemo(memoText) {
  // Add memo instruction
  const memoIx = new TransactionInstruction({
    programId: pub(MEMO_PROGRAM_ID),
    keys: [],
    data: Buffer.from(memoText, 'utf-8')
  });
  return memoIx
}
