import Link from "next/link";

export default function NotFound() {
  return <main className="route-error"><div className="empty-mark"><span /><span /><span /></div><span className="section-kicker">NOT ON THE INDEX</span><h1>That launch is private.</h1><p>Only launched startups appear in public discovery.</p><Link className="primary-button" href="/">Back to Discover</Link></main>;
}
