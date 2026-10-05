import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/useAuth";
import { getAuthHeaders } from "../utils/auth";
import "./dashboard/DashboardShared.css";

export default function Payment() {
  const { profile, refreshProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  const activePlanCode = useMemo(
    () => (profile?.plan_code || "free").toLowerCase(),
    [profile?.plan_code],
  );

  const isPaidPlan = activePlanCode === "premium" || activePlanCode === "pro";
  const isPremiumPlan = activePlanCode === "premium";
  const isProPlan = activePlanCode === "pro";

  const premiumButtonLabel = isPremiumPlan
    ? "Current Plan"
    : isProPlan
      ? "Included in Pro"
      : "Choose Premium";

  const proButtonLabel = isProPlan
    ? "Current Plan"
    : isPremiumPlan
      ? "Upgrade to Pro"
      : "Choose Pro";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasSuccess = params.get("success") === "1";
    const hasCanceled = params.get("canceled") === "1";

    if (!hasSuccess && !hasCanceled) {
      return;
    }

    if (hasSuccess) {
      setFeedback({
        type: "success",
        message: "Payment successful. Updating your subscription…",
      });

      refreshProfile()
        .then(() => {
          setFeedback({
            type: "success",
            message: "Your subscription is active.",
          });
        })
        .catch(() => {
          setFeedback({
            type: "error",
            message:
              "Payment succeeded, but we could not refresh your plan yet. Please reload.",
          });
        });
    } else if (hasCanceled) {
      setFeedback({ type: "error", message: "Checkout was canceled." });
    }

    params.delete("success");
    params.delete("canceled");

    const cleanedQuery = params.toString();
    const cleanedUrl = `${window.location.pathname}${cleanedQuery ? `?${cleanedQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", cleanedUrl);
  }, [refreshProfile]);

  async function redirectToCheckout(plan) {
    setFeedback({ type: "", message: "" });
    setIsSubmitting(true);

    try {
      const headers = await getAuthHeaders({
        "Content-Type": "application/json",
      });

      const response = await fetch("/api/billing/checkout-session", {
        method: "POST",
        headers,
        body: JSON.stringify({ plan }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Unable to start checkout.");
      }

      window.location.assign(data.url);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
      setIsSubmitting(false);
    }
  }

  async function openBillingPortal() {
    setFeedback({ type: "", message: "" });
    setIsSubmitting(true);

    try {
      const headers = await getAuthHeaders();

      const response = await fetch("/api/billing/portal-session", {
        method: "POST",
        headers,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Unable to open billing portal.");
      }

      window.location.assign(data.url);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Choose Your Plan</h1>
          <p className="page-subtitle">
            Unlock powerful tools to boost your job search
          </p>
        </div>
      </div>

      {feedback.message && (
        <div
          className={`content-card ${feedback.type === "error" ? "error-message" : ""}`}
        >
          {feedback.message}
        </div>
      )}

      <div className="pricing-grid">
        {/* FREE */}
        <div className="pricing-card">
          <div className="pricing-features">
            <h3>Free</h3>

            <p className="pricing-price">
              $0 <span className="pricing-period">/month</span>
            </p>

            <p className="page-subtitle">Perfect for getting started</p>

            <div className="pricing-list">
              <span>✓ 1 resume</span>
              <span>✓ 1 cover letter</span>
              <span>✓ 1 basic template</span>
              <span>✓ Limited AI suggestions</span>
              <span>✓ PDF download</span>
            </div>
          </div>

          <button className="btn btn-outline pricing-button" disabled>
            {activePlanCode === "free" ? "Current Plan" : "Included"}
          </button>
        </div>

        {/* PREMIUM */}
        <div
          className={`pricing-card ${isPremiumPlan ? "featured" : "with-badge"}`}
        >
          <span className="pricing-badge">
            {isPremiumPlan ? "Current Plan" : "Most Popular"}
          </span>

          <div className="pricing-features">
            <h3>Premium</h3>

            <p className="pricing-price">
              $9.99 <span className="pricing-period">/month</span>
            </p>

            <p className="page-subtitle">For serious job seekers</p>

            <div className="pricing-list">
              <span>✓ Unlimited resumes</span>
              <span>✓ Unlimited cover letters</span>
              <span>✓ 50+ premium templates</span>
              <span>✓ Unlimited downloads</span>
              <span>✓ Advanced AI suggestions</span>
              <span>✓ ATS optimization score</span>
            </div>
          </div>

          <button
            className="btn btn-dark pricing-button"
            onClick={() => redirectToCheckout("premium")}
            disabled={isSubmitting || isPremiumPlan || isProPlan}
            aria-current={isPremiumPlan ? "true" : undefined}
          >
            {premiumButtonLabel}
          </button>
        </div>

        {/* PRO */}
        <div className={`pricing-card ${isProPlan ? "featured" : ""}`}>
          {isProPlan && <span className="pricing-badge">Current Plan</span>}

          <div className="pricing-features">
            <h3>Pro</h3>

            <p className="pricing-price">
              $19.99 <span className="pricing-period">/month</span>
            </p>

            <p className="page-subtitle">For power users & professionals</p>

            <div className="pricing-list">
              <span>✓ Everything in Premium</span>
              <span>✓ Recruiter scan</span>
              <span>✓ Salary estimates and market demand</span>
              <span>✓ Competitive analysis</span>
            </div>
          </div>

          <button
            className="btn btn-outline pricing-button"
            onClick={() => redirectToCheckout("pro")}
            disabled={isSubmitting || isProPlan}
            aria-current={isProPlan ? "true" : undefined}
          >
            {proButtonLabel}
          </button>
        </div>
      </div>

      {isPaidPlan && (
        <div className="content-section">
          <div className="content-card text-align">
            <h3>Already subscribed?</h3>
            <p className="page-subtitle">
              Manage your payment method and invoices.
            </p>

            <button
              className="btn btn-dark"
              onClick={openBillingPortal}
              disabled={isSubmitting}
            >
              Manage Billing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
