/** Built-in sample ("demo") content labels — shown with a `DemoBadge` wherever sample data renders. */
export const demo = {
  badge: 'Sample data',
  hint: 'Built-in sample content for previewing the workspace. These are not your actual holdings or live market values.',
  about: 'About sample data',
  realDataHint: 'Quotes and portfolio cards switch to real data when their data source returns successfully. Refresh the page data after fixing the connection or permissions.',
  quotesUnavailable: 'The live quote request failed, so this section uses sample prices.',
  portfolioUnavailable: 'The account data request failed, so this section uses a sample portfolio.',
  portfolioPermission: 'The current authorization does not include account-data access. Portfolio access must be authorized before real holdings can be shown.',
  portfolioEmpty: 'The account returned no assets or holdings. The amounts shown here belong to a sample portfolio.',
  eventsUnavailable: 'This page does not currently have a real calendar feed. These events are layout examples; logging in will not turn them into live events.',
  brief: {
    summary: '2 things need your attention today',
    quiet: '2 monitored securities stayed below the materiality bar.',
    riskTitle: 'AAPL regulatory risk may pressure Q4 margins',
    riskMessage:
      'A pending EU App Store ruling could slightly affect services margins. Suggested action: review the stress-test model.',
    rotationTitle: 'Sector rotation: tech momentum cooling',
    rotationMessage:
      'Technology momentum is slowing while healthcare shows defensive strength. Consider reviewing defensive allocations.',
  },
  events: {
    earningsName: 'AAPL Earnings Call (Q3)',
    earningsContent: 'Quarterly results and guidance call after market close.',
    macroName: 'PCE Inflation Data',
    macroContent: 'Core PCE release; a key inflation gauge for the Fed.',
    fomcName: 'FOMC Press Conference',
    fomcContent: 'Rate decision and forward guidance; watch the tone on inflation.',
  },
} as const;
