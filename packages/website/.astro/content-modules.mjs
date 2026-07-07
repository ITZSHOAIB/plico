export default new Map([
  [
    "src/content/docs/welcome.mdx",
    () =>
      import(
        "astro:content-layer-deferred-module?astro%3Acontent-layer-deferred-module=&fileName=src%2Fcontent%2Fdocs%2Fwelcome.mdx&astroContentModuleFlag=true"
      ),
  ],
]);
