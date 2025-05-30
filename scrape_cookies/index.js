const http = require('http');
const url = require('url');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const {
  connectRedis,
  cacheSet,
  cacheGet
} = require('./src/cache.js');

function getArchiveLinkFromHtml(html, originalUrl) {
  if (html.includes('No results')) {
    return null;
  }

  const $ = cheerio.load(html);

  const hrefs = $('a')
    .map((_, el) => $(el).attr('href'))
    .get();

  const archiveLinkIndex = hrefs
    .findIndex((href) => href && href.includes(originalUrl)) - 1;

  const archiveLink = archiveLinkIndex > 0 && hrefs[archiveLinkIndex];
  return archiveLink;
}

function buildArchiveSubmissionLink(url) {
  return `https://archive.ph/submit/?url=${encodeURIComponent(url)}`;
}

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
  const viewport = {
    deviceScaleFactor: 1,
    hasTouch: false,
    height: 1080,
    isLandscape: true,
    isMobile: false,
    width: 1920,
  };
  const browser = await puppeteer.launch({
    defaultViewport: viewport,
    headless: false,
  });
  const page = (await browser.pages())?.[0] || await browser.newPage();
  await page.goto(`https://archive.ph/${url}`, { waitUntil: 'networkidle2' });
  await new Promise((res) => { setTimeout(() => { res() }, 500) });

  const html = await page.content();
  await new Promise((res) => { setTimeout(() => { res() }, 500) });
  await new Promise((res) => { setTimeout(() => { res() }, 500) });
  await browser.close();

  const archiveLink = getArchiveLinkFromHtml(html, url);

  if (archiveLink) {
    // cache the result
    console.log(`caching ${url}: ${archiveLink}`);
    await cacheSet(`archive:${urlEncodedUrl}`, archiveLink, 3600);
  }

  return archiveLink ? archiveLink : null;
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  console.log(req.url);
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
      const submissionLink = buildArchiveSubmissionLink(targetUrl);
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
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/archive?url=<your-url>`);
});

// getArchiveLink('https://www.theatlantic.com/science/archive/2025/05/adam-riess-hubble-tension/682980/').then(console.log)
