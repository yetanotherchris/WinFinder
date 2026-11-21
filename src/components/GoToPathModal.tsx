import React, { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";

interface GoToPathModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (rawPath: string) => Promise<string | null>;
}

export const GoToPathModal: React.FC<GoToPathModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setValue("");
    setError(null);
    setSubmitting(false);
    // Focus input on next frame so the dialog is mounted and visible
    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const errMsg = await onSubmit(value);
      if (errMsg) {
        setError(errMsg);
        window.requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="finder-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="finder-dialog goto-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="goto-path-title"
      >
        <form className="goto-form" onSubmit={(e) => void handleSubmit(e)}>
          <label id="goto-path-title" htmlFor="goto-path-input" className="goto-dialog-title">
            Go to the folder:
          </label>
          <input
            ref={inputRef}
            id="goto-path-input"
            type="text"
            className={`goto-input ${error ? "has-error" : ""}`}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Paste or enter a path (e.g. ~/Documents)"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            disabled={submitting}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "goto-path-error" : undefined}
          />
          {error && (
            <div id="goto-path-error" className="goto-error" role="alert">
              <AlertCircle size={13} strokeWidth={2} className="goto-error-icon" />
              <span>{error}</span>
            </div>
          )}
          <div className="goto-dialog-actions">
            <button
              type="button"
              className="finder-dialog-btn goto-btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="finder-dialog-btn finder-dialog-btn-primary goto-btn"
              disabled={submitting}
            >
              Go
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
