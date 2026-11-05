import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { AuthPage } from "../app/components/auth";
import { useAccessStore } from "../app/store";
import Locale from "../app/locales";

const navigate = jest.fn();
jest.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
jest.mock("../app/store", () => ({
  useAccessStore: Object.assign(jest.fn(), { getState: jest.fn() }),
}));
jest.mock("../app/config/client", () => ({
  getClientConfig: () => ({ isApp: false }),
}));
jest.mock("../app/components/button", () => ({
  IconButton: ({ text, onClick, disabled }: any) => (
    <button disabled={disabled} onClick={onClick}>
      {text}
    </button>
  ),
}));
jest.mock("../app/components/ui-lib", () => ({
  PasswordInput: ({ aria, ...props }: any) => <input {...props} />,
}));
jest.mock("../app/icons/bot.svg", () => () => null);
jest.mock("@/app/icons/left.svg", () => () => null);

function setup(overrides = {}) {
  const state = {
    configStatus: "ready",
    needCode: true,
    hasServerApiKey: true,
    hideUserApiKey: false,
    accessCode: "demo",
    openaiApiKey: "",
    authorizationError: "",
    fetchConfig: jest.fn(async () => undefined),
    isValidOpenAI: () => false,
    verifyAuthorization: jest.fn(async () => true),
    update: jest.fn(),
    ...overrides,
  };
  (useAccessStore as unknown as jest.Mock).mockReturnValue(state);
  (useAccessStore.getState as jest.Mock).mockReturnValue(state);
  render(<AuthPage />);
  return state;
}
beforeEach(() => jest.clearAllMocks());

test("loading config disables the first-use form", () => {
  setup({ configStatus: "loading" });
  expect(screen.getByText(Locale.Auth.Confirm)).toBeDisabled();
  expect(screen.getByLabelText(Locale.Auth.Input)).toBeDisabled();
});

test("Enter and repeated confirmation share one verification request", async () => {
  let resolve!: (value: boolean) => void;
  const verify = jest.fn(
    () => new Promise<boolean>((done) => (resolve = done)),
  );
  setup({ verifyAuthorization: verify });
  fireEvent.keyDown(screen.getByLabelText(Locale.Auth.Input), { key: "Enter" });
  fireEvent.click(screen.getByText(Locale.Auth.Confirm));
  await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
  await act(async () => resolve(true));
  expect(navigate).toHaveBeenCalledTimes(1);
});

test("invalid codes keep the user on the authorization page", async () => {
  setup({
    authorizationError: "invalid-code",
    verifyAuthorization: jest.fn(async () => false),
  });
  fireEvent.click(screen.getByText(Locale.Auth.Confirm));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      Locale.Auth.Validation["invalid-code"],
    ),
  );
  expect(navigate).not.toHaveBeenCalled();
});

test("missing access code is rejected before verification", async () => {
  const state = setup({ accessCode: "" });
  fireEvent.click(screen.getByText(Locale.Auth.Confirm));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      Locale.Auth.MissingCode,
    ),
  );
  expect(state.verifyAuthorization).not.toHaveBeenCalled();
});
