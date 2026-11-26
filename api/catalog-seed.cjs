/**
 * Seed for the `catalog` table: the products the site shipped with, in display
 * order. Seeded on startup only when the table is empty, so editing the table
 * later (in phpMyAdmin or from the API) is never overwritten.
 *
 * Keep this in sync with the JS fallback in src/data/catalogData.js until the
 * site has finished moving to the database.
 */
module.exports = [
  {
    id: "app-condominio",
    category: "producto",
    title: "App de Administración de Condominios",
    description: "Administración documental y financiera en tu bolsillo",
    purchaseType: "ambos",
    mediaType: "video",
    mediaSrc: "/media/admin-condo.mp4",
  },
  {
    id: "familia-y-educacion",
    category: "producto",
    title: "App Escuela y Familia",
    description:
      "Para familias, docentes y comunidades educativas integrales. Comunicaciones, fichas, reuniones, citaciones, registros de entrevistas, fichas médicas, documentos oficiales de la escuela, calendario de actividades, control de asistencia, notificaciones directas al teléfono. Tu tiempo queda para lo más importante",
    purchaseType: "ambos",
    mediaType: "video",
    mediaSrc: "/media/escuela-y-familia.mp4",
  },
];
