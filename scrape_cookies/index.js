const url = require('url');
const http = require('http');
const puppeteer = require('puppeteer');
const {
  connectRedis,
  cacheSet,
  cacheGet
} = require('./src/cache.js');
const parsing = require('./src/parsing.js');
const { getArchiveLinkFromHtml } = parsing;

let browser = null;

async function getArchiveLink(url) {
  if (!url) return null;
  const urlEncodedUrl = encodeURIComponent(url)

  await connectRedis();

  // If the result is cached, fetch it
  const cachedArchive = await cacheGet(`archive:${urlEncodedUrl}`);
  if (cachedArchive) {
    console.log(`cache hit -> ${url}: ${cachedArchive}`)
    return cachedArchive;
  } else {
    console.log(`cache miss for ${url}`);
  }

  // Otherwise, scrape it
  const context = await browser.createBrowserContext();
  const page = (await context.pages())?.[0] || await context.newPage();
  await page.goto(`https://archive.ph/${url}`, { waitUntil: 'domcontentloaded' });

  const html = await page.content();
  await context.close();

  const archiveLink = await getArchiveLinkFromHtml(html, url);

  if (archiveLink) {
    // cache the result
    console.log(`caching ${url}: ${archiveLink}`);
    await cacheSet(`archive:${urlEncodedUrl}`, archiveLink, 3600);
  }

  return archiveLink ? archiveLink : null;
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  console.log(`\n[${new Date().toISOString()}] -- `, req.url);
  if (parsedUrl.pathname !== '/archive') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const targetUrl = parsedUrl.query.url;
  console.log(`targetUrl: ${targetUrl}`);

  try {
    const archiveLink = await getArchiveLink(targetUrl);
    if (archiveLink) {
      console.log(` - archive: ${archiveLink}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: archiveLink }));
    } else {
      const submissionLink = `https://archive.ph/submit/?url=${encodeURIComponent(targetUrl)}`;
      console.log(` - generating archive: ${submissionLink}`);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: submissionLink }));
    }
  } catch (err) {
    console.error('Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error.' }));
  }
});


const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}/archive?url=<your-url>`);

  const viewport = {
    deviceScaleFactor: 1,
    hasTouch: false,
    height: 1080,
    isLandscape: true,
    isMobile: false,
    width: 1920,
  };
  browser = await puppeteer.launch({
    defaultViewport: viewport,
    headless: false,
  });

  // based on https://stackoverflow.com/questions/14031763/doing-a-cleanup-action-just-before-node-js-exits
  async function exitHandler(_, exitCode) {
    browser.close().then(() => { process.exit(exitCode) });
  }

  // do something when app is closing
  process.on('exit', exitHandler.bind(null, { cleanup: true }));
  // catches ctrl+c event
  process.on('SIGINT', exitHandler.bind(null, { exit: true }));
  // catches "kill pid" (for example: nodemon restart)
  process.on('SIGUSR1', exitHandler.bind(null, { exit: true }));
  process.on('SIGUSR2', exitHandler.bind(null, { exit: true }));
  // catches uncaught exceptions
  process.on('uncaughtException', exitHandler.bind(null, { exit: true }));
});

// Tests
// Promise.all([
//   getArchiveLink('https://www.theatlantic.com/technology/archive/2025/05/stop-using-x/682931/'),
//   getArchiveLink('https://www.chronicle.com/article/the-surveilled-student'),
//   getArchiveLink('https://www.bloomberg.com/news/articles/2025-04-28/delta-routes-new-airbus-plane-to-tokyo-to-sidestep-trump-tariffs'),
//   getArchiveLink('https://www.nytimes.com/2025/05/29/well/maha-report-citations.html'),
// ]).then(console.log)
