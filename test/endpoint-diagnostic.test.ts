import { buildEndpointDiagnostic } from "../app/domain/endpoint/diagnostic";
import { ServiceProvider } from "../app/constant";

const config = {
  url: "https://gateway.test/v1",
  apiKey: "sample",
  accessCode: "code",
};

test.each([
  "https://gateway.test",
  "https://gateway.test/v1",
  "https://gateway.test/v1/models",
  "https://gateway.test/v1/chat/completions",
])("OpenAI diagnostic avoids duplicate paths: %s", (url) => {
  expect(buildEndpointDiagnostic({ ...config, url })).toMatchObject({
    url: "/api/proxy/v1/models",
    headers: {
      "X-Base-URL": "https://gateway.test",
      "X-User-Api-Key": "sample",
    },
  });
});

test("application proxy paths remain relative", () => {
  expect(buildEndpointDiagnostic({ ...config, url: "/api/openai" })?.url).toBe(
    "/api/openai/v1/models",
  );
});

test("Azure strips deployment paths and sends api-key through the proxy", () => {
  const request = buildEndpointDiagnostic({
    ...config,
    url: "https://azure.test/openai/deployments/chat",
    provider: ServiceProvider.Azure,
    apiVersion: "2024-10-21",
  });
  expect(request?.url).toBe(
    "/api/proxy/openai/models?api-version=2024-10-21",
  );
  expect(request?.headers).toMatchObject({
    "X-Base-URL": "https://azure.test",
    "api-key": "sample",
  });
});

test.each([
  [
    ServiceProvider.Stability,
    "https://stability.test/v2beta/stable-image/generate",
    "/api/proxy/v1/user/account",
  ],
  [ServiceProvider.RAGFlow, "https://rag.test/v1", "/api/proxy/v1/models"],
])("%s checks a read-only provider endpoint", (provider, url, expected) => {
  expect(buildEndpointDiagnostic({ ...config, provider, url })?.url).toBe(
    expected,
  );
});

test("sends the access code in its own header next to the user key", () => {
  const request = buildEndpointDiagnostic(config);
  expect(request?.headers).toMatchObject({
    "X-Access-Code": "code",
    "X-User-Api-Key": "sample",
  });
});
