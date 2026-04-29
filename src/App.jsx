import { useState, useEffect, useCallback, useRef } from 'react'
import { openWalletModal, disconnectWallet, classifyError, initKit } from './lib/wallets'
import {
  fetchAllEscrows,
  createEscrow,
  releaseEscrow,
  refundEscrow,
  invalidateEscrowCache,
  CONTRACT_ID,
} from './lib/contract'
import { CreateEscrow } from './components/CreateEscrow'
import { EscrowCard, EscrowCardSkeleton } from './components/EscrowCard'
import { TxToast } from './components/TxToast'

export default function App() {
  const [address, setAddress]       = useState('')
  const [connecting, setConnecting] = useState(false)
  const [tab, setTab]               = useState('sent')      // 'sent' | 'received' | 'new'
  const [escrows, setEscrows]       = useState([])
  const [loading, setLoading]       = useState(false)
  const [creating, setCreating]     = useState(false)
  const [toast, setToast]           = useState(null)
  const [actionId, setActionId]     = useState(null)        // escrow id being actioned
  const [actionType, setActionType] = useState(null)        // 'release' | 'refund'
  const pollRef = useRef(null)

  useEffect(() => { initKit() }, [])

  const loadEscrows = useCallback(async (addr) => {
    if (!addr || !CONTRACT_ID) return
    setLoading(true)
    try {
      const list = await fetchAllEscrows(addr)
      setEscrows(list)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!address) return
    loadEscrows(address)
    pollRef.current = setInterval(() => loadEscrows(address), 15_000)
    return () => clearInterval(pollRef.current)
  }, [address, loadEscrows])

  async function handleConnect() {
    setConnecting(true)
    setToast(null)
    try {
      const addr = await openWalletModal()
      setAddress(addr)
    } catch (err) {
      const e = classifyError(err)
      setToast({ type: 'error', message: e.message })
    } finally { setConnecting(false) }
  }

  function handleDisconnect() {
    disconnectWallet()
    setAddress('')
    setEscrows([])
    clearInterval(pollRef.current)
    setToast(null)
  }

  async function handleCreate({ recipient, amount, title, deadlineTs }) {
    setCreating(true)
    setToast({ type: 'pending', message: 'Sign the transaction in your wallet…' })
    const confirmTimer = setTimeout(
      () => setToast({ type: 'pending', message: 'Confirming on-chain… this usually takes 10–30s.' }),
      7_000
    )
    try {
      const { hash, id } = await createEscrow(address, recipient, amount, deadlineTs, title)
      clearTimeout(confirmTimer)
      setToast({ type: 'success', message: `Escrow #${id} created! ${amount} XLM locked on-chain.`, hash })
      setTab('sent')
      await loadEscrows(address)
    } catch (err) {
      clearTimeout(confirmTimer)
      setToast({ type: 'error', message: classifyError(err).message })
    } finally { setCreating(false) }
  }

  async function handleRelease(id) {
    setActionId(id); setActionType('release')
    setToast({ type: 'pending', message: 'Sign the transaction in your wallet…' })
    const confirmTimer = setTimeout(
      () => setToast({ type: 'pending', message: 'Confirming on-chain… this usually takes 10–30s.' }),
      7_000
    )
    try {
      const hash = await releaseEscrow(address, id)
      clearTimeout(confirmTimer)
      setToast({ type: 'success', message: 'Funds released to recipient!', hash })
      invalidateEscrowCache(id, address)
      await loadEscrows(address)
    } catch (err) {
      clearTimeout(confirmTimer)
      setToast({ type: 'error', message: classifyError(err).message })
    } finally { setActionId(null); setActionType(null) }
  }

  async function handleRefund(id) {
    setActionId(id); setActionType('refund')
    setToast({ type: 'pending', message: 'Sign the transaction in your wallet…' })
    const confirmTimer = setTimeout(
      () => setToast({ type: 'pending', message: 'Confirming on-chain… this usually takes 10–30s.' }),
      7_000
    )
    try {
      const hash = await refundEscrow(address, id)
      clearTimeout(confirmTimer)
      setToast({ type: 'success', message: 'Refund claimed successfully!', hash })
      invalidateEscrowCache(id, address)
      await loadEscrows(address)
    } catch (err) {
      clearTimeout(confirmTimer)
      setToast({ type: 'error', message: classifyError(err).message })
    } finally { setActionId(null); setActionType(null) }
  }

  const sentEscrows     = escrows.filter(e => e.creator?.toLowerCase() === address.toLowerCase())
  const receivedEscrows = escrows.filter(e => e.recipient?.toLowerCase() === address.toLowerCase())
  const displayEscrows  = tab === 'sent' ? sentEscrows : receivedEscrows

  const stats = {
    activeCount:   sentEscrows.filter(e => e.status === 'Active').length,
    releasedCount: sentEscrows.filter(e => e.status === 'Released').length,
    totalLocked:   sentEscrows.filter(e => e.status === 'Active').reduce((a, e) => a + e.amount, 0),
  }

  function shortAddr(a) { return `${a.slice(0, 6)}…${a.slice(-4)}` }

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="header">
        <div className="logo">
          <span className="logo-icon">🔒</span>
          <span className="logo-text">StellarEscrow</span>
          <span className="logo-tag">Testnet</span>
        </div>
        {address && (
          <div className="header-right">
            <div className="addr-chip">
              <span className="addr-dot" />
              <span className="addr-text">{shortAddr(address)}</span>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={handleDisconnect}>Disconnect</button>
          </div>
        )}
      </header>

      {/* ── Toast ──────────────────────────────────────────────────────── */}
      <TxToast toast={toast} onClose={() => setToast(null)} />

      <main className="main">
        {/* ── Landing ──────────────────────────────────────────────────── */}
        {!address && (
          <div className="landing">
            <div className="landing-badge">Powered by Soroban Smart Contracts</div>
            <h1 className="landing-title">Trustless Escrow<br />on Stellar</h1>
            <p className="landing-sub">
              Lock XLM in a smart contract. Release when the work is done.<br />
              No middlemen. No risk. Just code.
            </p>
            <button className="btn btn-primary btn-lg" onClick={handleConnect} disabled={connecting}>
              {connecting ? <><span className="btn-spinner" /> Connecting…</> : 'Connect Wallet to Start'}
            </button>
            <p className="landing-hint">Supports Freighter · xBull · LOBSTR</p>

            <div className="feature-grid">
              <div className="feature-card">
                <span className="fc-icon">🛡️</span>
                <h3>Non-Custodial</h3>
                <p>Funds are held by the smart contract, never a third party.</p>
              </div>
              <div className="feature-card">
                <span className="fc-icon">⚡</span>
                <h3>Instant Settlement</h3>
                <p>Release with one click. Settles in ~5 seconds on Stellar.</p>
              </div>
              <div className="feature-card">
                <span className="fc-icon">⏰</span>
                <h3>Deadline Protection</h3>
                <p>Reclaim your funds automatically after the deadline passes.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Dashboard ────────────────────────────────────────────────── */}
        {address && (
          <div className="dashboard">
            {/* Stats bar */}
            <div className="stats-bar">
              <StatCard label="Active Escrows"  value={stats.activeCount} />
              <StatCard label="Released"        value={stats.releasedCount} />
              <StatCard
                label="XLM Locked"
                value={`${(stats.totalLocked / 10_000_000).toFixed(2)} XLM`}
                highlight
              />
            </div>

            {/* Tab nav */}
            <div className="tab-row">
              <button className={`tab-btn ${tab === 'sent'     ? 'tab-active' : ''}`} onClick={() => setTab('sent')}>
                Sent <span className="tab-count">{sentEscrows.length}</span>
              </button>
              <button className={`tab-btn ${tab === 'received' ? 'tab-active' : ''}`} onClick={() => setTab('received')}>
                Received <span className="tab-count">{receivedEscrows.length}</span>
              </button>
              <button className={`tab-btn ${tab === 'new'      ? 'tab-active' : ''}`} onClick={() => setTab('new')}>
                + New Escrow
              </button>
            </div>

            {/* New escrow form */}
            {tab === 'new' && (
              <CreateEscrow onSubmit={handleCreate} loading={creating} />
            )}

            {/* Escrow list */}
            {tab !== 'new' && (
              <div className="escrow-list">
                {loading && displayEscrows.length === 0 && (
                  [0, 1, 2].map(i => <EscrowCardSkeleton key={i} />)
                )}
                {!loading && displayEscrows.length === 0 && (
                  <div className="empty-state">
                    <span className="empty-icon">📭</span>
                    <p>{tab === 'sent' ? "You haven't created any escrows yet." : "No escrows have been sent to your address."}</p>
                    {tab === 'sent' && (
                      <button className="btn btn-primary" onClick={() => setTab('new')}>Create Your First Escrow</button>
                    )}
                  </div>
                )}
                {displayEscrows.map(e => (
                  <EscrowCard
                    key={e.id}
                    id={e.id}
                    escrow={e}
                    userAddress={address}
                    onRelease={handleRelease}
                    onRefund={handleRefund}
                    releasing={actionId === e.id && actionType === 'release'}
                    refunding={actionId === e.id && actionType === 'refund'}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        {CONTRACT_ID && (
          <a
            href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
            target="_blank" rel="noreferrer"
            className="footer-contract"
          >
            Contract: {CONTRACT_ID.slice(0, 12)}…
          </a>
        )}
        <span>StellarEscrow · Soroban Testnet · {new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}

function StatCard({ label, value, highlight }) {
  return (
    <div className={`stat-card ${highlight ? 'stat-highlight' : ''}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  )
}
