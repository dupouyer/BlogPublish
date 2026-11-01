declare module '@pagefind/default-ui' {
  export class PagefindUI {
    constructor(options: {
      element: string;
      bundlePath?: string;
      showImages?: boolean;
      resetStyles?: boolean;
      translations?: Record<string, string>;
    });
    destroy(): void;
  }
}
