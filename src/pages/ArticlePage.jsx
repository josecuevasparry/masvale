import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

/** Plain text split on blank lines becomes paragraphs. */
const paragraphs = (text) =>
  String(text ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

/**
 * One article, read from the database by its slug. The slug is the one in the
 * URL (e.g. /la-bondad-del-eufemismo), matching the old WordPress permalinks.
 */
export default function ArticlePage() {
  const { slug } = useParams();
  const [article, setArticle] = useState(null);
  const [state, setState] = useState({ loading: true, error: "" });

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: "" });
    publicApi
      .article(slug)
      .then((data) => {
        if (active) {
          setArticle(data.article ?? null);
          setState({ loading: false, error: "" });
        }
      })
      .catch((error) => {
        if (active) {
          setArticle(null);
          setState({ loading: false, error: error.message || "No pudimos cargar el artículo." });
        }
      });
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <article className="mx-auto w-full max-w-[760px] px-4 py-10 md:px-6">
        <Link
          to="/articulos"
          className="text-sm font-semibold text-[#264F9E] underline"
        >
          ← Volver al blog
        </Link>

        {state.loading && (
          <p className="mt-6 text-sm text-slate-500">Cargando artículo…</p>
        )}

        {state.error && (
          <div className="mt-6 rounded-2xl bg-red-50 px-4 py-4 text-sm text-red-700">
            {state.error}
          </div>
        )}

        {!state.loading && article && (
          <div className="mt-6">
            <header className="flex flex-col gap-4">
              <h1 className="text-2xl font-semibold leading-tight text-[#264F9E] sm:text-3xl">
                {article.title}
              </h1>
              {prettyDate(article.publishedAt) && (
                <p className="text-sm text-slate-500">{prettyDate(article.publishedAt)}</p>
              )}
            </header>

            {article.picture && (
              <img
                src={article.picture}
                alt={article.pictureAlt || article.title}
                className="mt-6 w-full rounded-2xl object-cover shadow-sm"
              />
            )}

            <div className="mt-8 flex flex-col gap-4 text-base leading-relaxed text-slate-700">
              {paragraphs(article.content).length > 0 ? (
                paragraphs(article.content).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))
              ) : (
                <p className="text-slate-500">
                  Este artículo aún no tiene contenido. Edítalo desde el panel de
                  administración.
                </p>
              )}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
