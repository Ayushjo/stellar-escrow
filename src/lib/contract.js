import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  Contract,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk'
import { signTx, NETWORK } from './wallets'
import { cacheGet, cacheSet, cacheDelete } from './cache'

export const CONTRACT_ID  = import.meta.env.VITE_CONTRACT_ID  || ''
export const NATIVE_TOKEN = import.meta.env.VITE_NATIVE_TOKEN || ''
export const RPC_URL      = 'https://soroban-testnet.stellar.org'
export const STROOP        = 10_000_000n  // 1 XLM = 10_000_000 stroops

export const rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: false })

// ── Helpers ───────────────────────────────────────────────────────────────────

export function xlmToStroops(xlm) { return BigInt(Math.round(xlm * 10_000_000)) }
export function stroopsToXlm(s)   { return Number(BigInt(s)) / 10_000_000 }

function scValToStatus(v) {
  const n = scValToNative(v)
  if (n?.Active  !== undefined || n === 'Active')   return 'Active'
  if (n?.Released !== undefined || n === 'Released') return 'Released'
  if (n?.Refunded !== undefined || n === 'Refunded') return 'Refunded'
  return 'Active'
}

function parseEscrowScVal(val) {
  const obj = scValToNative(val)
  return {
    creator:    obj.creator?.toString()   || obj.creator,
    recipient:  obj.recipient?.toString() || obj.recipient,
    amount:     Number(obj.amount),
    deadline:   Number(obj.deadline),
    status:     typeof obj.status === 'object' ? Object.keys(obj.status)[0] : obj.status,
    title:      obj.title,
    created_at: Number(obj.created_at),
  }
}

// ── Read-only simulation ──────────────────────────────────────────────────────

async function simulateRead(publicKey, method, ...args) {
  const account  = await rpc.getAccount(publicKey)
  const contract = new Contract(CONTRACT_ID)
  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: NETWORK,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build()
  const sim = await rpc.simulateTransaction(tx)
  if (SorobanRpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  return sim.result?.retval
}

// ── Write (simulate → assemble → sign → submit → poll) ───────────────────────

async function invokeContract(publicKey, method, ...args) {
  const account  = await rpc.getAccount(publicKey)
  const contract = new Contract(CONTRACT_ID)
  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: NETWORK,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build()

  const sim = await rpc.simulateTransaction(tx)
  if (SorobanRpc.Api.isSimulationError(sim)) {
    const msg = sim.error || ''
    if (msg.includes('already'))       throw Object.assign(new Error(msg), { code: 'DUPLICATE' })
    if (msg.includes('insufficient') || msg.includes('balance')) throw Object.assign(new Error('Insufficient XLM balance.'), { code: 'INSUFFICIENT_FUNDS' })
    throw new Error(msg)
  }

  const assembled = SorobanRpc.assembleTransaction(tx, sim).build()
  const signedXdr = await signTx(assembled.toXDR(), publicKey)
  const submitted = await rpc.sendTransaction(
    TransactionBuilder.fromXDR(signedXdr, NETWORK)
  )
  if (submitted.status === 'ERROR') throw new Error(submitted.errorResult?.toString() || 'Submission failed')
  return pollTx(submitted.hash)
}

async function pollTx(hash) {
  for (let i = 0; i < 40; i++) {
    await sleep(2000)
    const res = await rpc.getTransaction(hash)
    if (res.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return { hash, result: res.returnValue }
    if (res.status === SorobanRpc.Api.GetTransactionStatus.FAILED)
      throw Object.assign(new Error('Transaction failed on-chain.'), { code: 'TX_FAILED', hash })
  }
  throw Object.assign(new Error('Transaction timed out.'), { code: 'TX_TIMEOUT' })
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchEscrow(publicKey, id) {
  const cacheKey = `escrow_${id}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const retval = await simulateRead(
    publicKey, 'get_escrow', nativeToScVal(id, { type: 'u64' })
  )
  if (!retval) return null
  const inner = scValToNative(retval)
  if (inner === null || inner === undefined) return null

  const parsed = parseEscrowScVal(retval)
  cacheSet(cacheKey, parsed, 20_000)
  return parsed
}

export async function fetchAllEscrows(publicKey) {
  const cacheKey = `all_escrows_${publicKey}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const countRetval = await simulateRead(publicKey, 'count')
  const total = Number(scValToNative(countRetval))

  const results = []
  for (let i = 0; i < total; i++) {
    try {
      const e = await fetchEscrow(publicKey, i)
      if (e) results.push({ id: i, ...e })
    } catch { /* skip broken entries */ }
  }

  cacheSet(cacheKey, results, 15_000)
  return results
}

export function invalidateEscrowCache(id, publicKey) {
  cacheDelete(`escrow_${id}`)
  if (publicKey) cacheDelete(`all_escrows_${publicKey}`)
}

export async function createEscrow(publicKey, recipient, xlmAmount, deadlineTs, title) {
  const stroops = xlmToStroops(xlmAmount)
  const result = await invokeContract(
    publicKey,
    'create',
    Address.fromString(publicKey).toScVal(),
    Address.fromString(recipient).toScVal(),
    nativeToScVal(stroops, { type: 'i128' }),
    nativeToScVal(BigInt(deadlineTs), { type: 'u64' }),
    nativeToScVal(title, { type: 'string' }),
  )
  const newId = result.result ? Number(scValToNative(result.result)) : null
  invalidateEscrowCache(newId, publicKey)
  return { hash: result.hash, id: newId }
}

export async function releaseEscrow(publicKey, id) {
  const result = await invokeContract(
    publicKey, 'release',
    Address.fromString(publicKey).toScVal(),
    nativeToScVal(id, { type: 'u64' }),
  )
  invalidateEscrowCache(id, publicKey)
  return result.hash
}

export async function refundEscrow(publicKey, id) {
  const result = await invokeContract(
    publicKey, 'refund',
    Address.fromString(publicKey).toScVal(),
    nativeToScVal(id, { type: 'u64' }),
  )
  invalidateEscrowCache(id, publicKey)
  return result.hash
}
