import { useState, useEffect, useRef } from "react";
import "./ReportIssue.css";

const ISSUE_CATEGORIES = [
  { id: "recoloring", label: "Recolouring looks wrong" },
  { id: "upload", label: "Image upload failed" },
  { id: "performance", label: "Slow / unresponsive app" },
  { id: "other", label: "Other" },
];

const REPO_URL = "https://github.com/charlyx125/chromaknit/issues/new";

function ReportIssue() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap and Escape key handling
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    modalRef.current?.querySelector<HTMLElement>("button")?.focus();

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleSubmit = () => {
    if (!selected) return;

    const category = ISSUE_CATEGORIES.find((c) => c.id === selected);
    const title = selected === "other"
      ? `[User Report] ${details.slice(0, 60) || "Issue report"}`
      : `[User Report] ${category!.label}`;

    const bodyParts = [
      `**Category:** ${category!.label}`,
      details ? `\n**Details:**\n${details}` : "",
      `\n---\n*Submitted via in-app report*`,
    ];

    const url = `${REPO_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(bodyParts.join("\n"))}&labels=user-report`;
    window.open(url, "_blank");

    setOpen(false);
    setSelected(null);
    setDetails("");
  };

  const handleClose = () => {
    setOpen(false);
    setSelected(null);
    setDetails("");
  };

  return (
    <>
      <button
        className="report-fab"
        onClick={() => setOpen(true)}
        title="Report an issue"
        aria-label="Report an issue"
        aria-haspopup="dialog"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </button>

      {open && (
        <div className="report-overlay" onClick={handleClose}>
          <div
            className="report-modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="report-close" onClick={handleClose} aria-label="Close dialog">
              &times;
            </button>

            <h3 className="report-title" id="report-dialog-title">report an issue</h3>
            <p className="report-subtitle">what went wrong?</p>

            <div className="report-options">
              {ISSUE_CATEGORIES.map((cat) => (
                <label
                  key={cat.id}
                  className={`report-option${selected === cat.id ? " selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="issue-category"
                    value={cat.id}
                    checked={selected === cat.id}
                    onChange={() => setSelected(cat.id)}
                  />
                  <span className="report-option-radio" />
                  <span>{cat.label}</span>
                </label>
              ))}
            </div>

            {selected && (
              <textarea
                className="report-textarea"
                placeholder={selected === "other" ? "describe the issue..." : "any extra details? (optional)"}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
              />
            )}

            <button
              className="btn-primary report-submit"
              disabled={!selected || (selected === "other" && !details.trim())}
              onClick={handleSubmit}
            >
              report
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default ReportIssue;
