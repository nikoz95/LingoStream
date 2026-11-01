/// <reference types="vite/client" />

// Allow importing Vite URL suffixes
declare module '*?raw' {
  const content: string;
  export default content;
}
declare module '*?url' {
  const url: string;
  export default url;
}

declare module 'foliate-js/view.js';
declare module 'foliate-js/epub.js';
