export async function register() {
  // Only run on server side (Node.js runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { fetchAllFeeds } = await import('./lib/rss');
    const cron = await import('node-cron');

    // Initial fetch on startup
    console.log('[Instrumentation] Starting initial RSS fetch...');
    fetchAllFeeds().catch((err) => {
      console.error('[Instrumentation] Initial RSS fetch failed:', err);
    });

    // Schedule daily refresh at 6:00 AM
    cron.schedule('0 6 * * *', () => {
      console.log('[Cron] Running scheduled RSS fetch...');
      fetchAllFeeds().catch((err) => {
        console.error('[Cron] Scheduled RSS fetch failed:', err);
      });
    });

    console.log('[Instrumentation] Cron job scheduled (daily at 6:00 AM)');
  }
}
