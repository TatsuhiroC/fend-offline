#!/usr/bin/env node
// apksigner has used both "Signer #1" and "V2 Signer:" output labels.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyCertificates(text, expected = '', release = true) {
 const label = '(?:Signer #\\d+|V[1-4] Signer:)';
 const digests = [...text.matchAll(new RegExp('^' + label + '\\s+certificate SHA-256 digest: ([0-9a-f]{64})\\s*$', 'gmi'))].map(match => match[1].toLowerCase());
 if (!digests.length) throw new Error('No APK signer certificate digest found');
 const names = [...text.matchAll(new RegExp('^' + label + '\\s+certificate DN: (.*)$', 'gmi'))].map(match => match[1]);
 if (release && names.some(name => /(?:^|,\s*)CN="?Android Debug"?(?:,|$)/i.test(name))) throw new Error('Release APK is signed with a debug key');
 const normalised = expected.replace(/[:\s]/g, '').toLowerCase();
 if (normalised && !/^[0-9a-f]{64}$/.test(normalised)) throw new Error('Invalid expected certificate digest');
 if (normalised && digests.some(digest => digest !== normalised)) throw new Error('APK certificate does not match ANDROID_CERT_SHA256');
 return digests.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 try {
  const count = verifyCertificates(readFileSync(process.argv[2], 'utf8'), process.env.EXPECTED_CERT ?? '', process.env.SIGNING_MODE === 'release');
  console.log(`[android] verified ${count} signer certificate digest(s)`);
 } catch (error) { console.error(`::error::${error.message}`); process.exitCode = 1; }
}
