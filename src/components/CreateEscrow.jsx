import { useState } from 'react'

const DEADLINE_OPTIONS = [
  { label: '24 hours', days: 1 },
  { label: '3 days',   days: 3 },
  { label: '7 days',   days: 7 },
  { label: '14 days',  days: 14 },
  { label: '30 days',  days: 30 },
  { label: 'Custom',   days: 0  },
]

export function CreateEscrow({ onSubmit, loading }) {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount]       = useState('')
  const [title, setTitle]         = useState('')
  const [preset, setPreset]       = useState(7)
  const [customDate, setCustomDate] = useState('')

  function getDeadlineTs() {
    if (preset === 0 && customDate) return Math.floor(new Date(customDate).getTime() / 1000)
    const d = new Date()
    d.setDate(d.getDate() + preset)
    return Math.floor(d.getTime() / 1000)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const deadlineTs = getDeadlineTs()
    if (deadlineTs <= Date.now() / 1000) return
    onSubmit({ recipient: recipient.trim(), amount: parseFloat(amount), title: title.trim(), deadlineTs })
  }

  return (
    <div className="create-panel">
      <div className="create-header">
        <div className="create-icon">🔒</div>
        <div>
          <h2>New Escrow</h2>
          <p className="create-sub">Lock XLM until you confirm the work is done.</p>
        </div>
      </div>

      <form className="create-form" onSubmit={handleSubmit}>
        <div className="field">
          <label>Title / Description</label>
          <input
            placeholder="e.g. Website design — 3 pages"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required maxLength={64}
          />
        </div>

        <div className="field">
          <label>Recipient Address</label>
          <input
            placeholder="G…"
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            required spellCheck={false}
          />
        </div>

        <div className="field">
          <label>Amount (XLM)</label>
          <input
            type="number"
            placeholder="0.00"
            min="1"
            step="any"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label>Deadline</label>
          <div className="preset-grid">
            {DEADLINE_OPTIONS.map(opt => (
              <button
                key={opt.days}
                type="button"
                className={`preset-btn ${preset === opt.days ? 'preset-active' : ''}`}
                onClick={() => setPreset(opt.days)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {preset === 0 && (
            <input
              type="date"
              value={customDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={e => setCustomDate(e.target.value)}
              required
              style={{ marginTop: 8 }}
            />
          )}
        </div>

        <button className="btn btn-primary btn-create" type="submit" disabled={loading}>
          {loading
            ? <><ProgressBar /><span>Creating Escrow…</span></>
            : '🔒 Create & Fund Escrow'}
        </button>
      </form>

      <div className="create-how">
        <p className="how-title">How it works</p>
        <div className="how-steps">
          <div className="how-step"><span className="step-num">1</span><span>Lock XLM in the smart contract</span></div>
          <div className="how-step"><span className="step-num">2</span><span>Recipient delivers the work</span></div>
          <div className="how-step"><span className="step-num">3</span><span>Release funds — or reclaim after deadline</span></div>
        </div>
      </div>
    </div>
  )
}

function ProgressBar() {
  return <span className="progress-ring" />
}
