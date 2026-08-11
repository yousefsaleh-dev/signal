"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="route-error"><div className="error-icon">!</div><span className="section-kicker">SIGNAL INTERRUPTED</span><h1>That signal dropped.</h1><p>Something went wrong while loading this view. Try the connection again.</p><button className="primary-button" onClick={reset}>Try again</button></main>;
}
