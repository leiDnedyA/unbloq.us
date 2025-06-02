const cheerio = require('cheerio');

async function getArchiveLinkFromHtml(html, originalUrl) {
  if (html.includes('No results') || !originalUrl) {
    return null;
  }

  const $ = cheerio.load(html);

  let archiveLink;

  if (!archiveLink) {
    const anchorsWithSingleImg = $('a').filter(function() {
      const children = $(this).children();
      for (let i = 0; i < children.length; i++) {
        if (children.get(i)?.tagName === 'img') {
          return true;
        }
      }
      return false;
    });
    const hrefs = anchorsWithSingleImg
      .map((_, el) => $(el).attr('href'))
      .get();

    archiveLink = hrefs?.[0];
  }

  if (!archiveLink) {
    // if the page title doesn't exist or can't be found, fallback like this
    const hrefs = $('a')
      .map((_, el) => $(el).attr('href'))
      .get();

    const archiveLinkIndex = hrefs
      .findLastIndex((href) => href && href.includes(originalUrl)) - 1;

    archiveLink = archiveLinkIndex > 0 && hrefs[archiveLinkIndex];
  }

  return archiveLink;
}

module.exports = {
  getArchiveLinkFromHtml
}
