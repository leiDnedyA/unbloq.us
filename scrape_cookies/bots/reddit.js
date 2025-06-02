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

// Example:
// site:theatlantic.com+OR+site:washingtonpost.com+OR+site:nytimes.com+OR+site:chronicle.com+OR+site:wired.com
const siteQueryFilter = (sites) => {
  return sites.map(site => `site:${site}`).join('+OR+');
};

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
  const redis = createClient({
    url: 'redis://localhost:6379',
  });

  redis.on('error', (err) => console.error('Redis Client Error', err));
  await redis.connect();
  console.log('✅ Connected to Redis');

  // === B. DEFINE SWEEP FUNCTION ===
  const sweepRedditHomepage = async () => {
    const SEARCH_URL = `https://old.reddit.com/search?q=(${siteQueryFilter(targetSites)
      })&restrict_sr=off&sort=${sort
      }&t=month`;

    const browser = await puppeteer.launch({
      args: ['--incognito'],
      executablePath: '/usr/bin/google-chrome',
      headless: false,
      defaultViewport: null,
    });
    const page = await browser.newPage();

    // === B.1. LOGIN ===
    await page.goto('https://old.reddit.com/login', { waitUntil: 'networkidle2' });
    await page.waitForSelector('faceplate-text-input');

    const hosts = await page.$$('faceplate-text-input');
    const usernameHandle = await hosts[0].evaluateHandle(el => el.shadowRoot.querySelector('input'));
    const passwordHandle = await hosts[1].evaluateHandle(el => el.shadowRoot.querySelector('input'));

    const usernameInput = usernameHandle.asElement();
    const passwordInput = passwordHandle.asElement();
    await usernameInput.type(USERNAME, { delay: 30 });
    await passwordInput.type(PASSWORD, { delay: 30 });

    // small delay before clicking “Log In”
    await new Promise(res => setTimeout(res, 500));

    const submitButtonHost = await page.$$('faceplate-tracker');
    const submitButton = await submitButtonHost[2].evaluateHandle(el => el.firstElementChild);

    await Promise.all([
      submitButton.click(),
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);
    console.log('✅ Logged in to Reddit');

    // === B.2. NAVIGATE TO SEARCH ===
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle2' });
    console.log('Navigated to search results.');

    // Wait for search results to load. On old Reddit, each post is within a .search-result-link element.
    await page.waitForSelector('.search-result-link');

    // Extract post URLs on first page
    const postLinks = await page.$$eval('.search-result-link > a.thumbnail', anchors =>
      anchors.map(a => a.href).filter(href => href.includes('/r/'))
    );
    console.log(`Found ${postLinks.length} posts on the first search results page.`);

    // === B.3. PROCESS EACH POST ===
    for (const postUrl of postLinks) {
      try {
        console.log(`\n🔄 Checking thread: ${postUrl}`);

        // --- B.3.a. CHECK REDIS IF ALREADY PROCESSED ---
        const already = await redis.sIsMember('processedThreads', postUrl);
        if (already) {
          console.log('⏭️  Already processed (in Redis). Skipping.');
          continue;
        }
        // Record in Redis that this thread has been “seen” (so we don’t do it again)
        await redis.sAdd('processedThreads', postUrl);

        // --- B.3.b. OPEN THREAD PAGE ---
        const postPage = await browser.newPage();
        await postPage.setViewport({ width: 1280, height: 800 });
        await postPage.goto(postUrl, { waitUntil: 'networkidle2' });

        // Check if any existing comment (or post body) already has “unbloq.us”
        const html = await postPage.content();
        if (html.includes('unbloq.us')) {
          console.log('✅ Skipping because thread already contains unbloq.us');
          await postPage.close();
          continue;
        }

        // --- B.3.c. EXTRACT OUTBOUND LINK ---
        await postPage.waitForSelector('a.outbound', { timeout: 5000 });
        const outboundHref = await postPage.$eval('a.outbound', el => el.href);
        console.log(`→ Found outbound link: ${outboundHref}`);
        const linkWithoutQueryParams = outboundHref.split('?')[0];
        const unbloqUrl = `https://unbloq.us/${linkWithoutQueryParams}`;

        console.log(`→ Visiting archive URL: ${unbloqUrl}`);
        const archivePage = await browser.newPage();
        await archivePage.goto(unbloqUrl, { waitUntil: 'networkidle2' });
        await archivePage.close();

        console.log(`→ Preparing to post comment with: ${unbloqUrl}`);
        await postPage.waitForSelector('textarea[name="text"]', { timeout: 5000 });
        await postPage.click('textarea[name="text"]');

        const commentText = `${unbloqUrl}

tip: put "unbloq.us/" before any link to jump to an archive of it`;
        await postPage.type('textarea[name="text"]', commentText, { delay: 20 });

        // Submit the comment
        await Promise.all([
          postPage.click('form.usertext button[type="submit"]'),
          new Promise(res => setTimeout(res, 500)),
        ]);
        console.log('→ Comment submitted...');

        // Wait briefly to check for rate limits
        await new Promise(res => setTimeout(res, 1000));
        const htmlAfter = await postPage.content();
        const rateLimitMinutes = extractBreakMinutes(htmlAfter);
        const rateLimitSeconds = extractBreakSeconds(htmlAfter);
        if (rateLimitMinutes) {
          console.log(`⚠️ Rate limit hit: waiting ${rateLimitMinutes} minutes...`);
          await new Promise(res => setTimeout(res, rateLimitMinutes * 60 * 1000 + 500));
        } else if (rateLimitSeconds) {
          console.log(`⚠️ Rate limit hit: waiting ${rateLimitSeconds} seconds...`);
          await new Promise(res => setTimeout(res, rateLimitSeconds * 1000 + 500));
        }

        console.log('✅ Comment posted successfully!');

        // MARK THIS THREAD AS PROCESSED in Redis
        await redis.sAdd('processedThreads', postUrl);

        // Close this thread’s tab, then pause before next one
        await postPage.close();
        await new Promise(res => setTimeout(res, 30 * 1000));
      } catch (err) {
        console.warn(`⚠️  Skipped ${postUrl} due to error: ${err.message}`);
        // If a new page was opened, close it
        const pages = await browser.pages();
        if (pages.length > 1) {
          await pages[pages.length - 1].close();
        }
        continue;
      }
    }

    console.log('\nAll done with this sweep. Closing browser.');
    await browser.close();
  };

  // === C. RUN THE SWEEPER, THEN REPEAT IF “new” SORT ===
  await sweepRedditHomepage();

  if (sort === 'new') {
    while (true) {
      console.log('⏰ Waiting 5 minutes before next sweep...');
      await new Promise(res => setTimeout(res, 5 * 60 * 1000));
      await sweepRedditHomepage();
    }
  } else {
    // if sort === 'top', just exit
    await redis.disconnect();
    console.log('✅ Disconnected from Redis. Exiting.');
  }
})();
