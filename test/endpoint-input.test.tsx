import {
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { EndpointInput } from "../app/components/endpoint-input";
import { ServiceProvider } from "../app/constant";
import { testEndpointConnection } from "../app/services/endpoint/test";

jest.mock("../app/components/button", () => ({
  IconButton: ({ text, onClick, disabled }: any) => (
    <button disabled={disabled} onClick={onClick}>
      {text}
    </button>
  ),
}));
jest.mock("../app/services/endpoint/test", () => ({
  testEndpointConnection: jest.fn(),
}));
const props = {
  value: "https://api.test",
  apiKey: "",
  provider: ServiceProvider.OpenAI,
  defaultValue: "/api/openai",
  placeholder: "",
  ariaLabel: "Endpoint",
  onChange: jest.fn(),
};
beforeEach(() => jest.clearAllMocks());

test("invalid drafts are not saved; reset restores the default URL", () => {
  render(<EndpointInput {...props} />);
  fireEvent.change(screen.getByLabelText("Endpoint"), {
    target: { value: "ftp://bad.test" },
  });
  fireEvent.blur(screen.getByLabelText("Endpoint"));
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(props.onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Reset endpoint"));
  expect(props.onChange).toHaveBeenCalledWith("/api/openai");
});

test("changing credentials discards an outstanding result", async () => {
  let resolve!: (result: any) => void;
  (testEndpointConnection as jest.Mock).mockImplementation(
    () => new Promise((done) => (resolve = done)),
  );
  const view = render(<EndpointInput {...props} />);
  fireEvent.click(screen.getByText("Test connection"));
  const signal = (testEndpointConnection as jest.Mock).mock.calls[0][2]
    .signal as AbortSignal;
  view.rerender(<EndpointInput {...props} apiKey="new-key" />);
  expect(signal.aborted).toBe(true);
  await act(async () =>
    resolve({ code: "connected", ok: true, status: 200, latencyMs: 1 }),
  );
  expect(screen.queryByRole("status")).toBeNull();
  await waitFor(() =>
    expect(screen.getByText("Test connection")).not.toBeDisabled(),
  );
});
