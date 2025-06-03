const puppeteer = require('puppeteer');
const { createClient } = require('redis');

const sort = process.argv.includes('top') ? 'top' : 'new';
const USERNAME = process.argv?.[2];
const PASSWORD = process.argv?.[3];

const targetSites = [
  'wsj.com',
  'theatlantic.com',
  'washingtonpost.com',
  'nytimes.com',
  'chronicle.com',
  'wired.com',
  'economist.com',
  'theguardian.com',
  'telegraph.co.uk',
  'latimes.com',
];

// Builds a “site:foo.com+OR+site:bar.com+…” query string
const siteQueryFilter = (sites) => sites.map((site) => `site:${site}`).join('+OR+');

function extractBreakMinutes(input) {
  const regex = /Take a break for\s+(\d+)\s+minutes before trying again\./;
  const match = input.match(regex);
  return match ? parseInt(match[1], 10) : null;
}

function extractBreakSeconds(input) {
  const regex = /Take a break for\s+(\d+)\s+seconds before trying again\./;
  const match = input.match(regex);
  return match ? parseInt(match[1], 10) : null;
}

(async () => {
  // === A. SET UP REDIS CLIENT ===
  const redis = createClient({ url: 'redis://localhost:6379' });
  redis.on('error', (err) => console.error('Redis Client Error', err));
  await redis.connect();
  console.log('✅ Connected to Redis');

  // === B. LAUNCH BROWSER & LOG IN ONCE ===
  const browser = await puppeteer.launch({
    args: ['--incognito'],
    executablePath: '/usr/bin/google-chrome',
    headless: false,
    defaultViewport: null,
  });

  // Create one “searchPage” that we’ll reuse for every sweep
  const searchPage = await browser.newPage();
  await searchPage.setViewport({ width: 1280, height: 800 });

  // 1. Go to Reddit login page
  await searchPage.goto('https://old.reddit.com/login', { waitUntil: 'networkidle2' });
  await searchPage.waitForSelector('faceplate-text-input');

  // 2. Fill in username & password
  const hosts = await searchPage.$$('faceplate-text-input');
  const usernameHandle = await hosts[0].evaluateHandle((el) => el.shadowRoot.querySelector('input'));
  const passwordHandle = await hosts[1].evaluateHandle((el) => el.shadowRoot.querySelector('input'));
  const usernameInput = usernameHandle.asElement();
  const passwordInput = passwordHandle.asElement();
  await usernameInput.type(USERNAME, { delay: 30 });
  await passwordInput.type(PASSWORD, { delay: 30 });

  // 3. Click “Log In” and wait for navigation
  await new Promise((r) => setTimeout(r, 500)); // small delay for UX
  const submitButtonHost = await searchPage.$$('faceplate-tracker');
  const submitButton = await submitButtonHost[2].evaluateHandle((el) => el.firstElementChild);
  await Promise.all([
    submitButton.click(),
    searchPage.waitForNavigation({ waitUntil: 'networkidle2' }),
  ]);
  console.log('✅ Logged in to Reddit');

  // === C. DEFINE ONE-SHOT SWEEP FUNCTION (uses the already-logged-in searchPage) ===
  const sweepRedditHomepage = async () => {
    const SEARCH_URL = `https://old.reddit.com/search?q=(${siteQueryFilter(
      targetSites
    )})&restrict_sr=off&sort=${sort}&t=day`;

    // Navigate the existing “searchPage” to the correct search URL
    await searchPage.goto(SEARCH_URL, { waitUntil: 'networkidle2' });
    console.log('🔍 Navigated to search results.');

    // Wait for search results to load
    await searchPage.waitForSelector('.search-result-link');
    const postLinks = await searchPage.$$eval(
      '.search-result-link > a.thumbnail',
      (anchors) => anchors.map((a) => a.href).filter((href) => href.includes('/r/'))
    );
    console.log(`Found ${postLinks.length} posts on this sweep.`);

    for (const postUrl of postLinks) {
      try {
        console.log(`\n➡️ Checking thread: ${postUrl}`);

        // --- C.1. SKIP IF ALREADY PROCESSED ---
        const already = await redis.sIsMember('processedThreads', postUrl);
        if (already) {
          console.log('⏭️  Already processed. Skipping.');
          continue;
        }
        // Mark it “seen” in Redis immediately (so if we crash mid-post, we won’t revisit)
        await redis.sAdd('processedThreads', postUrl);

        // --- C.2. OPEN THREAD IN A NEW TAB ---
        const postPage = await browser.newPage();
        await postPage.setViewport({ width: 1280, height: 800 });
        await postPage.goto(postUrl, { waitUntil: 'networkidle2' });

        // If “unbloq.us” already exists anywhere, skip
        const html = await postPage.content();
        if (html.includes('unbloq.us')) {
          console.log('✅ Already contains “unbloq.us”. Closing tab.');
          await postPage.close();
          continue;
        }

        // --- C.3. EXTRACT OUTBOUND LINK & ARCHIVE IT ---
        await postPage.waitForSelector('a.outbound', { timeout: 5000 });
        const outboundHref = await postPage.$eval('a.outbound', (el) => el.href);
        console.log(`→ Outbound link found: ${outboundHref}`);

        const linkBase = outboundHref.split('?')[0];
        const unbloqUrl = `https://unbloq.us/${linkBase}`;
        console.log(`→ Visiting archive: ${unbloqUrl}`);

        const archivePage = await browser.newPage();
        await archivePage.goto(unbloqUrl, { waitUntil: 'networkidle2' });
        await archivePage.close();

        // --- C.4. POST COMMENT WITH ARCHIVE LINK ---
        await postPage.waitForSelector('textarea[name="text"]', { timeout: 5000 });
        await postPage.click('textarea[name="text"]');

        const commentText = `${unbloqUrl}

tip: put "unbloq.us/" before any link to jump to an archive of it`;
        await postPage.type('textarea[name="text"]', commentText, { delay: 20 });

        await Promise.all([
          postPage.click('form.usertext button[type="submit"]'),
          new Promise((r) => setTimeout(r, 500)), // small delay for network
        ]);
        console.log('→ Comment submitted.');

        // --- C.5. HANDLE RATE LIMITS ---
        await new Promise((r) => setTimeout(r, 1000)); // wait for any rate-limit text
        const htmlAfter = await postPage.content();
        const rateLimitMinutes = extractBreakMinutes(htmlAfter);
        const rateLimitSeconds = extractBreakSeconds(htmlAfter);

        if (rateLimitMinutes) {
          console.log(`⚠️ Rate limit: waiting ${rateLimitMinutes} minutes…`);
          await new Promise((r) => setTimeout(r, rateLimitMinutes * 60 * 1000 + 500));
        } else if (rateLimitSeconds) {
          console.log(`⚠️ Rate limit: waiting ${rateLimitSeconds} seconds…`);
          await new Promise((r) => setTimeout(r, rateLimitSeconds * 1000 + 500));
        }

        console.log('✅ Comment posted successfully.');
        await postPage.close();

        // Pause a bit before the next thread
        await new Promise((r) => setTimeout(r, 30 * 1000));
      } catch (err) {
        console.warn(`⚠️  Error with ${postUrl}: ${err.message}`);
        // Close any extra tab if it’s still open
        const pages = await browser.pages();
        if (pages.length > 1) {
          await pages[pages.length - 1].close();
        }
      }
    }

    console.log('— End of this sweep —');
  };

  // === D. RUN FIRST SWEEP, THEN REPEAT IF “new” ===
  await sweepRedditHomepage();

  if (sort === 'new') {
    while (true) {
      console.log('⏰ Waiting 5 minutes before next sweep…');
      await new Promise((r) => setTimeout(r, 15 * 60 * 1000));
      await sweepRedditHomepage();
    }
  } else {
    // If sort === 'top', we only do one sweep and then exit.
    await redis.disconnect();
    console.log('✅ Disconnected from Redis. Closing browser and exiting.');
    await browser.close();
  }
})();
