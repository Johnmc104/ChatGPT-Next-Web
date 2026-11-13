/**
 * React 19 types only provide `React.JSX`; the global `JSX` namespace is gone.
 * react-markdown v8 (and older app code) still reference the global one.
 * It used to come, by accident, from a nested @types/react@18 pulled in by
 * @types/react-katex. Declare it explicitly as an alias of `React.JSX`.
 */
import type * as React from "react";

declare global {
  namespace JSX {
    type ElementType = React.JSX.ElementType;
    interface Element extends React.JSX.Element {}
    interface ElementClass extends React.JSX.ElementClass {}
    interface ElementAttributesProperty
      extends React.JSX.ElementAttributesProperty {}
    interface ElementChildrenAttribute
      extends React.JSX.ElementChildrenAttribute {}
    type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<
      C,
      P
    >;
    interface IntrinsicAttributes extends React.JSX.IntrinsicAttributes {}
    interface IntrinsicClassAttributes<T>
      extends React.JSX.IntrinsicClassAttributes<T> {}
    interface IntrinsicElements extends React.JSX.IntrinsicElements {}
  }
}

export {};
