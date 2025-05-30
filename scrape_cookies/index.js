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
    .findLastIndex((href) => href && href.includes(originalUrl)) - 1;

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
  await new Promise((res) => { setTimeout(() => { res() }, 200) });

  const html = await page.content();
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

// getArchiveLink('https://www.chronicle.com/article/the-surveilled-student').then(console.log)
// getArchiveLink('https://www.bloomberg.com/news/articles/2025-04-28/delta-routes-new-airbus-plane-to-tokyo-to-sidestep-trump-tariffs').then(console.log)
// getArchiveLink('https://www.nytimes.com/2025/05/29/well/maha-report-citations.html').then(console.log)
