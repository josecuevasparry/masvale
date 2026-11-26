import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import publicApi from "../services/publicApi";

/**
 * Site header: the Masvale mark on the Masvale blue. The logo sits top-left and
 * the navigation top-right. The "Blog" menu lists the articles straight from the
 * database, so the links stay in sync with what the admin panel publishes.
 */
const Navbar = () => {
  const [articles, setArticles] = useState([]);

  useEffect(() => {
    let active = true;
    const load = publicApi?.articles?.();
    Promise.resolve(load)
      .then((data) => {
        const items = data?.articles ?? data;
        if (active && Array.isArray(items)) setArticles(items);
      })
      .catch(() => {
        // No API: the header still renders, only without the blog links.
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full bg-[#264F9E] border-b border-white/40 shadow-sm">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-4 py-2 md:px-6">
        <a
          href="/"
          className="flex shrink-0 items-center gap-3"
          aria-label="Masvale Consultores"
        >
          <img
            src="/logo-masvale.png"
            alt="Masvale Consultores"
            className="h-12 w-auto object-contain sm:h-14 lg:h-16"
          />
          <span className="text-sm font-semibold uppercase tracking-wide text-white sm:text-lg lg:text-xl">
            Masvale Consultores
          </span>
        </a>

        <nav className="flex items-center gap-2 text-sm font-medium text-white">
          <Link
            to="/"
            className="rounded-full px-3 py-2 transition hover:bg-white/10"
          >
            Inicio
          </Link>

          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full px-3 py-2 transition hover:bg-white/10 [&::-webkit-details-marker]:hidden">
              Blog
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.25 8.29a.75.75 0 0 1-.02-1.08Z"
                  clipRule="evenodd"
                />
              </svg>
            </summary>

            <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
              {articles.length === 0 ? (
                <p className="px-4 py-3 text-xs text-slate-500">
                  Cargando artículos…
                </p>
              ) : (
                <ul className="max-h-96 overflow-auto py-1">
                  {articles.map((article) => (
                    <li key={article.id}>
                      <Link
                        to={`/${article.id}`}
                        className="block px-4 py-2 text-sm text-slate-700 transition hover:bg-[#264F9E]/5 hover:text-[#264F9E]"
                      >
                        {article.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
