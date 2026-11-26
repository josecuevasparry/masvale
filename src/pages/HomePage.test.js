import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HomePage from "./HomePage";
import CtaModal from "../components/CtaModal";
import {
  CATALOG,
  PAYMENT_URLS,
  PURCHASE_TYPES,
  purchaseTypeLabel,
  visibleCatalog,
} from "../data/catalogData";

// The catalogue is read from the API now; in tests it answers empty so the page
// keeps using the bundled fallback and no network is touched.
jest.mock("../services/publicApi", () => ({
  __esModule: true,
  default: {
    catalog: jest.fn().mockResolvedValue({ count: 0, catalog: [] }),
  },
  ApiError: class ApiError extends Error {},
}));

const SHOWN = visibleCatalog();
const CATEGORY_LABEL = {
  producto: "Producto",
  servicio: "Servicio",
  asesoria: "Asesoría",
  capacitacion: "Capacitación",
};

const normalize = (value) => value.replace(/\s+/g, " ").trim();

const renderedTexts = (container) =>
  Array.from(container.querySelectorAll("*")).map((node) =>
    normalize(node.textContent)
  );

// jsdom lays nothing out, so scrollHeight/clientHeight are always 0 and the
// "Ver más..." button would never appear. Fake a one-line clamp: the full text
// is 4x taller than the visible box.
const mockClampedText = (height = 40) => {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return this.tagName === "P" ? height * 4 : height;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return height;
    },
  });
};

afterEach(() => {
  delete HTMLElement.prototype.scrollHeight;
  delete HTMLElement.prototype.clientHeight;
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );

const cardFor = (title) =>
  screen
    .getAllByTestId("product-card")
    .find((card) => normalize(card.textContent).includes(normalize(title)));

// Clicking the card itself opens the video viewer.
const openCard = (item) => fireEvent.click(cardFor(item.title));

// "Ver más..." opens the options panel (copy + buttons, no media).
const openOptions = (item) => {
  const card = cardFor(item.title);
  fireEvent.click(within(card).getByRole("button", { name: "Ver más" }));
};

// Card media: the still of a clip, an image, a thumbnail tile, or the plain
// placeholder.
const MEDIA_SELECTOR =
  '[data-testid="product-video-still"], [data-testid="product-video"], [data-testid="product-image"], [data-testid="product-thumbnail"], [data-testid="media-placeholder"]';

const mediaNodes = (scope = document) => scope.querySelectorAll(MEDIA_SELECTOR);

const ofCategory = (category) => SHOWN.filter((item) => item.category === category);

test("the page opens directly on the catalogue", () => {
  const { container } = renderPage();

  // The hero and the marketing menus are gone; the catalogue is the page.
  const rendered = renderedTexts(container);
  [
    "Asesorías y Productos para la Optimización de Procesos",
    "Servicios Masvale",
    "Silogice",
    "Fotos",
    "Servicios de Consultoría",
    "Test Silogice",
    "Asesorías para la Efectividad",
    "Todos",
  ].forEach((text) => {
    expect(rendered).not.toContain(normalize(text));
  });
  expect(screen.queryByRole("group", { name: "Filtrar catálogo" })).toBeNull();

  // The heading block is in place (the tagline under it is copy, so not pinned).
  expect(
    screen.getByRole("heading", { name: "Optimización de Procesos con Soluciones Tecnológicas" })
  ).toBeTruthy();

  // Only the navbar logo remains, served locally.
  const images = screen.getAllByAltText("Masvale Consultores");
  expect(images.length).toBe(1);
  expect(images[0].getAttribute("src")).toMatch(/^\/logo.*\.png$/);

  // Header and catalogue share the Masvale blue; the catalogue comes right
  // after the header.
  const header = screen.getByRole("banner");
  expect(header.className).toContain("bg-[#264F9E]");
  const catalog = container.querySelector("#catalogo");
  expect(catalog.className).toContain("bg-[#264F9E]");
  expect(catalog.previousElementSibling.tagName).toBe("HEADER");

  // The cards cannot slide under the title bar: the header sticks above them,
  // the rail is a positioned, higher-stacked sibling of the heading, and the
  // heading keeps its own space.
  expect(header.className).toContain("sticky");
  expect(header.className).toContain("z-50");
  const track = screen.getByTestId("catalog-track");
  expect(track.className).toContain("z-10");
  expect(track.className).toContain("mt-6");
  // The padding that saves the first card's ring from the overflow lives on the
  // track itself; there is no shared background behind the cards.
  expect(track.className).toContain("px-1");
  expect(track.className).toContain("-mx-1");
  expect(track.className).not.toContain("bg-white");
  expect(catalog.className).not.toContain("items-center");
});

test("the catalogue lists every visible item and nothing hidden", () => {
  renderPage();

  const cards = screen.getAllByTestId("product-card");
  expect(cards).toHaveLength(SHOWN.length);

  const cardText = cards.map((card) => normalize(card.textContent));
  SHOWN.forEach((item) => {
    expect(cardText.some((text) => text.includes(normalize(item.title)))).toBe(true);
  });
  CATALOG.filter((item) => item.visible === false).forEach((item) => {
    expect(cardText.some((text) => text.includes(normalize(item.title)))).toBe(false);
  });

  // Mock media is in place until the real mp4/gif files arrive.
  const media = mediaNodes();
  expect(media.length).toBe(SHOWN.length);
  [...screen.queryAllByTestId("product-video"), ...screen.queryAllByTestId("product-image")].forEach(
    (node) => {
      expect(node.getAttribute("src").startsWith("/media/")).toBe(true);
    }
  );

  // A declared-but-missing file falls back to the thumbnail tile.
  const videos = screen.queryAllByTestId("product-video");
  if (videos.length > 0) {
    fireEvent.error(videos[0]);
    expect(screen.queryAllByTestId("product-thumbnail").length).toBeGreaterThan(0);
  }
});

test("a hidden catalogue item keeps its data but loses its card", () => {
  const hidden = { id: "oculto", category: "producto", title: "Oculto", visible: false };
  const withHidden = visibleCatalog([...CATALOG, hidden]);

  expect(withHidden).toHaveLength(visibleCatalog().length);
  expect(withHidden.map((item) => item.id)).not.toContain("oculto");
  // Omitting the field means visible.
  expect(visibleCatalog([{ id: "x", title: "X" }])).toHaveLength(1);
});

test("cards are narrow, portrait-shaped and give the copy room", () => {
  const { container } = renderPage();

  const track = screen.getByTestId("catalog-track");
  const rails = Array.from(track.children);
  expect(rails).toHaveLength(SHOWN.length);

  // No shared white panel behind the row: the cards keep the blue between them,
  // and only the track's padding gives air to the first card's ring.
  expect(track.className).not.toContain("bg-white");
  expect(track.className).toContain("gap-4");
  // Walk up to the catalogue section: none of its wrappers may be white either.
  const section = container.querySelector("#catalogo");
  let ancestor = track.parentElement;
  while (ancestor && ancestor !== section) {
    expect(ancestor.className).not.toContain("bg-white");
    ancestor = ancestor.parentElement;
  }

  rails.forEach((rail) => {
    // Narrow portrait columns. The height follows the content (media + copy):
    // forcing a fixed height was what squeezed the texts into each other.
    expect(rail.className).toContain("w-[56vw]");
    expect(rail.className).toContain("sm:w-[14rem]");
    expect(rail.className).not.toContain("h-full");

    const card = rail.querySelector('[data-testid="product-card"]');
    expect(card.className).not.toContain("h-full");

    // Each card is its own piece over the blue: its white border is a ring on
    // the card itself, not a shared white panel behind the row.
    expect(card.className).toContain("ring-white");
    expect(card.className).toContain("bg-white");
    expect(card.className).toContain("rounded-2xl");

    // The media is the card's first element: a flush portrait box, no padding
    // wrapper and no label on it. Its ratio is the clips' own (2:3, 720x1080), so
    // the still fills the box edge to edge instead of leaving side bars.
    const mediaBox = card.firstElementChild;
    expect(mediaBox.querySelector(MEDIA_SELECTOR)).not.toBeNull();
    expect(mediaBox.className).toContain("aspect-[2/3]");
    expect(mediaBox.className).toContain("overflow-hidden");
    expect(mediaBox.className).not.toContain("p-4");

    // And the still fills that box: same ratio, so `object-contain` covers it
    // edge to edge with nothing cropped.
    const still = mediaBox.querySelector(MEDIA_SELECTOR);
    expect(still.className).toContain("object-contain");
    expect(still.className).toContain("inset-0");

    // The copy has a guaranteed height and every one of its rows is `shrink-0`,
    // which is what keeps title, description and button from overlapping.
    const copy = mediaBox.nextElementSibling;
    expect(copy.className).toContain("min-h-[6.5rem]");
    Array.from(copy.children).forEach((child) => {
      expect(child.className).toContain("shrink-0");
    });

    // The price is a row in the copy, not a pill floating over the text.
    const price = copy.querySelector('[data-testid="card-price"]');
    if (price) expect(price.className).not.toContain("absolute");
  });

  // Nothing but the catalogue is rendered between header and cards.
  expect(container.querySelectorAll("section")).toHaveLength(1);
});

test("Ver más is a button, and the price does not float over the text", () => {
  renderPage();
  const card = screen.getAllByTestId("product-card")[0];

  const more = within(card).getByTestId("card-more");
  expect(more.tagName).toBe("BUTTON");
  expect(more.textContent).toContain("Ver más");

  // Clicking it opens the options panel instead of the video viewer.
  fireEvent.click(more);
  expect(screen.getByTestId("modal-actions")).toBeTruthy();
  expect(screen.queryByTestId("product-video")).toBeNull();
});

test("the card shows a still of the video, not a running one", () => {
  const { container } = renderPage();
  const card = container.querySelector('[data-testid="product-card"]');

  expect(card.innerHTML).not.toContain("animate-slow-zoom");

  const still = card.querySelector('[data-testid="product-video-still"]');
  expect(still).not.toBeNull();
  // No autoplay, no controls: the clip waits for the modal.
  expect(still.hasAttribute("autoplay")).toBe(false);
  expect(still.hasAttribute("controls")).toBe(false);
  expect(still.className).toContain("object-contain");

  // No image node in this card to worry about; other items may have images.
  const image = card.querySelector('[data-testid="product-image"]');
  if (image) expect(image.className).toContain("object-contain");
});

test("every card has a play button at the bottom that opens the viewer", () => {
  renderPage();

  const cards = screen.getAllByTestId("product-card");
  const buttons = screen.getAllByTestId("card-play");
  expect(buttons).toHaveLength(cards.length);

  const item = SHOWN[0];
  const play = within(cardFor(item.title)).getByTestId("card-play");
  expect(play.getAttribute("aria-label")).toBe(
    `Reproducir con sonido el video de ${item.title}`
  );
  // Pinned to the bottom of the media box, horizontally centred.
  expect(play.className).toContain("absolute bottom-3");
  expect(play.className).toContain("left-1/2");
  expect(play.className).toContain("-translate-x-1/2");

  fireEvent.click(play);
  const dialog = screen.getByRole("dialog");
  expect(dialog.getAttribute("aria-label")).toBe(`Video: ${item.title}`);
  const player = dialog.querySelector('[data-testid="product-video"]');
  expect(player).not.toBeNull();
  // Opened from the play button: audio is requested (attempted unmuted).
  expect(player.muted).toBe(false);
});

test("the card body still opens the viewer, muted until the visitor unmutes", () => {
  renderPage();
  const item = SHOWN[0];
  openCard(item);
  const player = screen.getByRole("dialog").querySelector('[data-testid="product-video"]');
  expect(player).not.toBeNull();
  expect(player.muted).toBe(true);
});

test("every card alternates the still with a banner naming the product", () => {
  renderPage();

  screen.getAllByTestId("product-card").forEach((card) => {
    const banner = within(card).getByTestId("card-banner");
    const title = card.querySelector("h3").textContent;

    // The animated class is what makes it slide in and out; the banner shows the
    // product name, which is the same name as the card's heading.
    expect(banner.className).toContain("card-banner");
    expect(banner.className).toContain("pointer-events-none");
    expect(banner.textContent).toContain("Producto");
    expect(banner.textContent).toContain(title);

    // It never gets in the way: the card and the play button keep receiving
    // clicks, and the play button stays above the banner.
    expect(banner.getAttribute("aria-hidden")).toBe("true");
    const play = within(card).getByTestId("card-play");
    expect(play.className).toContain("z-10");
    expect(banner.className).toContain("z-[5]");
  });
});

test("Ver más opens a modal with only text and buttons, no media", () => {
  mockClampedText();
  renderPage();

  const toggles = screen.getAllByRole("button", { name: /^Ver más$/ });
  expect(toggles.length).toBeGreaterThan(0);

  const card = toggles[0].closest('[data-testid="product-card"]');
  fireEvent.click(toggles[0]);

  // The button does not expand the card in place: it opens the detail modal.
  expect(screen.queryByRole("button", { name: "Ver menos" })).toBeNull();

  const dialog = screen.getByRole("dialog");

  // No media band at all in this variant.
  expect(dialog.querySelector('[data-testid="modal-media"]')).toBeNull();
  expect(mediaNodes(dialog)).toHaveLength(0);

  // Full screen sheet on phones, centred card from sm up.
  expect(dialog.className).toContain("h-full");
  expect(dialog.className).toContain("w-full");
  expect(dialog.className).toContain("sm:max-w-lg");
  expect(dialog.className).toContain("sm:max-h-[92vh]");

  // Centred in the viewport.
  const overlay = dialog.parentElement;
  expect(overlay.className).toContain("justify-center");
  expect(overlay.className).toContain("sm:items-center");

  // Big title, roomier copy.
  const heading = within(dialog).getByRole("heading", { level: 3 });
  expect(heading.className).toContain("text-2xl");
  const copy = dialog.querySelector("p");
  expect(copy.className).toContain("text-base");

  // Buttons live in a footer, outside the scrolling copy.
  expect(dialog.getAttribute("data-testid")).toBe("modal-actions");
  const cta = dialog.querySelector('[data-testid="modal-ctas"]');
  expect(cta.className).toContain("shrink-0");
  // Only the quotation request: the meeting option is gone.
  expect(screen.queryByRole("button", { name: "Agendar una reunión" })).toBeNull();
  expect(screen.getByRole("button", { name: "Solicitar cotización" })).toBeTruthy();

  // Full copy, none of the card clamp classes.
  const shown = SHOWN.find((item) => normalize(card.textContent).includes(item.title));
  expect(normalize(dialog.textContent)).toContain(normalize(shown.title));
  expect(dialog.querySelectorAll(".line-clamp-1")).toHaveLength(0);
});

test("clicking the card shows only the video and an X", () => {
  renderPage();
  openCard(SHOWN[0]);
  const dialog = screen.getByRole("dialog");

  // A video viewer, not the options panel. On phones the sheet is the viewport
  // (absolute) and the clip is centred inside it; from sm up it becomes the
  // centred portrait frame.
  expect(dialog.getAttribute("aria-label")).toBe(`Video: ${SHOWN[0].title}`);
  expect(dialog.className).toContain("absolute inset-0");
  expect(dialog.className).toContain("overflow-hidden");
  expect(dialog.className).toContain("sm:relative");
  expect(dialog.className).toContain("sm:w-[min(92vw,calc(92vh*3/4))]");
  expect(dialog.className).toContain("sm:h-[min(92vh,calc((100vw-2rem)*4/3))]");

  // The clip can never exceed its box: max sizing plus object-contain, inside a
  // centring wrapper. (object-cover scaled the box up and overflowed on phones.)
  const player = dialog.querySelector('[data-testid="product-video"]');
  expect(player).not.toBeNull();
  expect(player.className).toContain("max-h-full");
  expect(player.className).toContain("max-w-full");
  expect(player.className).toContain("object-contain");
  expect(player.className).not.toContain("object-cover");
  expect(player.parentElement.className).toContain("items-center");
  expect(player.parentElement.className).toContain("justify-center");
  expect(player.parentElement.className).toContain("overflow-hidden");
  expect(within(dialog).getByRole("button", { name: "Cerrar" })).toBeTruthy();
  expect(within(dialog).getAllByRole("button")).toHaveLength(1);
  expect(screen.queryByTestId("modal-ctas")).toBeNull();
  expect(screen.queryByTestId("modal-actions")).toBeNull();
  expect(screen.queryByRole("button", { name: "Agendar una reunión" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Solicitar cotización" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /pantalla completa/i })
  ).toBeNull();

  // The X closes it.
  fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("the video plays full screen, without a play badge or extra tap", () => {
  const video = SHOWN.find((item) => item.media?.type === "video");
  if (!video) return;

  renderPage();
  openCard(video);
  const dialog = screen.getByRole("dialog");

  // Playing straight away, with the native controls available (pause, seek,
  // volume). No thumbnail step inside the viewer: the play button lives on the
  // card, not here.
  const player = dialog.querySelector('[data-testid="product-video"]');
  expect(player).not.toBeNull();
  expect(player.getAttribute("src")).toBe(video.media.src);
  expect(player.hasAttribute("autoplay")).toBe(true);
  expect(player.hasAttribute("controls")).toBe(true);
  expect(player.getAttribute("controlslist")).toBe("nodownload");
  expect(player.className).toContain("max-h-full");
  expect(dialog.querySelector('[data-testid="product-thumbnail"]')).toBeNull();
  expect(within(dialog).queryByTestId("card-play")).toBeNull();
  expect(within(dialog).getAllByRole("button")).toHaveLength(1); // only the X
});

test("no card shows a 'Ver opciones' link any more", () => {
  renderPage();
  expect(screen.queryByText(/Ver opciones/i)).toBeNull();
  screen.getAllByTestId("product-card").forEach((card) => {
    expect(normalize(card.textContent)).not.toContain("Ver opciones");
  });
});

test("the options panel shows no category label, only the title", () => {
  renderPage();
  const item = SHOWN[0];
  openOptions(item);
  const dialog = screen.getByRole("dialog");

  expect(dialog.getAttribute("aria-label")).toBe(`Opciones para ${item.title}`);
  expect(normalize(dialog.textContent)).not.toContain("Producto");
  expect(normalize(dialog.textContent)).not.toContain("Asesoría");
  expect(normalize(dialog.textContent)).not.toContain("Capacitación");

  // Only the quotation request remains, and there is no media here.
  expect(screen.queryByRole("button", { name: "Agendar una reunión" })).toBeNull();
  expect(screen.getByRole("button", { name: "Solicitar cotización" })).toBeTruthy();
  expect(dialog.querySelector('[data-testid="modal-media"]')).toBeNull();

  // The old pay button and the response-time footer are gone.
  expect(screen.queryByRole("button", { name: /Pagar sesión/ })).toBeNull();
  expect(normalize(dialog.textContent)).not.toContain("Te respondemos");
  expect(normalize(dialog.textContent)).not.toContain("dentro de un día hábil");
});

test("priced categories follow PRICE_UF; unpriced ones show nothing", () => {
  renderPage();

  SHOWN.forEach((item) => {
    const badge = cardFor(item.title).querySelector('[data-testid="card-price"]');
    const priced = ["asesoria", "capacitacion"].includes(item.category);
    if (priced) {
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe(
        item.category === "asesoria" ? "1 UF" : "5 UF"
      );
    } else {
      expect(badge).toBeNull();
    }
  });

  // The modal repeats the price when there is one.
  const priced = SHOWN.find((item) =>
    ["asesoria", "capacitacion"].includes(item.category)
  );
  if (priced) {
    openCard(priced);
    const dialog = screen.getByRole("dialog");
    const modalPrice = dialog.querySelector('[data-testid="modal-price"]');
    expect(modalPrice.textContent).toContain(
      priced.category === "asesoria" ? "Valor: 1 UF" : "Valor: 5 UF"
    );
    expect(normalize(dialog.textContent)).toContain(
      "UF del día en que se realiza el pago"
    );
  }
});

test("the options panel shows no purchase-type label", () => {
  renderPage();

  SHOWN.forEach((item) => {
    openOptions(item);
    // The "Venta o arriendo" label is gone; only the price may still show.
    expect(screen.queryByTestId("modal-purchase-type")).toBeNull();
    expect(normalize(screen.getByRole("dialog").textContent)).not.toContain("Venta o arriendo");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  });
});

test("purchaseTypeLabel maps every supported value", () => {
  expect(purchaseTypeLabel({ purchaseType: "compra" })).toBe("Venta");
  expect(purchaseTypeLabel({ purchaseType: "arriendo" })).toBe("Arriendo");
  expect(purchaseTypeLabel({ purchaseType: "ambos" })).toBe("Venta o arriendo");
  expect(purchaseTypeLabel({})).toBeNull();
  expect(purchaseTypeLabel(undefined)).toBeNull();

  // The catalogue only declares supported values (or none at all).
  CATALOG.forEach((item) => {
    if (item.purchaseType === undefined) return;
    expect(PURCHASE_TYPES).toContain(item.purchaseType);
  });
});

test("the picture sits between the copy and the purchase buttons", () => {
  renderPage();
  const item = SHOWN[0];

  // The catalogue has no picture for this item yet, so nothing extra renders.
  openOptions(item);
  expect(screen.queryByTestId("modal-picture")).toBeNull();

  // On its own, an item with a picture renders it between the description and
  // the buttons.
  const { unmount } = render(
    <MemoryRouter>
      <CtaModal
        item={{ ...item, picture: "/media/app-condominio.jpg" }}
        onClose={() => {}}
        mode="text"
      />
    </MemoryRouter>
  );

  const picture = screen.getByTestId("modal-picture");
  expect(picture.previousElementSibling.tagName).toBe("P");
  expect(picture.previousElementSibling.textContent).toContain(item.description.slice(0, 20));
  // The CTAs live in the footer, after the scrolling body.
  expect(picture.nextElementSibling).toBeNull();

  const image = picture.querySelector("img");
  expect(image.getAttribute("src")).toBe("/media/app-condominio.jpg");
  expect(image.getAttribute("alt")).toBe(item.title);
  expect(image.className).toContain("object-contain");

  // A missing file removes the figure instead of leaving a broken image.
  fireEvent.error(image);
  expect(screen.queryByTestId("modal-picture")).toBeNull();
  unmount();
});

test("Flow payment buttons appear only for asesoría and capacitación", () => {
  renderPage();

  SHOWN.forEach((item) => {
    openCard(item);
    const dialog = screen.getByRole("dialog");
    const payLinks = screen.queryAllByRole("link", { name: /^Pagar/ });
    const expected = PAYMENT_URLS[item.category];

    if (expected) {
      expect(payLinks).toHaveLength(1);
      expect(payLinks[0].getAttribute("href")).toBe(expected);
    } else {
      expect(payLinks).toHaveLength(0);
      expect(normalize(dialog.textContent)).not.toContain("flow.cl");
    }
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  });

  // The two categories never share a token.
  expect(PAYMENT_URLS.asesoria).not.toBe(PAYMENT_URLS.capacitacion);
});

test("the options panel pins its buttons to the bottom", () => {
  renderPage();
  openOptions(SHOWN[0]);
  const dialog = screen.getByRole("dialog");

  const cta = screen.getByTestId("modal-ctas");
  expect(dialog.contains(cta)).toBe(true);
  // The footer is a sibling of the scrolling body, so the buttons do not move.
  const body = cta.previousElementSibling;
  expect(body.className).toContain("overflow-y-auto");
  expect(cta.className).toContain("shrink-0");
  expect(cta.className).toContain("border-t");
  // No media band in this variant.
  expect(dialog.querySelector('[data-testid="modal-media"]')).toBeNull();
});

test("the viewer closes with the X, the backdrop and Escape", () => {
  const { container } = renderPage();
  const openFirst = () => openCard(SHOWN[0]);

  // The X over the video.
  openFirst();
  fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(screen.queryByRole("dialog")).toBeNull();

  // The backdrop.
  openFirst();
  fireEvent.click(screen.getByRole("dialog").parentElement);
  expect(screen.queryByRole("dialog")).toBeNull();

  // Escape closes it in one step: there is no full-screen toggle any more.
  openFirst();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();

  expect(container.querySelector('[aria-modal="true"]')).toBeNull();
});

test("the options panel closes with its X and Escape", () => {
  const { container } = renderPage();
  const openFirst = () => openOptions(SHOWN[0]);

  openFirst();
  fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(screen.queryByRole("dialog")).toBeNull();

  openFirst();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();

  expect(container.querySelector('[aria-modal="true"]')).toBeNull();
});
