import { useState } from "react";

import Button from "../components/ui/Button.jsx";
import { ErrorState } from "../components/ui/LoadingState.jsx";
import { useAuth } from "../context/useAuth";

// Shown instead of the app when the API session or the first profile load
// failed, so a signed-in user never sees a dashboard without an account (IDENTITY-009).
export default function SessionError() {
  const { retrySession, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  const run = async (action) => {
    setBusy(true);
    setSignOutFailed(false);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => run(() => logout().catch(() => setSignOutFailed(true)));

  return (
    <ErrorState
      title="We could not load your account"
      description={signOutFailed
        ? "You could not be signed out. Check your connection and try again."
        : "This is usually temporary. Check your connection, then try again."}
      action={(
        <>
          <Button type="button" onClick={() => run(retrySession)} disabled={busy}>
            {busy ? "Please wait..." : "Retry"}
          </Button>
          <Button type="button" variant="secondary" onClick={signOut} disabled={busy}>
            Sign out
          </Button>
        </>
      )}
    />
  );
}
