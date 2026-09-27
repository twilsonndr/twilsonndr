// Turns the single-file build into a page body for Claude artifact hosting.
// The artifact host wraps content in its own <!doctype><html><head><body>, so we
// strip ours and keep <title>, <meta description>, font links, <style> and <script>.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';
const keep = [
  ...head.matchAll(/<title>[\s\S]*?<\/title>|<meta name="description"[^>]*>|<link rel="(?:preconnect|stylesheet)"[^>]*>|<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi),
].map((m) => m[0]);
// the title has to be in the first 8KB, so it goes first; scripts go last so the DOM exists
const title = keep.filter((k) => k.startsWith('<title') || k.startsWith('<meta') || k.startsWith('<link'));
const styles = keep.filter((k) => k.startsWith('<style'));
const scripts = keep.filter((k) => k.startsWith('<script'));
const out = [...title, ...styles, body.trim(), ...scripts].join('\n');
writeFileSync('dist/artifact.html', out);
console.log(`artifact.html: ${(out.length / 1024).toFixed(0)} KB`);
