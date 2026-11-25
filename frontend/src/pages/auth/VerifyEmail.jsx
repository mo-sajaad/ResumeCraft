import { useEffect, useRef, useState } from "react";

import { useAuth } from "../../context/useAuth";

const SEND_ERRORS = {
  "auth/too-many-requests": "Too many emails were requested. Wait a few minutes, then try again.",
  "auth/network-request-failed": "The email could not be sent. Check your connection, then try again.",
};

// Shown by RedirectIfAuth to a signed-in user whose email is not verified.
export default function VerifyEmail() {
  const { user, verificationEmail, sendVerificationEmail, confirmEmailVerified, logout } = useAuth();
  const headingRef = useRef(null);
  const [action, setAction] = useState(""); // "confirm" or "logout" while pending
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // The form that had focus is gone.
  useEffect(() => headingRef.current?.focus(), []);

  const sent = verificationEmail?.uid === user.uid ? verificationEmail : null;
  const sending = sent?.status === "sending";
  const busy = sending || Boolean(action);

  let sendStatus = "";
  if (sending) sendStatus = "Sending the verification email...";
  if (sent?.status === "sent") sendStatus = "Verification email sent.";
  const sendError = sent?.status === "failed"
    ? SEND_ERRORS[sent.errorCode] || "The verification email could not be sent. Try again."
    : "";

  const statusText = action === "confirm" ? "Checking your email address..." : message || sendStatus;
  const errorText = error || (message || action ? "" : sendError);

  const run = async (name, task) => {
    setAction(name);
    setMessage("");
    setError("");
    try {
      await task();
    } finally {
      setAction("");
    }
  };

  const handleResend = () => {
    setMessage("");
    setError("");
    return sendVerificationEmail();
  };

  const handleConfirm = () => run("confirm", async () => {
    try {
      if (!(await confirmEmailVerified())) {
        setMessage("Your email address is not verified yet. Open the link in the email, then try again.");
      }
    } catch {
      setError("Your email address could not be checked. Try again.");
    }
  });

  const handleLogout = () => run("logout", () => logout().catch(() => {
    setError("You could not be signed out. Check your connection, then try again.");
  }));

  return (
    <section className="auth-form" aria-labelledby="verify-email-heading">
      <header className="auth-form-header">
        <h2 id="verify-email-heading" ref={headingRef} tabIndex={-1}>Check your email</h2>
        <p>
          To use ResumeCraft, open the verification link sent to <strong>{user.email}</strong>.
          If you cannot find it, check your spam folder or resend it.
        </p>
      </header>

      {errorText ? <p className="auth-error" role="alert">{errorText}</p> : null}
      <p className="auth-helper" role="status">{statusText}</p>

      <button type="button" className="auth-submit-btn" onClick={handleConfirm} disabled={busy}>
        {"I've verified my email"}
      </button>

      <button type="button" className="auth-google-btn" onClick={handleResend} disabled={busy}>
        {sending ? "Sending..." : "Resend email"}
      </button>

      <p className="auth-footer">
        Wrong address?{" "}
        <button type="button" className="auth-link auth-link-btn" onClick={handleLogout} disabled={busy}>
          Sign out
        </button>
      </p>
    </section>
  );
}
