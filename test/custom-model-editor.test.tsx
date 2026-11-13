jest.mock("../app/icons/down.svg", () => () => null);
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { CustomModelEditor } from "../app/components/custom-model-editor";
import { ModelCapabilitiesEditor } from "../app/components/model-capabilities";
import { useAppConfig } from "../app/store/config";
import { modelCapabilityKey } from "../app/domain/model/overrides";
import Locale from "../app/locales";

jest.mock("../app/components/button", () => ({
  IconButton: ({ text, onClick }: any) => (
    <button onClick={onClick}>{text}</button>
  ),
}));
jest.mock("../app/utils/indexedDB-storage", () => ({
  indexedDBStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

test("structured editing preserves upstream IDs and rejects duplicates", () => {
  let saved = "";
  function Harness() {
    const [value, setValue] = useState("");
    return (
      <CustomModelEditor
        value={value}
        onChange={(v) => {
          saved = v;
          setValue(v);
        }}
      />
    );
  }
  render(<Harness />);
  const labels = Locale.Settings.CustomModelEditor;
  fireEvent.change(screen.getByLabelText(labels.ID), {
    target: { value: "deployment-a" },
  });
  fireEvent.change(screen.getByLabelText(labels.Name), {
    target: { value: "Work model" },
  });
  fireEvent.click(screen.getByText(Locale.UI.Create));
  expect(saved).toBe("+deployment-a@OpenAI=Work model");
  fireEvent.change(screen.getByLabelText(labels.ID), {
    target: { value: "deployment-a" },
  });
  fireEvent.click(screen.getByText(Locale.UI.Create));
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(saved).toBe("+deployment-a@OpenAI=Work model");
});

test("image capability and limits are saved per model/provider without changing the endpoint", () => {
  useAppConfig.setState({ modelCapabilityOverrides: {} });
  render(<ModelCapabilitiesEditor model="deployment" provider="Azure" />);
  const labels = Locale.Settings.ModelCapabilities;
  fireEvent.change(screen.getByLabelText(labels.imageInput), {
    target: { value: "true" },
  });
  fireEvent.change(screen.getByLabelText(labels.Limit), {
    target: { value: "7" },
  });
  fireEvent.blur(screen.getByLabelText(labels.Limit));
  expect(
    useAppConfig.getState().modelCapabilityOverrides[
      modelCapabilityKey("deployment", "Azure")
    ],
  ).toMatchObject({ imageInput: true, maxInputImages: 7 });
  fireEvent.change(screen.getByLabelText(labels.Limit), {
    target: { value: "99" },
  });
  fireEvent.blur(screen.getByLabelText(labels.Limit));
  expect(screen.getByRole("alert")).toHaveTextContent(labels.InvalidLimit);
  expect(
    useAppConfig.getState().modelCapabilityOverrides[
      modelCapabilityKey("deployment", "Azure")
    ].maxInputImages,
  ).toBe(7);
});
