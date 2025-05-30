# Unbloq.us
This is a little wrapper on top of [archive.ph](https://archive.ph/) to make finding and 
creating archived pages as easy as adding a funny domain name before the article URL!

Just replace
```https://article.com/some-article-title/whatever-else-is-in-a-url```

with
```unbloq.us/https://article.com/some-article-title/whatever-else-is-in-a-url```

and you will be redirected to an archive of your article!

## Setup
Here's how you set up unbloq.us locally. First, **install npm packages**:
```bash
npm i
cd scrape_cookies && npm i
```

Then, you need to add a single environment variable to `.env.local`:
```
SCRAPE_URL=<whatever URL to hit for the scraper>
```

## Running the server
There are two parts to this server-- the main server that runs on nextjs, 
and the node http server that does the web scraping via puppeteer. The nextjs 
server is basically just a proxy to the scraper. I wanted free webhosting, easy deployment, 
and reasonable security (aka not opening my home network to the internet), so 
I host the nextjs part on vercel and self-host the scraper. I plug the scraper 
into nextjs with a 
[cloudflare tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/).

To run the scraper locally, simply run this:
```bash
cd scrape_cookies && node index.js
```
