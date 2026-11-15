/** Fired on window to show the first-run walkthrough again (Settings → General). */
export const onboardingEvent = 'anamnesies:onboarding';

export function openOnboarding() {
  window.dispatchEvent(new Event(onboardingEvent));
}
