/**
 * Puppeteer script to:
 * 1. Open Reddit’s login page and wait for the user to enter credentials manually.
 * 2. After the user submits the login form, continue:
 *    a. Perform a search filtering posts to only those containing links from specified domains (past month).
 *    b. Iterate through each post on the first page of results.
 *    c. Visit each post, extract the outbound article link, prepend "https://unbloq.us/", and leave a comment under the post with that URL and tip.
 *
 * USAGE:
 *   1. Install dependencies: `npm install puppeteer`
 *   2. Save this file (e.g. `reddit_unbloq_commenter.js`) and run: `node reddit_unbloq_commenter.js`
 *
 * NOTES:
 *   - The script launches in non‐headless mode so you can interactively log in.
 *   - Once you click “Log In” on Reddit’s page, the script detects navigation and continues automatically.
 */

const puppeteer = require('puppeteer');

(async () => {
  // === CONFIGURATION ===
  // The search URL on old.reddit.com filtering for our target domains, past month, sorted by new
  const SEARCH_URL = `https://old.reddit.com/search?q=(site:theatlantic.com+OR+site:washingtonpost.com+OR+site:nytimes.com+OR+site:chronicle.com+OR+site:wired.com)&restrict_sr=off&sort=new&t=month`;

  // === LAUNCH BROWSER IN VISIBLE MODE ===
  const browser = await puppeteer.launch({
    args: [
      '--incognito'
    ],
    executablePath: '/usr/bin/google-chrome',
    headless: false,              // must be false so you can manually log in
    defaultViewport: null
  });
  const page = await browser.newPage();

  // === 1. NAVIGATE TO REDDIT LOGIN PAGE AND WAIT FOR MANUAL LOGIN ===
  await page.goto('https://old.reddit.com/login', { waitUntil: 'networkidle2' });

  // Wait for faceplate-text-input elements to render
  await page.waitForSelector('faceplate-text-input');

  // Query the two <faceplate-text-input> elements and grab their inner <input> fields via shadowRoot
  const hosts = await page.$$('faceplate-text-input');
  const usernameHandle = await hosts[0].evaluateHandle(el => el.shadowRoot.querySelector('input'));
  const passwordHandle = await hosts[1].evaluateHandle(el => el.shadowRoot.querySelector('input'));

  const usernameInput = usernameHandle.asElement();
  const passwordInput = passwordHandle.asElement();

  const USERNAME = process.argv?.[2];
  const PASSWORD = process.argv?.[3];

  // Type credentials into those shadow-root inputs
  await usernameInput.type(USERNAME, { delay: 30 });
  await passwordInput.type(PASSWORD, { delay: 30 });

  await new Promise(res => { setTimeout(() => { res() }, 500) });

  const submitButtonHost = await page.$$('faceplate-tracker');
  const submitButton = await submitButtonHost[2].evaluateHandle(el => el.firstElementChild);

  // Submit login form and wait for navigation
  // The submit button is still a regular button on the page
  await Promise.all([
    submitButton.click(),
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
  ]);

  // === 2. NAVIGATE TO SEARCH RESULTS ===
  await page.goto(SEARCH_URL, { waitUntil: 'networkidle2' });
  console.log('Navigated to search results.');

  // Wait for search results to load. On old Reddit, each post is within a .search-result-link element.
  await page.waitForSelector('.search-result-link');

  // Extract the URLs of each post on the first page of results
  const postLinks = await page.$$eval('.search-result-link a.title', anchors =>
    anchors.map(a => a.href).filter(href => href.includes('/r/'))
  );
  console.log(`Found ${postLinks.length} posts on the first search results page.`);

  // === 3. ITERATE THROUGH EACH POST ===
  for (const postUrl of postLinks) {
    try {
      console.log(`\nProcessing post: ${postUrl}`);

      // Open the post in a new tab to avoid losing the search results page
      const postPage = await browser.newPage();
      await postPage.setViewport({ width: 1280, height: 800 });
      await postPage.goto(postUrl, { waitUntil: 'networkidle2' });

      // Wait for the post's outbound link to load
      await postPage.waitForSelector('a.outbound', { timeout: 5000 });

      // Extract the href of the outbound link
      const outboundHref = await postPage.$eval('a.outbound', el => el.href);
      console.log(`→ Found outbound link: ${outboundHref}`);

      // Construct the unbloq.us URL
      const unbloqUrl = `https://unbloq.us/${outboundHref}`;
      console.log(`→ Will post comment with: ${unbloqUrl}`);

      // === 4. LEAVE A COMMENT WITH THE UNBLOQ.US LINK ===
      // Wait for the comment textarea to appear
      await postPage.waitForSelector('textarea[name="text"]', { timeout: 5000 });

      // Click into the textarea to focus
      await postPage.click('textarea[name="text"]');

      // Type our comment
      const commentText = `${unbloqUrl}

tip: put "unbloq.us/" before any link to jump to an archive of it`;
      await postPage.type('textarea[name="text"]', commentText, { delay: 20 });

      // Submit the comment
      await Promise.all([
        postPage.click('form.usertext button[type="submit"]'),
        postPage.waitForNavigation({ waitUntil: 'networkidle2' }),
      ]);

      console.log('→ Comment posted successfully.');

      // Close this post tab before moving on
      await postPage.close();

      // Small delay between actions to avoid being rate-limited
      await page.waitForTimeout(3000);

    } catch (err) {
      console.warn(`⚠️  Skipped post ${postUrl} due to error: ${err.message}`);
      // Close the post tab if it was opened
      const pages = await browser.pages();
      if (pages.length > 1) {
        await pages[pages.length - 1].close();
      }
      continue;
    }
  }

  console.log('\nAll done. Closing browser.');
  await browser.close();

})();
