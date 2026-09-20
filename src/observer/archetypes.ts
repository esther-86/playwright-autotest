/**
 * Converts specific URLs into generalized Archetypes (Equivalence Partitions).
 * E.g.: /store/dnk-yellow-shoes/ -> /store/:slug
 */
export function getUrlArchetype(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const path = parsed.pathname;

    // Normalize IDs, slugs, and hashes
    const normalizedPath = path
      // Replace product/item slugs: /store/shoes-xyz -> /store/:slug
      .replace(/\/store\/[^/]+\/?$/i, '/store/:slug')
      // Replace product IDs or numeric endpoints: /items/123 -> /items/:id
      .replace(/\/\d+(\/|$)/g, '/:id$1')
      // Replace UUIDs: /records/e4b1a8-... -> /records/:uuid
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid');

    return `${parsed.hostname}${normalizedPath}`;
  } catch {
    return rawUrl;
  }
}
