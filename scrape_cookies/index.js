const http = require('http');
const url = require('url');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

function getArchiveLinkFromHtml(html, originalUrl) {
  const $ = cheerio.load(html);

  const hrefs = $('a')
    .map((_, el) => $(el).attr('href'))
    .get();

  const archiveLinkIndex = hrefs
    .findIndex((href) => href && href.includes(originalUrl)) - 1;

  const archiveLink = archiveLinkIndex > 0 && hrefs[archiveLinkIndex];
  return archiveLink;
}

async function getArchiveLink(url) {
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

  const archiveLink = getArchiveLinkFromHtml(html, url);

  await browser.close();

  return archiveLink ? archiveLink : null;
};

exports.handler = async (event) => {
  const queryParams = event.queryStringParameters || {};
  const url = queryParams.url;
  if (!url) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Not found.' })
    }
  }

  console.log(`Finding archive for URL: ${url}...`)
  const archiveLink = await getArchiveLink(url);
  if (archiveLink) {
    console.log('\t Found! ' + archiveLink);
    return {
      statusCode: 200,
      body: JSON.stringify({ url: archiveLink })
    }
  }

  console.log('\t Not found.')
  return {
    statusCode: 500,
    body: { error: "Failed." }
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  console.log(parsedUrl);
  if (parsedUrl.pathname !== '/archive') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const targetUrl = parsedUrl.query.url;

  if (!targetUrl.path) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing `url` query parameter.' }));
    return;
  }

  try {
    const archiveLink = await getArchiveLink(targetUrl);
    if (archiveLink) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: archiveLink }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Archive link not found.' }));
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
