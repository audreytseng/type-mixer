// Archived experiment: this is intentionally not loaded by Meet Your Type.
// Bookmarklet installation proved too browser-specific for the public launch.
(() => {
  const generic = new Set([
    "serif", "sans-serif", "monospace", "cursive", "fantasy",
    "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace"
  ]);
  const clean = value => value.trim().replace(/^['"]|['"]$/g, "");
  const fonts = [...new Set(
    [...document.querySelectorAll("*")]
      .flatMap(element => getComputedStyle(element).fontFamily.split(",").map(clean))
      .filter(font => font && !generic.has(font.toLowerCase()) && !/\bfallback$/i.test(font))
  )];

  prompt("Copy this result into Meet Your Type:", JSON.stringify({
    sourceUrl: location.href,
    title: document.title,
    fonts
  }, null, 2));
})();
