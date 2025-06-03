import { useEffect, useRef, useState } from "react";

export default function TwitterVideo() {
  const [loaded, setLoaded] = useState(false);
  const anchorRef = useRef(null);

  useEffect(() => {
    const anchorEl = anchorRef.current;
    if (!anchorEl) return;

    // Create a MutationObserver to watch for child additions
    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        // If a child has been added to the anchor, consider it "loaded"
        if (mutation.type === "childList" && (anchorEl as HTMLElement)?.firstChild) {
          observer.disconnect();
          setLoaded(true);
          break;
        }
      }
    });

    // Start observing for childList changes on the anchor element
    observer.observe(anchorEl, { childList: true });

    // Cleanup in case the component unmounts before it's loaded
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <blockquote
      className="twitter-tweet"
      data-media-max-width="560"
      style={{ visibility: loaded ? undefined : 'hidden', height: '560px' }}
    >
      {/*

          <p lang="en" dir="ltr">
            Just shipped{" "}
            <a href="https://t.co/RhpIA5oghn">https://t.co/RhpIA5oghn</a>,{" "}
            a site that automatically redirects you to an archive of any
            webpage! Just add &#39;{" "}
            <a href="https://t.co/iGnvuRpm2r">https://t.co/iGnvuRpm2r</a>&#39;{" "}
            before the URL (e.g{" "}
            <a href="https://t.co/VWQtuP1YIr">https://t.co/VWQtuP1YIr</a>) to
            see{" "}
            <a href="https://t.co/Y7dzoICrYH">https://t.co/Y7dzoICrYH</a>. Would
            love some feedback!{" "}
            <a href="https://t.co/JPaluVwzui">pic.twitter.com/JPaluVwzui</a>
          </p>
          &mdash; Ayden D (@aydendiel){" "}
          <a href="https://twitter.com/aydendiel/status/1929320633445372306?ref_src=twsrc%5Etfw">
            June 1, 2025
          </a>
          */}

      <a ref={anchorRef} href="https://twitter.com/aydendiel/status/1929320633445372306?ref_src=twsrc%5Etfw">
      </a>
    </blockquote>
  )
}
