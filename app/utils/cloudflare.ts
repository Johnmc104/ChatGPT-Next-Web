export function cloudflareAIGatewayUrl(fetchUrl: string) {
  // Clean up duplicate API path segments that may occur when BASE_URL already contains the full endpoint
  // e.g., .../v1/chat/completions/v1/chat/completions -> .../v1/chat/completions

  // Common API endpoint patterns that might be duplicated
  const endpointPatterns = [
    /(\/?v1\/chat\/completions)(\/?v1\/chat\/completions)$/,
    /(\/?v1\/messages)(\/?v1\/messages)$/,
    /(\/?chat\/completions)(\/?chat\/completions)$/,
    /(\/?v1\/completions)(\/?v1\/completions)$/,
    /(\/?v1\/embeddings)(\/?v1\/embeddings)$/,
    /(\/?v1\/images\/generations)(\/?v1\/images\/generations)$/,
  ];

  for (const pattern of endpointPatterns) {
    if (pattern.test(fetchUrl)) {
      return fetchUrl.replace(pattern, "$1");
    }
  }

  return fetchUrl;
}
