import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ModelSelector } from "../app/components/model-selector";

jest.mock("../app/hooks/useModelInfo", () => ({
  useModelInfo: () => ({
    getModelInfo: () => ({ capabilities: ["image-input"] }),
  }),
}));
jest.mock("../app/components/button", () => ({
  IconButton: ({ onClick }: any) => <button onClick={onClick}>Close</button>,
}));
jest.mock("../app/icons/close.svg", () => () => null);

const models = [
  {
    name: "deploy",
    displayName: "OpenAI deployment",
    available: true,
    provider: { id: "openai", providerName: "OpenAI" },
    source: "custom" as const,
  },
  {
    name: "deploy",
    displayName: "Azure deployment",
    available: false,
    provider: { id: "azure", providerName: "Azure" },
    source: "server" as const,
  },
];
test("opens the selected provider, shows capability/source and prevents unavailable selection", () => {
  const onSelect = jest.fn();
  render(
    <ModelSelector
      models={models}
      selectedModel="deploy"
      selectedProvider="Azure"
      onSelect={onSelect}
      onClose={jest.fn()}
    />,
  );
  expect(screen.queryByText("OpenAI deployment")).toBeNull();
  expect(screen.getByText("Image input")).toBeTruthy();
  expect(screen.getByText("Server")).toBeTruthy();
  fireEvent.click(screen.getByText(/Azure deployment/));
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByText("OpenAI").closest('[role="button"]')!, {
    key: "Enter",
  });
  fireEvent.click(screen.getByText("OpenAI deployment"));
  expect(onSelect).toHaveBeenCalledWith("deploy", "OpenAI");
});
