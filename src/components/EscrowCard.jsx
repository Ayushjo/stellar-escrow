import { stroopsToXlm } from '../lib/contract'

const STATUS_META = {
  Active:   { label: 'Active',    cls: 'status-active',    dot: '#6c8eff' },
  Released: { label: 'Released',  cls: 'status-released',  dot: '#22c55e' },
  Refunded: { label: 'Refunded',  cls: 'status-refunded',  dot: '#f59e0b' },
}

function fmtDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtAddr(a) { return `${a.slice(0, 6)}…${a.slice(-4)}` }

export function EscrowCard({ escrow, id, userAddress, onRelease, onRefund, releasing, refunding }) {
  const meta = STATUS_META[escrow.status] || STATUS_META.Active
  const now = Math.floor(Date.now() / 1000)
  const isCreator   = escrow.creator?.toLowerCase() === userAddress?.toLowerCase()
  const isExpired   = now >= escrow.deadline
  const canRelease  = isCreator && escrow.status === 'Active'
  const canRefund   = isCreator && escrow.status === 'Active' && isExpired
  const isBusy      = releasing || refunding

  return (
    <div className={`escrow-card ${escrow.status === 'Active' ? 'card-active' : 'card-settled'}`}>
      <div className="ec-header">
        <div className="ec-title-row">
          <span className="ec-id">#{id}</span>
          <h3 className="ec-title">{escrow.title}</h3>
        </div>
        <span className={`status-pill ${meta.cls}`}>{meta.label}</span>
      </div>

      <div className="ec-amount">{stroopsToXlm(escrow.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="ec-unit">XLM</span></div>

      <div className="ec-meta">
        <div className="ec-row">
          <span className="ec-key">From</span>
          <span className="ec-val monospace" title={escrow.creator}>{fmtAddr(escrow.creator)}</span>
        </div>
        <div className="ec-row">
          <span className="ec-key">To</span>
          <span className="ec-val monospace" title={escrow.recipient}>{fmtAddr(escrow.recipient)}</span>
        </div>
        <div className="ec-row">
          <span className="ec-key">Deadline</span>
          <span className={`ec-val ${isExpired && escrow.status === 'Active' ? 'text-red' : ''}`}>
            {fmtDate(escrow.deadline)}
            {isExpired && escrow.status === 'Active' && <span className="overdue-tag">Overdue</span>}
          </span>
        </div>
        <div className="ec-row">
          <span className="ec-key">Created</span>
          <span className="ec-val">{fmtDate(escrow.created_at)}</span>
        </div>
      </div>

      {(canRelease || canRefund) && (
        <div className="ec-actions">
          {canRelease && (
            <button
              className="btn btn-release"
              onClick={() => onRelease(id)}
              disabled={isBusy}
            >
              {releasing ? <><span className="btn-spinner" /> Releasing…</> : '✓ Release to Recipient'}
            </button>
          )}
          {canRefund && (
            <button
              className="btn btn-refund"
              onClick={() => onRefund(id)}
              disabled={isBusy}
            >
              {refunding ? <><span className="btn-spinner" /> Refunding…</> : '↩ Claim Refund'}
            </button>
          )}
        </div>
      )}

      {!isCreator && escrow.status === 'Active' && (
        <p className="ec-waiting">Waiting for the creator to release funds…</p>
      )}
    </div>
  )
}

export function EscrowCardSkeleton() {
  return (
    <div className="escrow-card card-skeleton">
      <div className="sk sk-title" />
      <div className="sk sk-amount" />
      <div className="sk sk-row" />
      <div className="sk sk-row" />
      <div className="sk sk-row sk-short" />
    </div>
  )
}
