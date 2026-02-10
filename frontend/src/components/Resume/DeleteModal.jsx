import "./ResumePages.css";


export default function DeleteModal({
  open,
  title,
  description,
  onCancel,
  onConfirm,
}) {
  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      aria-describedby="delete-modal-desc"
    >
      <div className="modal">
        <h3 id="delete-modal-title">{title}</h3>
        <p id="delete-modal-desc">{description}</p>

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
