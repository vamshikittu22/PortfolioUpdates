// NEWS-02 dedup primitives — pure, no I/O, no Date.now(), no randomness.
//
// 06-RESEARCH-external.md §2 (live-verified): Google News RSS links are
// Google redirect URLs, never equal to the publisher's own article URL — so
// URL equality CANNOT be the primary cross-source dedup key. Google News
// titles also carry a trailing " - Publisher" suffix that the publisher's own
// title lacks. Because of this, the NORMALIZED-TITLE HASH is the PRIMARY
// cross-source dedup key; canonicalizeUrl is a secondary/supporting key for
// collapsing trivially-different URLs of the SAME feed's same article
// (fragments, tracking params, trailing slashes).
//
// Tradeoff documented here: normalizeTitle strips text after the LAST " - "
// separator for EVERY source, not just Google News, to keep hashing
// consistent across sources — a publisher title that legitimately contains
// " - " (e.g. "Company X - Q1 Results") will have that suffix stripped too.
// This is an accepted false-collapse risk in exchange for reliably matching
// the Google News / publisher pair, which is the dominant cross-source case.

import { createHash } from 'node:crypto';

const TRACKING_PARAM_PREFIXES = [/^utm_/i];
const TRACKING_PARAM_EXACT = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid']);

function isTrackingParam(key: string): boolean {
  if (TRACKING_PARAM_EXACT.has(key.toLowerCase())) return true;
  return TRACKING_PARAM_PREFIXES.some((re) => re.test(key));
}

export function normalizeTitle(title: string): string {
  let s = title.trim();

  const lastSeparatorIndex = s.lastIndexOf(' - ');
  if (lastSeparatorIndex !== -1) {
    s = s.slice(0, lastSeparatorIndex);
  }

  s = s.toLowerCase();
  // Apostrophes collapse the possessive/contraction (Steel's -> Steels) rather
  // than splitting it on a space, so "Steel's" and "Steels" normalize
  // identically; every other punctuation/symbol becomes a space.
  s = s.replace(/['’]/g, '');
  s = s.replace(/[^\p{L}\p{N}]+/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

export function computeTitleHash(title: string): string {
  return createHash('sha256').update(normalizeTitle(title)).digest('hex');
}

export function canonicalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);

    // Scheme + hostname are already lowercased by the URL parser itself.
    url.hash = '';

    const keysToDelete: string[] = [];
    url.searchParams.forEach((_value, key) => {
      if (isTrackingParam(key)) keysToDelete.push(key);
    });
    keysToDelete.forEach((key) => url.searchParams.delete(key));

    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }

    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}
