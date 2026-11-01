// Navigation route names
export const ROUTES = {
  // Main app routes
  CHAT: 'Chat',
  MODELS: 'Models',
  BENCHMARK: 'Benchmark',
  SETTINGS: 'Settings',
  APP_INFO: 'App Info',

  // Dev tools route. Only available in debug mode.
  DEV_TOOLS: 'Dev Tools',

  // E2E-only deep-link-driven matrix runner. Hidden from drawer sidebar via
  // drawerItemStyle:{display:'none'}; reachable only by the deep link
  // pocketpal://e2e/benchmark in the e2e flavor build. The URL prefix,
  // matcher, and autostart parser live in src/__automation__/benchmarkRoute
  // so the automation protocol stays inside the __automation__ boundary.
  BENCHMARK_RUNNER: 'BenchmarkRunner',

  // Onboarding stack routes (mounted via OnboardingStack when
  // uiStore.hasCompletedOnboarding is false; see App.tsx SwitchPoint).
  // Splash goes straight to the single auto-setup screen — no chrome,
  // no skip button, no marketing carousel or topic/pal picker.
  ONBOARDING: {
    SPLASH: 'OnboardingSplash',
    STEP_6: 'Onboarding6',
  } as const,
} as const;
