import { useEffect, useRef, useState } from "react";
import ProductMedia from "./ProductMedia";
import QuoteForm from "./forms/QuoteForm";
import {
  CONTACT_EMAIL,
  PAYMENT_LABELS,
  PAYMENT_URLS,
  priceLabel,
} from "../data/catalogData";

const ACTION =
  "inline-flex w-full items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition-colors";

const SUCCESS =
  "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-2xl bg-[#264F9E]/5 p-4 text-sm text-slate-700";

const BACK =
  "mt-2 shrink-0 self-start text-xs font-semibold text-[#264F9E] underline decoration-dotted";

const CLOSE_BUTTON =
  "absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white";

/**
 * Item picture shown between the description and the purchase options.
 * Renders nothing when the file is missing, so an item without its image yet
 * looks exactly as before.
 */
function CatalogPicture({ item }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <figure data-testid="modal-picture" className="mt-4 overflow-hidden rounded-2xl">
      <img
        src={item.picture}
        alt={item.pictureAlt || item.title}
        loading="lazy"
        className="h-auto max-h-[45vh] w-full object-contain"
        onError={() => setFailed(true)}
      />
    </figure>
  );
}

/**
 * One modal with two jobs, depending on how it was opened:
 *
 *  - clicking a card opens the **video viewer**: the clip full screen with only
 *    an X to close — no title bar, no buttons, no extra controls;
 *  - "Ver más..." opens the **options** variant (`mode="text"`): the full copy,
 *    the price and the quotation request, with no media.
 */
export default function CtaModal({
  item,
  onClose,
  mode = "full",
  initialAction = null,
  audio = false,
}) {
  const [action, setAction] = useState(initialAction);
  const [done, setDone] = useState(null);
  const mediaRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (action || done) {
        setAction(null);
        setDone(null);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, action, done]);

  // Never leave a clip running once the modal goes away.
  useEffect(
    () => () => {
      mediaRef.current?.querySelector("video")?.pause?.();
    },
    []
  );

  if (!item) return null;

  const paymentUrl = PAYMENT_URLS[item.category];
  const paymentLabel = PAYMENT_LABELS[item.category];
  const price = priceLabel(item);

  const back = () => {
    setAction(null);
    setDone(null);
  };

  // ------------------------------------------------------------ video viewer
  // Phones: the sheet is the viewport (absolute, so it cannot depend on a parent
  // height) and the clip is centred inside it, always fitting. From sm up: a
  // centred portrait frame. `overflow-hidden` on both guarantees that a clip can
  // never spill outside the screen.
  if (mode !== "text") {
    return (
      <div
        className="fixed inset-0 z-[100] overflow-hidden bg-[#0d1730] sm:flex sm:items-center sm:justify-center sm:bg-[#0d1730]/95 sm:p-4"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Video: ${item.title}`}
          onClick={(event) => event.stopPropagation()}
          className="absolute inset-0 overflow-hidden sm:relative sm:inset-auto sm:h-[min(92vh,calc((100vw-2rem)*4/3))] sm:w-[min(92vw,calc(92vh*3/4))] sm:max-h-[92vh] sm:max-w-[92vw]"
        >
          <div
            ref={mediaRef}
            className="absolute inset-0 flex items-center justify-center overflow-hidden sm:relative sm:h-full sm:w-full"
          >
            <ProductMedia item={item} audio={audio} />
          </div>

          <button type="button" onClick={onClose} aria-label="Cerrar" className={CLOSE_BUTTON}>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------- options panel
  // A full screen sheet on phones, a centred card from sm up. The copy scrolls
  // and the buttons stay pinned at the bottom.
  return (
    <div
      className="fixed inset-0 z-[100] flex items-stretch justify-center bg-[#101c38]/70 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Opciones para ${item.title}`}
        data-testid="modal-actions"
        className="animate-fade-up flex max-h-full min-h-0 w-full flex-col overflow-hidden bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 pb-4 pt-5 sm:px-6">
          <div>
            {price && (
              <span
                data-testid="modal-price"
                className="text-xs font-semibold uppercase tracking-wide text-[#264F9E]/70 sm:text-[11px]"
              >
                Valor: {price}
              </span>
            )}
            <h3 className="mt-1 text-2xl font-semibold leading-tight text-[#264F9E] sm:text-xl md:text-2xl">
              {item.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 sm:px-6">
          {!action && !done && (
            <>
              <p className="whitespace-pre-line text-base leading-relaxed text-slate-600 sm:text-sm">
                {item.description}
              </p>

              {/* Picture between the copy and the purchase options. It simply
                  disappears while the file is missing. */}
              {item.picture && <CatalogPicture item={item} />}
            </>
          )}

          {action === "quote" && (
            <div data-testid="quote-form" className="flex min-h-0 flex-1 flex-col">
              <QuoteForm
                item={item}
                onDone={(result) => {
                  setDone(result);
                  setAction(null);
                }}
              />
              <button type="button" onClick={back} className={BACK}>
                Volver a las opciones
              </button>
            </div>
          )}

          {done?.kind === "quote" && (
            <div data-testid="request-success" className={SUCCESS}>
              <p className="text-base font-semibold text-[#264F9E]">¡Solicitud enviada!</p>
              <p>
                Recibimos tu solicitud sobre <strong>{done.record?.product || item?.title}</strong>.
              </p>
              <p>
                Te escribimos a <strong>{done.record?.email}</strong> confirmando que la
                recibimos, y nos pondremos en contacto contigo a la brevedad.
              </p>
              <p className="text-xs text-slate-500">
                Cualquier duda, respóndenos a {CONTACT_EMAIL}.
              </p>
              <button type="button" onClick={back} className={BACK}>
                Volver a las opciones
              </button>
            </div>
          )}
        </div>

        {/* Buttons pinned to the bottom of the sheet. */}
        {!action && !done && (
          <div
            data-testid="modal-ctas"
            className="flex shrink-0 flex-col gap-2 border-t border-slate-100 px-5 py-4 sm:gap-3 sm:px-6"
          >
            <button
              type="button"
              onClick={() => setAction("quote")}
              className={`${ACTION} bg-[#264F9E] text-white hover:bg-[#1d3f80]`}
            >
              Solicitar cotización
            </button>

            {paymentUrl && (
              <a
                href={paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${ACTION} border-2 border-[#264F9E] text-[#264F9E] hover:bg-[#264F9E] hover:text-white`}
              >
                {paymentLabel}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
