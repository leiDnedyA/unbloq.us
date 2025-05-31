import { GetServerSideProps } from 'next';

const SCRAPE_URL = process.env.SCRAPE_URL;

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
        destination: 'https://github.com/leiDnedyA/unbloq.us',
        permanent: false
      }
    }
  }

  // https:/example.com (only one `/` after protocol)
  let targetUrl: string | undefined = decodeURIComponent(context.resolvedUrl)
    .slice(1); // removes '/' from the beginning

  function removePrefix(prefix: string, str: string) {
    return str.slice(prefix.length);
  }

  // Fix weird edge case where `targetUrl` starts with 'http:/' or 'https:/'
  // instead of https://
  if (targetUrl.startsWith('http:/') && !targetUrl.startsWith('http://')) {
    targetUrl = 'http://' + removePrefix('http:/', targetUrl);
  } else if (targetUrl.startsWith('https:/') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + removePrefix('https:/', targetUrl);
  }

  if (targetUrl && !targetUrl.startsWith('https://') && !targetUrl.startsWith('http://')) {
    targetUrl = 'https://' + targetUrl;
  }

  console.log({ targetUrl });

  const data = await (await fetch(`${SCRAPE_URL}/archive?url=${targetUrl}`)).json();

  console.log(data);

  if (data.url) {
    return {
      redirect: {
        destination: data.url,
        permanent: false
      }
    }
  }

  return {
    props: {
      error: 'Error fetching archive.',
    },
  };
};

export default function RedirectPage({ error }: { error?: string }) {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: 40 }}>
      <h1>Error</h1>
      <p>{error || 'Unknown error occurred.'}</p>
    </div>
  );
}
