import { Link } from "wouter";
import { ArrowRight, Clapperboard } from "lucide-react";
export default function NotFound() {
  return (
    <div className="not-found">
      <Clapperboard size={40} />
      <h1>This page is out of the frame.</h1>
      <p>Head to the studio to keep creating.</p>
      <Link href="/" className="button primary">
        Back to the studio
        <ArrowRight size={15} />
      </Link>
    </div>
  );
}
