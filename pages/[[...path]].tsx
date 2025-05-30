import { GetServerSideProps } from 'next';
import * as cheerio from 'cheerio';

async function fetchArchive(targetUrl: string) {
  const response = await fetch(`https://archive.ph/${targetUrl}`, {
    "headers": {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "pragma": "no-cache",
      "priority": "u=0, i",
      "sec-ch-ua": "\"Chromium\";v=\"136\", \"Google Chrome\";v=\"136\", \"Not.A/Brand\";v=\"99\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Linux\"",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
      "cookie": "cf_clearance=f810d6bc666a77baba0558ec65a612fba41ba336-1748569611-PIILZZJJ",
      "Referer": "https://archive.ph/",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    },
    "body": null,
    "method": "GET"
  });
  return await response.text();
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const resolvedUrl = context?.resolvedUrl;

  if (!resolvedUrl || resolvedUrl.length === 0) {
    return {
      notFound: true,
    };
  }

  if (!resolvedUrl || resolvedUrl === '/') {
    return {
      redirect: {
        destination: 'https://aydendiel.dev/',
        permanent: false
      }
    }
  }

  // https:/example.com (only one `/` after protocol)
  let targetUrl: string | undefined = decodeURIComponent(context.resolvedUrl);
  targetUrl = targetUrl
    ?.split(':')
    ?.[1]
    ?.slice(1);

  if (targetUrl) {
    targetUrl = 'https://' + targetUrl;
  }

  try {

    const html = await fetchArchive(targetUrl);
    const $ = cheerio.load(html);

    const hrefs = $('a')
      .map((_, el) => $(el).attr('href'))
      .get();

    console.log({ hrefs })

    const archiveLinkIndex = hrefs
      .findIndex((href) => href && href.includes(targetUrl)) - 1;

    const archiveLink = archiveLinkIndex > 0 && hrefs[archiveLinkIndex];

    console.log({ archiveLink })

    if (archiveLink) {
      return {
        redirect: {
          destination: archiveLink,
          permanent: false,
        },
      };
    }

    return {
      props: {
        error: 'Archive link not found.',
      },
    };
  } catch (error) {
    return {
      props: {
        error: 'Error fetching archive.',
      },
    };
  }
};

export default function RedirectPage({ error }: { error?: string }) {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: 40 }}>
      <h1>Error</h1>
      <p>{error || 'Unknown error occurred.'}</p>
    </div>
  );
}
