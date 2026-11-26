import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "./Navbar";
import publicApi from "../services/publicApi";

const prettyDate = (iso) =>
  iso
    ? new Intl.DateTimeFormat("es-CL", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "America/Santiago",
      }).format(new Date(iso))
    : null;

/**
 * Blog index: every published article, read from the database, with its picture,
 * summary and a link to the full page.
 */
export default function ArticlesPage() {
  const [articles, setArticles] = useState([]);
  const [state, setState] = useState({ loading: true, error: "" });

  useEffect(() => {
    let active = true;
    publicApi
      .articles()
      .then((data) => {
        if (active) {
          setArticles(data.articles ?? []);
          setState({ loading: false, error: "" });
        }
      })
      .catch((error) => {
        if (active) {
          setState({ loading: false, error: error.message || "No pudimos cargar los artículos." });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="mx-auto w-full max-w-[900px] px-4 py-10 md:px-6">
        <h1 className="text-2xl font-semibold text-[#264F9E] sm:text-3xl">Blog</h1>
        <p className="mt-1 text-sm text-slate-600">
          Artículos sobre lenguaje, bienestar y efectividad.
        </p>

        {state.error && (
          <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error}
          </p>
        )}

        {!state.loading && !state.error && articles.length === 0 && (
          <p className="mt-6 rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">
            Todavía no hay artículos publicados.
          </p>
        )}

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {articles.map((article) => (
            <Link
              key={article.id}
              to={`/${article.id}`}
              className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 transition hover:shadow-md"
            >
              {article.picture ? (
                <img
                  src={article.picture}
                  alt={article.pictureAlt || article.title}
                  className="h-44 w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-44 w-full items-center justify-center bg-[#264F9E]/5 text-[#264F9E]/40">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10">
                    <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm10 2-4 4-2-2-4 4h10v-6Z" />
                  </svg>
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h2 className="text-base font-semibold leading-snug text-slate-800 group-hover:text-[#264F9E]">
                  {article.title}
                </h2>
                {article.excerpt && (
                  <p className="text-sm text-slate-500">{article.excerpt}</p>
                )}
                {prettyDate(article.publishedAt) && (
                  <p className="mt-auto text-xs text-slate-400">{prettyDate(article.publishedAt)}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
