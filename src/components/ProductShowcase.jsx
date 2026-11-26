import { useEffect, useRef, useState } from "react";
import { visibleCatalog } from "../data/catalogData";
import publicApi from "../services/publicApi";
import ProductCard from "./ProductCard";
import CtaModal from "./CtaModal";

// Bundled fallback: the catalogue also lives in the database now, but this stays
// so the page renders even before the API answers (or if it is down).
const FALLBACK = visibleCatalog();

const ARROW =
  "flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/10 text-white transition disabled:cursor-not-allowed disabled:opacity-30 enabled:hover:bg-white enabled:hover:text-[#264F9E]";

/**
 * Horizontal catalogue of products and asesorías. It opens the page directly on
 * the Masvale blue, and the whole block (heading + cards) is sized to fit one
 * screen height. Cards snap while scrolling and open the CTA modal.
 */
export default function ProductShowcase() {
  // `selected` holds the item plus which variant of the modal to open.
  const [selected, setSelected] = useState(null);
  const [cards, setCards] = useState(FALLBACK);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const trackRef = useRef(null);

  // Prefer the database copy; keep the bundled one when it is unavailable. An
  // empty or failed answer leaves the page working, so the site never blocks on
  // the catalogue.
  useEffect(() => {
    let active = true;
    const load = publicApi?.catalog?.();
    Promise.resolve(load)
      .then((data) => {
        const items = data?.catalog ?? data;
        if (active && Array.isArray(items) && items.length) setCards(items);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const closeModal = () => setSelected(null);
  // `options.audio` marks that the visitor pressed the card's play button, which
  // is what authorises the viewer to start with sound.
  const openModal = (item, mode = "full", options = {}) =>
    setSelected({ item, mode, audio: Boolean(options.audio) });

  const syncArrows = () => {
    const track = trackRef.current;
    if (!track) return;
    setAtStart(track.scrollLeft <= 4);
    setAtEnd(track.scrollLeft + track.clientWidth >= track.scrollWidth - 4);
  };

  useEffect(() => {
    syncArrows();
    window.addEventListener("resize", syncArrows);
    return () => window.removeEventListener("resize", syncArrows);
  }, []);

  const slide = (direction) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section
      id="catalogo"
      className="scroll-mt-28 bg-[#264F9E] pb-6 pt-6 text-white sm:pb-8 sm:pt-8"
    >
      <div className="mx-auto w-full max-w-[1200px] px-4 md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold text-white sm:text-2xl">
              Optimización de Procesos con Soluciones Tecnológicas
            </h2>
            
          </div>

          <div className="hidden gap-2 md:flex">
            <button
              type="button"
              aria-label="Anterior"
              disabled={atStart}
              onClick={() => slide(-1)}
              className={ARROW}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path
                  fillRule="evenodd"
                  d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Siguiente"
              disabled={atEnd}
              onClick={() => slide(1)}
              className={ARROW}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Each card is its own piece: no shared background. The track only gets
            horizontal padding (inside a negative margin, so the cards still start
            where the heading does) — that is air for the first card's ring and
            shadow, which the track's overflow would otherwise clip on the left. */}
        <div
          ref={trackRef}
          data-testid="catalog-track"
          onScroll={syncArrows}
          className="relative z-10 -mx-1 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pt-1 pb-3 sm:-mx-2 sm:px-2"
        >
          {cards.map((item) => (
            <div
              key={item.id}
              className="flex w-[56vw] shrink-0 snap-center sm:w-[14rem] lg:w-[15.5rem]"
            >
              <ProductCard item={item} onSelect={openModal} />
            </div>
          ))}
        </div>

        <p className="mt-3 text-center text-xs text-white/70 md:hidden">
          Desliza para ver más productos →
        </p>
      </div>

      {selected && (
        <CtaModal
          item={selected.item}
          mode={selected.mode}
          audio={selected.audio}
          onClose={closeModal}
        />
      )}
    </section>
  );
}
