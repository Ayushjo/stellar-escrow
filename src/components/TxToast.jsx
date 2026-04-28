export function TxToast({ toast, onClose }) {
  if (!toast) return null
  return (
    <div className={`tx-toast ${toast.type}`}>
      <div className="toast-inner">
        <span className="toast-icon">
          {toast.type === 'pending' && <span className="toast-spinner" />}
          {toast.type === 'success' && '✓'}
          {toast.type === 'error'   && '✗'}
        </span>
        <div className="toast-body">
          <p className="toast-msg">{toast.message}</p>
          {toast.hash && (
            <a
              className="toast-hash"
              href={`https://stellar.expert/explorer/testnet/tx/${toast.hash}`}
              target="_blank" rel="noreferrer"
            >
              {toast.hash.slice(0, 14)}… — View on Explorer ↗
            </a>
          )}
        </div>
        {toast.type !== 'pending' && (
          <button className="toast-close" onClick={onClose}>×</button>
        )}
      </div>
      {toast.type === 'pending' && <div className="toast-progress-bar" />}
    </div>
  )
}
