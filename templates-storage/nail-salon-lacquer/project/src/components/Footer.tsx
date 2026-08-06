import { Instagram, Facebook } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-taupe-900 py-8 text-taupe-200">
      <div className="container-prose flex flex-col items-center justify-center gap-5 border-t border-taupe-800 pt-6 text-center sm:flex-row sm:gap-8">
        <div className="flex gap-3">
          {[
            { Icon: Instagram, label: 'Instagram', href: '#' },
            { Icon: Facebook, label: 'Facebook', href: '#' },
          ].map(({ Icon, label, href }) => (
            <a
              key={label}
              href={href}
              aria-label={label}
              className="grid h-10 w-10 place-items-center rounded-full bg-taupe-800 text-taupe-300 transition-all hover:bg-rose-600 hover:text-white"
            >
              <Icon className="h-5 w-5" />
            </a>
          ))}
        </div>
        <h2 className="font-serif text-xl font-semibold text-taupe-400 sm:text-2xl">
          Powered by <span className="text-white">Certxa</span><span className="font-bold text-orange-500">.</span>
        </h2>
      </div>
    </footer>
  );
}