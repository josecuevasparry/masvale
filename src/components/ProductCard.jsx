import ProductMedia from "./ProductMedia";
import { priceLabel } from "../data/catalogData";

const CARD =
  "group relative flex w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-[0_10px_30px_-15px_rgba(38,79,158,0.45)] ring-1 ring-white transition duration-300 focus-within:ring-2 focus-within:ring-white";

/**
 * One catalogue entry.
 *
 * The media keeps the clips' own ratio (2:3) and the copy below it has a
 * guaranteed height, so the title, the description, the price and the "Ver más"
 * button can never overlap: card width is what gives the text its room.
 *
 * Clicking the card opens the video viewer; "Ver más" opens the options panel
 * with the requests, so it is always available.
 */
export default function ProductCard({ item, onSelect }) {
  const price = priceLabel(item);

  return (
    <article
      data-testid="product-card"
      aria-label={`${item.title} - ver video`}
      onClick={() => onSelect(item)}
      className={`${CARD} cursor-pointer hover:shadow-[0_20px_40px_-18px_rgba(38,79,158,0.65)]`}
    >
      {/* Media: portrait box, flush with the card edges, with a play button at
          the bottom that opens the viewer. The box keeps the clips' own ratio
          (2:3, 720x1080), so the still fills it edge to edge instead of leaving
          dark bars on the sides. */}
      <div className="relative aspect-[2/3] w-full shrink-0 overflow-hidden bg-[#1b2a52]">
        <ProductMedia item={item} preview />

        {/* Animated banner: every few seconds it slides up over the still with the
            product name, then goes back down, alternating the thumbnail with the
            name. It sits below the play button and lets clicks through, so the
            card keeps working while the name is on screen. */}
        <div
          data-testid="card-banner"
          aria-hidden="true"
          className="card-banner pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-gradient-to-br from-[#2f5cb5] via-[#264F9E] to-[#26348C] px-3 text-center"
        >
          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
              Producto
            </span>
            <span className="mt-1 block text-base font-semibold leading-snug text-white">
              {item.title}
            </span>
          </div>
        </div>

        <button
          type="button"
          data-testid="card-play"
          aria-label={`Reproducir con sonido el video de ${item.title}`}
          onClick={(event) => {
            event.stopPropagation(); // the card itself opens the same viewer
            // `audio: true` marks this simple click as the gesture that
            // autorises playback with sound in the viewer.
            onSelect(item, "full", { audio: true });
          }}
          className="absolute bottom-3 left-1/2 z-10 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full bg-white/90 text-[#264F9E] shadow-lg ring-1 ring-black/10 transition hover:scale-105 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#264F9E] motion-reduce:transition-none motion-reduce:hover:scale-100"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="ml-0.5 h-5 w-5"
          >
            <path d="M8 5.14v13.72a1 1 0 0 0 1.5.87l11-6.86a1 1 0 0 0 0-1.74l-11-6.86A1 1 0 0 0 8 5.14Z" />
          </svg>
        </button>
      </div>

      {/* Copy: at least 6.5rem tall, never squeezed by the media. The price is a
          row in the flow (not floating over the text) and the title and the
          description never shrink, so nothing can overlap. */}
      <div className="flex min-h-[6.5rem] flex-1 flex-col gap-0.5 p-3 sm:px-4">
        {price && (
          <span
            data-testid="card-price"
            className="shrink-0 self-start rounded-full bg-[#264F9E]/10 px-2 py-0.5 text-[11px] font-semibold text-[#264F9E]"
          >
            {price}
          </span>
        )}

        <h3 className="line-clamp-1 shrink-0 text-sm font-semibold leading-snug text-[#264F9E] sm:text-[15px]">
          {item.title}
        </h3>

        <p className="line-clamp-1 shrink-0 text-xs leading-snug text-slate-600 sm:text-[13px]">
          {item.description}
        </p>

        <button
          type="button"
          data-testid="card-more"
          onClick={(event) => {
            event.stopPropagation(); // the card itself opens the video viewer
            onSelect(item, "text");
          }}
          className="mt-auto inline-flex shrink-0 items-center gap-1 self-start rounded-full border border-[#264F9E]/40 bg-[#264F9E]/5 px-3 py-1 text-[11px] font-semibold text-[#264F9E] transition-colors hover:border-[#264F9E] hover:bg-[#264F9E] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#264F9E] focus-visible:ring-offset-1"
        >
          Ver más
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </article>
  );
}
