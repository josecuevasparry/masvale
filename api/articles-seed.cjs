/**
 * Seed for the `articles` table: the blog posts the site's menu links to, in
 * menu order. Seeded on startup only when the table is empty, so edits made
 * from the admin CRUD (or phpMyAdmin) are never overwritten.
 *
 * The `id` is the slug that appears in the URL, matching the old WordPress
 * links (https://masvale.cl/<slug>/). Content, pictures and excerpts are left
 * empty on purpose: fill them from the admin panel at /admin/articulos.
 */
module.exports = [
  {
    id: "metodo-silogice-el-lenguaje-es-la-formula-para-lograr-bienestar-personal-y-laboral",
    title: "Método Silogice: El lenguaje es la fórmula para lograr bienestar personal y laboral",
    excerpt: "",
    content: "",
    visible: true,
    sortOrder: 1,
  },
  {
    id: "lenguaje-integrador-1-lo-que-digo-sobre-mi-mismo",
    title: "Lenguaje Integrador (1): Lo que digo sobre mí mismo.",
    excerpt: "",
    content: "",
    visible: true,
    sortOrder: 2,
  },
  {
    id: "la-bondad-del-eufemismo",
    title: "La bondad del Eufemismo.",
    excerpt: "",
    content: "",
    visible: true,
    sortOrder: 3,
  },
  {
    id: "lenguaje-efectividad-educacion-silogice",
    title: "Silogice: El lenguaje y la efectividad en la Educación",
    excerpt: "",
    content: "",
    visible: true,
    sortOrder: 4,
  },
  {
    id: "silogice-epp-los-3-elementos-de-proteccion-psicosocial",
    title: "SILOGICE EPP: los 3 Elementos de Protección Psicosocial",
    excerpt: "",
    content: "",
    visible: true,
    sortOrder: 5,
  },
  {
    id: "tres-anuncios-el-bueno-el-mejor-y-el-optimo",
    title: "Tres anuncios: El bueno, el mejor y el óptimo.",
    excerpt: "",
    content: "",
    visible: true,
    sortOrder: 6,
  },
  {
    id: "silogice-tiene-exitosa-acogida-durante-segundo-workshop-de-la-usach",
    title: "Silogice tiene exitosa acogida durante el segundo Workshop de la USACH",
    excerpt: "",
    content: "",
    visible: true,
    sortOrder: 7,
  },
];
