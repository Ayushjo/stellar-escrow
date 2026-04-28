import { StellarWalletsKit, Networks } from '@creit.tech/stellar-wallets-kit'
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter'
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull'
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr'

export const NETWORK = Networks.TESTNET

let _initialized = false

export function initKit() {
  if (_initialized) return
  StellarWalletsKit.init({
    network: NETWORK,
    modules: [new FreighterModule(), new xBullModule(), new LobstrModule()],
  })
  _initialized = true
}

export async function openWalletModal() {
  initKit()
  const { address } = await StellarWalletsKit.authModal({})
  return address
}

export async function disconnectWallet() {
  await StellarWalletsKit.disconnect()
}

export async function signTx(xdr, address) {
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
    address,
    networkPassphrase: NETWORK,
  })
  return signedTxXdr
}

export function classifyError(err) {
  const msg = (err?.message || '').toLowerCase()
  if (msg.includes('not found') || msg.includes('no wallet') || msg.includes('not installed') || msg.includes('extension')) {
    return { code: 'WALLET_NOT_FOUND', message: 'Wallet extension not found. Install Freighter, xBull, or LOBSTR.' }
  }
  if (msg.includes('reject') || msg.includes('denied') || msg.includes('declined') || msg.includes('closed the modal') || msg.includes('cancel')) {
    return { code: 'USER_REJECTED', message: 'You cancelled the transaction.' }
  }
  if (msg.includes('insufficient') || msg.includes('balance') || msg.includes('underfunded')) {
    return { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient XLM balance to cover this transaction.' }
  }
  if (msg.includes('deadline') || msg.includes('not active') || msg.includes('already')) {
    return { code: 'CONTRACT_ERROR', message: err.message }
  }
  return { code: 'UNKNOWN', message: err?.message || 'Something went wrong.' }
}
