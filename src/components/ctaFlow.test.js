import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import publicApi from "../services/publicApi";
import CtaModal from "./CtaModal";
import { CATALOG } from "../data/catalogData";

jest.mock("../services/publicApi", () => ({
  __esModule: true,
  default: {
    createQuote: jest.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

const item = CATALOG[0];

// The request form lives in the options variant, which is what "Ver más..."
// opens: clicking the card itself shows the plain video viewer instead.
const renderModal = (props = {}) =>
  render(
    <MemoryRouter>
      <CtaModal item={item} onClose={() => {}} mode="text" {...props} />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

const fillContact = (form, { email = "ana@example.com" } = {}) => {
  fireEvent.change(within(form).getByLabelText("Organización o empresa"), {
    target: { value: "Constructora Andes" },
  });
  fireEvent.change(within(form).getByLabelText("Tu nombre"), { target: { value: "Ana" } });
  fireEvent.change(within(form).getByLabelText("Tu email"), { target: { value: email } });
};

test("the modal offers only the quotation request", () => {
  renderModal();
  expect(screen.getByRole("button", { name: "Solicitar cotización" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Agendar una reunión" })).toBeNull();
});

test("Solicitar cotización asks for the contact and the requirement", () => {
  renderModal();
  fireEvent.click(screen.getByRole("button", { name: "Solicitar cotización" }));

  const form = screen.getByTestId("quote-form");
  expect(within(form).getByLabelText("Organización o empresa")).toBeTruthy();
  expect(within(form).getByLabelText("Tu nombre")).toBeTruthy();
  expect(within(form).getByLabelText("Tu email")).toBeTruthy();
  expect(within(form).getByLabelText("¿Tienes algún requerimiento especial o consulta?")).toBeTruthy();

  // The removed fields are gone: no users, no intent checkboxes, no product box.
  expect(within(form).queryByLabelText("Cantidad de usuarios de la app")).toBeNull();
  expect(within(form).queryByText("Comprar")).toBeNull();
  expect(within(form).queryByLabelText("Producto o servicio a cotizar")).toBeNull();
});

test("a request without the requirement is stopped before the API call", async () => {
  renderModal();
  fireEvent.click(screen.getByRole("button", { name: "Solicitar cotización" }));
  const form = screen.getByTestId("quote-form");

  fillContact(form);
  fireEvent.click(within(form).getByRole("button", { name: "Solicitar cotización" }));

  await waitFor(() =>
    expect(within(form).getByText(/Cuéntanos qué necesitas cotizar/i)).toBeTruthy()
  );
  expect(publicApi.createQuote).not.toHaveBeenCalled();
});

test("submitting sends the contact, the requirement and the item it came from", async () => {
  publicApi.createQuote.mockResolvedValue({
    quote: {
      id: "q1",
      email: "ana@example.com",
      product: item.title,
      notes: "Necesito una cotización para 30 departamentos.",
    },
  });

  renderModal();
  fireEvent.click(screen.getByRole("button", { name: "Solicitar cotización" }));
  const form = screen.getByTestId("quote-form");

  fillContact(form);
  fireEvent.change(within(form).getByLabelText("¿Tienes algún requerimiento especial o consulta?"), {
    target: { value: "Necesito una cotización para 30 departamentos." },
  });
  fireEvent.click(within(form).getByRole("button", { name: "Solicitar cotización" }));

  await waitFor(() => expect(publicApi.createQuote).toHaveBeenCalledTimes(1));
  expect(publicApi.createQuote).toHaveBeenCalledWith(
    expect.objectContaining({
      organization: "Constructora Andes",
      name: "Ana",
      email: "ana@example.com",
      notes: "Necesito una cotización para 30 departamentos.",
      source: `web:${item.title}`,
    })
  );

  const success = await screen.findByTestId("request-success");
  expect(success.textContent).toContain("¡Solicitud enviada!");
  expect(success.textContent).toContain(item.title);
  expect(success.textContent).toContain("ana@example.com");
});

test("a 2xx with an empty body shows a message instead of crashing", async () => {
  publicApi.createQuote.mockResolvedValue(null);

  renderModal();
  fireEvent.click(screen.getByRole("button", { name: "Solicitar cotización" }));
  const form = screen.getByTestId("quote-form");
  fillContact(form);
  fireEvent.change(within(form).getByLabelText("¿Tienes algún requerimiento especial o consulta?"), {
    target: { value: "Hola" },
  });
  fireEvent.click(within(form).getByRole("button", { name: "Solicitar cotización" }));

  await waitFor(() => expect(screen.getByText(/no devolvió la solicitud/i)).toBeTruthy());
  expect(screen.queryByTestId("request-success")).toBeNull();
  expect(screen.getByTestId("quote-form")).toBeTruthy();
});

test("the API error is surfaced to the visitor", async () => {
  publicApi.createQuote.mockRejectedValue(new Error("Ese correo ya está registrado."));

  renderModal();
  fireEvent.click(screen.getByRole("button", { name: "Solicitar cotización" }));
  const form = screen.getByTestId("quote-form");
  fillContact(form);
  fireEvent.change(within(form).getByLabelText("¿Tienes algún requerimiento especial o consulta?"), {
    target: { value: "Hola" },
  });
  fireEvent.click(within(form).getByRole("button", { name: "Solicitar cotización" }));

  await waitFor(() => expect(screen.getByText("Ese correo ya está registrado.")).toBeTruthy());
});
