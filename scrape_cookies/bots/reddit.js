const puppeteer = require('puppeteer');

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
]

// Example:
// site:theatlantic.com+OR+site:washingtonpost.com+OR+site:nytimes.com+OR+site:chronicle.com+OR+site:wired.com
const siteQueryFilter = (sites) => {
  return sites.map(site => `site:${site}`).join('+OR+')
}


const sweepRedditHomepage = async () => {
  const SEARCH_URL = `https://old.reddit.com/search?q=(${siteQueryFilter(targetSites)
    })&restrict_sr=off&sort=${sort
    }&t=month`;

  const browser = await puppeteer.launch({
    args: [
      '--incognito'
    ],
    executablePath: '/usr/bin/google-chrome',
    headless: false,
    defaultViewport: null
  });
  const page = await browser.newPage();

  await page.goto('https://old.reddit.com/login', { waitUntil: 'networkidle2' });

  await page.waitForSelector('faceplate-text-input');
  const hosts = await page.$$('faceplate-text-input');

  const usernameHandle = await hosts[0].evaluateHandle(el => el.shadowRoot.querySelector('input'));
  const passwordHandle = await hosts[1].evaluateHandle(el => el.shadowRoot.querySelector('input'));

  const usernameInput = usernameHandle.asElement();
  const passwordInput = passwordHandle.asElement();

  await usernameInput.type(USERNAME, { delay: 30 });
  await passwordInput.type(PASSWORD, { delay: 30 });

  await new Promise(res => { setTimeout(() => { res() }, 500) });

  const submitButtonHost = await page.$$('faceplate-tracker');
  const submitButton = await submitButtonHost[2].evaluateHandle(el => el.firstElementChild);

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
  const postLinks = await page.$$eval('.search-result-link > a.thumbnail', anchors =>
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

      const html = await postPage.content();
      if (html.includes('unbloq.us')) {
        console.log('✅ Skipping post because a comment already includes unbloq.us');
        await postPage.close();
        continue;
      }

      // Wait for the post's outbound link to load
      await postPage.waitForSelector('a.outbound', { timeout: 5000 });

      // Extract the href of the outbound link
      const outboundHref = await postPage.$eval('a.outbound', el => el.href);
      console.log(`→ Found outbound link: ${outboundHref}`);

      const linkWithoutQueryParams = outboundHref?.split('?')?.[0];

      // Construct the unbloq.us URL
      const unbloqUrl = `https://unbloq.us/${linkWithoutQueryParams}`;

      console.log(`→ Visiting ${unbloqUrl} to ensure archive is loaded`);
      const archivePage = await browser.newPage();
      await archivePage.goto(unbloqUrl, { waitUntil: 'networkidle2' });
      await archivePage.close();

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
        await new Promise((res) => { setTimeout(() => { res() }, 200) })
      ]);

      console.log('→ Comment posted successfully.');

      // Close this post tab before moving on
      await postPage.close();

      // Small delay between actions to avoid being rate-limited
      await new Promise((res) => { setTimeout(() => { res() }, 200) })

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

};

sweepRedditHomepage();

if (sort === 'new') {
  setInterval(sweepRedditHomepage,
    5 * 60 * 1_000 // every 2 minutes
  );
}
