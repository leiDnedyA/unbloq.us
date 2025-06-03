import TwitterVideo from '@/components/TwitterVideo';
import { GetServerSideProps } from 'next';
import { FormEventHandler, useEffect, useRef, useState } from 'react';

const SCRAPE_URL = process.env.SCRAPE_URL;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const resolvedUrl = context?.resolvedUrl;

  if (!resolvedUrl || resolvedUrl.length === 0) {
    return {
      notFound: true,
    };
  }

  if (!resolvedUrl || resolvedUrl === '/') {
    return { props: {} };
  }

  // If it's just the home route with query params, don't redirect
  if (resolvedUrl.startsWith('?') || resolvedUrl.startsWith('/?')) {
    return { props: {} }
  }

  if (resolvedUrl.includes('error.com')) {
    return {
      props: {
        error: 'Error fetching archive.',
        targetUrl: 'https://error.com/'
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

  const data = await (await fetch(`${SCRAPE_URL}/archive?url=${targetUrl}`)).json();

  console.log({ ...data, targetUrl });

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
      targetUrl
    },
  };
};

const GotoArchiveForm = () => {
  const [value, setValue] = useState<string>('');
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current)
      (inputRef?.current as HTMLInputElement).focus();
  }, []);

  const handleSubmit: FormEventHandler = (e) => {
    e.preventDefault();
    window.location.assign(`${window.location.origin}/${value}`);
    setSubmitted(true);
  };

  const handleInputChange: FormEventHandler = (e) => {
    e.preventDefault();
    const newValue = (e.target as HTMLInputElement).value as string;
    setValue(newValue);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="wrapper">
        <label className="label">{'https://unbloq.us/'}</label>
        <input
          ref={inputRef}
          onInput={handleInputChange}
          value={value}
          type="text"
          placeholder="example.com"
          className="input" />
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        width: '100%'
      }}>
        <input
          disabled={!value || submitted}
          className="submit"
          type="submit"
          value="Go to archive"
        />
      </div>
      {submitted &&
        <p style={{ opacity: .6 }}>
          Fetching the archive link for {value}. This may take a few seconds.
        </p>}
    </form>
  );
};
export default function HomePage({ error, targetUrl }: { error?: string, targetUrl?: string | undefined }) {
  const [windowRef, setWindowRef] = useState<Window | null>(null);
  useEffect(() => {
    setWindowRef(window);
  }, []);
  if (error) {
    return (
      <div>
        <h1>Error</h1>
        <p>{error || 'Unknown error occurred.'}</p>
        {targetUrl && <p>
          <a href={`${windowRef?.location.origin}/${targetUrl}`}>Click here</a> to try again. If the error persists, please open a {' '}
          <a href={
            `${process.env.GITHUB_URL}/issues/new?title=${encodeURIComponent(
              `Unable to create archive for ${targetUrl}`)}`
          }>GitHub issue</a> or {' '}
          <a href="mailto:aydendiel@gmail.com">shoot me an email</a>.
        </p>}
      </div>
    );
  }
  return <div style={{ fontFamily: 'sans-serif' }}>
    <h1>unbloq.us</h1>

    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <TwitterVideo />
    </div>

    <p>
      A tiny wrapper around <a href="https://archive.today/">https://archive.today/</a> {' '}
      to automatically jump to or create an archive of any webpage!
    </p>
    <GotoArchiveForm />
    <script async src="https://platform.twitter.com/widgets.js" charSet="utf-8"></script>
    <p>Check it out <a href={process.env.GITHUB_URL}>on GitHub</a>!</p>
  </div>
}
