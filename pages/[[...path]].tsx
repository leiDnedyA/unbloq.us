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
