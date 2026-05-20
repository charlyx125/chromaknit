import { useState, useEffect, useRef } from "react";
import "./ReportIssue.css";

const ISSUE_CATEGORIES = [
  { id: "recoloring", label: "Recolouring looks wrong" },
  { id: "upload", label: "Image upload failed" },
  { id: "performance", label: "Slow / unresponsive app" },
  { id: "other", label: "Other" },
];

const FORMSPREE_URL = "https://formspree.io/f/mqewplpo";

// After a successful submission, the Send button stays disabled for this
// many milliseconds. UX guard against the impatient-user case (clicking Send
// again immediately after the success animation). Scripted abuse is handled
// upstream by Formspree's CAPTCHA + honeypot.
const COOLDOWN_MS = 30_000;

function ReportIssue() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [lastSubmittedAt, setLastSubmittedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const modalRef = useRef<HTMLDivElement>(null);

  // Tick once per second only while a cooldown is active. The interval is
  // torn down as soon as the cooldown elapses, so we don't rerender forever.
  useEffect(() => {
    if (lastSubmittedAt === 0) return;
    if (Date.now() - lastSubmittedAt >= COOLDOWN_MS) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [lastSubmittedAt, now]);

  const cooldownMs = Math.max(0, COOLDOWN_MS - (now - lastSubmittedAt));
  const inCooldown = lastSubmittedAt > 0 && cooldownMs > 0;
  const cooldownSeconds = Math.ceil(cooldownMs / 1000);

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

  const handleSubmit = async () => {
    if (!selected) return;

    const category = ISSUE_CATEGORIES.find((c) => c.id === selected);
    setSubmitting(true);
    setSubmitError(false);

    try {
      const res = await fetch(FORMSPREE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          category: category!.label,
          details: details || "(no details provided)",
        }),
      });

      if (!res.ok) throw new Error();
      setSubmitted(true);
      setLastSubmittedAt(Date.now());
      setNow(Date.now());
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSelected(null);
    setDetails("");
    setSubmitted(false);
    setSubmitError(false);
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

            {submitted ? (
              <div className="report-success">
                <span className="report-success-icon" aria-hidden="true">&#x2714;</span>
                <h3 className="report-title" id="report-dialog-title">
                  Sent, with <em>thanks</em>
                </h3>
                <p className="report-subtitle">We will read every word.</p>
                <button type="button" className="report-submit" onClick={handleClose}>
                  Close
                </button>
              </div>
            ) : (
              <>
                <span className="report-eyebrow caps">Found a problem</span>
                <h3 className="report-title" id="report-dialog-title">
                  Report an <em>issue</em>
                </h3>
                <p className="report-subtitle">
                  Tell us what went wrong, in as much or as little detail as you like.
                </p>

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
                      <span className="report-option-radio" aria-hidden="true" />
                      <span>{cat.label}</span>
                    </label>
                  ))}
                </div>

                {selected && (
                  <textarea
                    className="report-textarea"
                    placeholder={selected === "other" ? "Describe the issue..." : "Any extra details? (optional)"}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    rows={3}
                  />
                )}

                {submitError && (
                  <p className="report-error" role="alert">
                    Something went wrong. Please try again.
                  </p>
                )}

                {inCooldown && (
                  <p className="report-cooldown" role="status">
                    Sent. You can send another in {cooldownSeconds}s.
                  </p>
                )}

                <button
                  type="button"
                  className="report-submit"
                  disabled={submitting || inCooldown || !selected || (selected === "other" && !details.trim())}
                  onClick={handleSubmit}
                >
                  {submitting
                    ? "Sending..."
                    : inCooldown
                      ? `Wait ${cooldownSeconds}s`
                      : "Send report"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default ReportIssue;
