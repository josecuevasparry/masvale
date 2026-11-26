import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import publicApi from "../services/publicApi";

const TOKEN_KEY = "masvale_admin_token";

const EMPTY_FORM = {
  title: "",
  excerpt: "",
  content: "",
  picture: "",
  pictureAlt: "",
  publishedAt: "",
  visible: true,
  sortOrder: 0,
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * Admin CRUD for the blog articles: list, create, edit, delete and upload a
 * picture per article. Reuses the same ADMIN_TOKEN as /agenda.
 */
export default function ArticlesAdminPage() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [draftToken, setDraftToken] = useState("");
  const [articles, setArticles] = useState([]);
  const [editing, setEditing] = useState(null); // null = list, otherwise slug being edited
  const [form, setForm] = useState(EMPTY_FORM);
  const [state, setState] = useState({ loading: false, saving: false, uploading: false, error: "", notice: "" });

  const load = useCallback(async () => {
    if (!token) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const data = await publicApi.admin.articles(token);
      setArticles(data.articles ?? []);
      setState((current) => ({ ...current, loading: false }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }));
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const signIn = (event) => {
    event.preventDefault();
    localStorage.setItem(TOKEN_KEY, draftToken.trim());
    setToken(draftToken.trim());
    setDraftToken("");
  };

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setArticles([]);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const openNew = () => {
    setEditing("");
    setForm(EMPTY_FORM);
    setState((current) => ({ ...current, error: "", notice: "" }));
  };

  const openEdit = (article) => {
    setEditing(article.id);
    setForm({
      title: article.title ?? "",
      excerpt: article.excerpt ?? "",
      content: article.content ?? "",
      picture: article.picture ?? "",
      pictureAlt: article.pictureAlt ?? "",
      publishedAt: (article.publishedAt ?? "").slice(0, 10),
      visible: article.visible !== false,
      sortOrder: article.sortOrder ?? 0,
    });
    setState((current) => ({ ...current, error: "", notice: "" }));
  };

  const set = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const uploadPicture = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setState((current) => ({ ...current, uploading: true, error: "" }));
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = await publicApi.admin.uploadImage(dataUrl, token);
      setForm((current) => ({ ...current, picture: result.url }));
      setState((current) => ({ ...current, uploading: false, notice: "Imagen subida." }));
    } catch (error) {
      setState((current) => ({ ...current, uploading: false, error: error.message }));
    }
  };

  const save = async (event) => {
    event.preventDefault();
    const payload = {
      title: form.title.trim(),
      excerpt: form.excerpt.trim(),
      content: form.content,
      picture: form.picture.trim() || undefined,
      pictureAlt: form.pictureAlt.trim() || undefined,
      publishedAt: form.publishedAt || undefined,
      visible: form.visible,
      sortOrder: Number(form.sortOrder) || 0,
    };
    setState((current) => ({ ...current, saving: true, error: "" }));
    try {
      if (editing) {
        await publicApi.admin.updateArticle(editing, payload, token);
      } else {
        await publicApi.admin.createArticle(payload, token);
      }
      setState((current) => ({ ...current, saving: false, notice: "Artículo guardado." }));
      setEditing(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error: error.message }));
    }
  };

  const remove = async (article) => {
    const sure = window.confirm(`¿Eliminar el artículo "${article.title}"? Esta acción no se puede deshacer.`);
    if (!sure) return;
    setState((current) => ({ ...current, error: "", notice: "" }));
    try {
      await publicApi.admin.deleteArticle(article.id, token);
      setState((current) => ({ ...current, notice: "Artículo eliminado." }));
      await load();
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-[#f5fafd] px-4 py-10">
        <form
          onSubmit={signIn}
          className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-white p-6 shadow-lg"
        >
          <h1 className="text-xl font-semibold text-[#264F9E]">Artículos Masvale</h1>
          <p className="text-sm text-slate-600">
            Ingresa la clave de administración para escribir y editar los artículos.
          </p>
          <input
            type="password"
            value={draftToken}
            onChange={(event) => setDraftToken(event.target.value)}
            placeholder="ADMIN_TOKEN"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#264F9E] focus:ring-2 focus:ring-[#264F9E]/20"
          />
          <button
            type="submit"
            className="rounded-full bg-[#264F9E] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1d3f80]"
          >
            Entrar
          </button>
          <Link to="/" className="text-center text-xs text-slate-500 underline">
            Volver al sitio
          </Link>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5fafd] px-4 py-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[#264F9E]">Artículos</h1>
            <p className="text-sm text-slate-600">
              Escribe, edita y publica los artículos del blog.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/articulos"
              className="rounded-full border border-[#264F9E] px-4 py-2 text-xs font-semibold text-[#264F9E] hover:bg-[#264F9E] hover:text-white"
            >
              Ver el blog
            </Link>
            <Link
              to="/agenda"
              className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Agenda
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Salir
            </button>
          </div>
        </header>

        {state.error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
        )}
        {state.notice && (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{state.notice}</p>
        )}

        {editing === null ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">
                {state.loading ? "Cargando…" : `${articles.length} artículo(s)`}
              </p>
              <button
                type="button"
                onClick={openNew}
                className="rounded-full bg-[#264F9E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1d3f80]"
              >
                + Nuevo artículo
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {articles.map((article) => (
                <article
                  key={article.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#264F9E]">{article.title}</p>
                    <p className="truncate text-xs text-slate-400">/articulos/{article.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase ${
                        article.visible !== false
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {article.visible !== false ? "publicado" : "oculto"}
                    </span>
                    <button
                      type="button"
                      onClick={() => openEdit(article)}
                      className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#264F9E] hover:text-[#264F9E]"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(article)}
                      className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}
              {!state.loading && articles.length === 0 && (
                <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
                  Todavía no hay artículos. Crea el primero.
                </p>
              )}
            </div>
          </>
        ) : (
          <form onSubmit={save} className="flex flex-col gap-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#264F9E]">
                {editing ? "Editar artículo" : "Nuevo artículo"}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
            </div>

            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-600">
              Título
              <input
                type="text"
                value={form.title}
                onChange={set("title")}
                required
                maxLength={200}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-[#264F9E] focus:ring-2 focus:ring-[#264F9E]/20"
              />
            </label>

            {editing && (
              <p className="rounded-xl bg-slate-50 px-4 py-2 text-xs text-slate-500">
                Enlace: <span className="font-mono">/articulos/{editing}</span> (el slug no se cambia)
              </p>
            )}

            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-600">
              Resumen (opcional)
              <textarea
                value={form.excerpt}
                onChange={set("excerpt")}
                maxLength={2000}
                rows={2}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-[#264F9E] focus:ring-2 focus:ring-[#264F9E]/20"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-600">
              Contenido
              <textarea
                value={form.content}
                onChange={set("content")}
                rows={12}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal leading-relaxed outline-none focus:border-[#264F9E] focus:ring-2 focus:ring-[#264F9E]/20"
              />
              <span className="text-xs font-normal text-slate-400">
                Separa los párrafos con una línea en blanco.
              </span>
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-600">
                Fecha de publicación
                <input
                  type="date"
                  value={form.publishedAt}
                  onChange={set("publishedAt")}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-[#264F9E] focus:ring-2 focus:ring-[#264F9E]/20"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-600">
                Orden en el menú
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={set("sortOrder")}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-[#264F9E] focus:ring-2 focus:ring-[#264F9E]/20"
                />
              </label>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-sm font-semibold text-slate-600">Imagen</span>
              {form.picture && (
                <img
                  src={form.picture}
                  alt="Vista previa"
                  className="h-40 w-full rounded-xl object-cover shadow-sm"
                />
              )}
              <div className="flex flex-wrap items-center gap-3">
                <label className="cursor-pointer rounded-full border border-[#264F9E] px-4 py-2 text-xs font-semibold text-[#264F9E] hover:bg-[#264F9E] hover:text-white">
                  {state.uploading ? "Subiendo…" : "Subir imagen"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={uploadPicture}
                    disabled={state.uploading}
                    className="hidden"
                  />
                </label>
                {form.picture && (
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, picture: "" }))}
                    className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Quitar imagen
                  </button>
                )}
              </div>
              <input
                type="text"
                value={form.picture}
                onChange={set("picture")}
                placeholder="… o pega la URL de una imagen"
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#264F9E] focus:ring-2 focus:ring-[#264F9E]/20"
              />
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-600">
                Texto alternativo (opcional)
                <input
                  type="text"
                  value={form.pictureAlt}
                  onChange={set("pictureAlt")}
                  maxLength={255}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-[#264F9E] focus:ring-2 focus:ring-[#264F9E]/20"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={form.visible}
                onChange={set("visible")}
                className="h-4 w-4 accent-[#264F9E]"
              />
              Visible en el sitio
            </label>

            <button
              type="submit"
              disabled={state.saving || !form.title.trim()}
              className="rounded-full bg-[#264F9E] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1d3f80] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state.saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear artículo"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
