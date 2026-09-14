import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[600px] flex-col items-center justify-center px-5 text-center">
      <h1 className="font-display text-5xl text-primary">Page not found.</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        That page doesn't exist, or it may have moved.
      </p>
      <Link href="/" className="mt-7 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground">
        Back to Certxa
      </Link>
    </div>
  );
}
