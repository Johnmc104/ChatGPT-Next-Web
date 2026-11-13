declare module "*.jpg";
declare module "*.png";
declare module "*.woff2";
declare module "*.woff";
declare module "*.ttf";
declare module "*.css";
declare module "*.scss" {
  const content: Record<string, string>;
  export default content;
}

declare module "*.svg";

declare module "js-tiktoken/ranks/o200k_base" {
  import type { TiktokenBPE } from "js-tiktoken/lite";
  const ranks: TiktokenBPE;
  export default ranks;
}
