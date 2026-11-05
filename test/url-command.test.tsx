import React from "react";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useCommand } from "../app/command";

jest.mock("../app/locales", () => ({ Chat: { Commands: {} } }));

test("consumes adjacent URL commands once and removes them from the current URL", async () => {
  const code = jest.fn();
  const settings = jest.fn();
  function Consumer() {
    useCommand({ code, settings });
    const location = useLocation();
    return <output data-testid="query">{location.search}</output>;
  }
  const view = render(
    <React.StrictMode>
      <MemoryRouter
        initialEntries={[
          "/?code=sample&settings=%7B%22version%22%3A1%7D&keep=1",
        ]}
      >
        <Consumer />
      </MemoryRouter>
    </React.StrictMode>,
  );
  await waitFor(() =>
    expect(view.getByTestId("query").textContent).toBe("?keep=1"),
  );
  expect(code).toHaveBeenCalledTimes(1);
  expect(settings).toHaveBeenCalledTimes(1);
  expect(settings).toHaveBeenCalledWith('{"version":1}');
});
