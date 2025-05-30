const cheerio = require('cheerio');
const chromium = require('chrome-aws-lambda');
const puppeteer = chromium.puppeteer;

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
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--incognito']
  });
  const page = (await browser.pages())?.[0] || await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });
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

  const archiveLink = await getArchiveLink(url);
  if (archiveLink) {
    return {
      statusCode: 200,
      body: JSON.stringify({ url: archiveLink })
    }
  }

  return {
    statusCode: 500,
    body: { error: "Failed." }
  }
}
