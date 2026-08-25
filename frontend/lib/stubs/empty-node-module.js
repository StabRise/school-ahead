// Stub for Node built-ins ('fs', 'path') that @diffusionstudio/vits-web's
// emscripten-generated piper.js references behind a `typeof window ===
// "undefined"` style guard that never runs in Next.js's client/edge bundles.
// The real branch is dead code there, but bundlers still resolve the
// `require()` calls statically, so this stub keeps the build from failing.
module.exports = {};
