/** Fired on window to show the first-run walkthrough again (Settings → General). */
export const onboardingEvent = 'anamnesies:onboarding';

export function openOnboarding() {
  window.dispatchEvent(new Event(onboardingEvent));
}

/**
 * Stations of the first run. "account" is the setup screen before signing in (auth-gate.tsx); the
 * walkthrough (onboarding/walkthrough.tsx) continues from "welcome" once the account exists.
 */
export const onboardingSteps = ['account', 'welcome', 'tour', 'design', 'mcp', 'telegram', 'done'] as const;
export type OnboardingStep = typeof onboardingSteps[number];
