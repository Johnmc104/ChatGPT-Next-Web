"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { createRoot } from "react-dom/client";

import DownloadIcon from "../icons/download.svg";
import CloseIcon from "../icons/close.svg";
import MaxIcon from "../icons/max.svg";
import MinIcon from "../icons/min.svg";

import styles from "./image-preview.module.scss";

// ─── Lightbox (fullscreen viewer) ────────────────────────────────

interface LightboxProps {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

function Lightbox({ images, initialIndex = 0, onClose }: LightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  const src = images[index];

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && images.length > 1) {
        setIndex((i) => (i > 0 ? i - 1 : images.length - 1));
        resetView();
      } else if (e.key === "ArrowRight" && images.length > 1) {
        setIndex((i) => (i < images.length - 1 ? i + 1 : 0));
        resetView();
      } else if (e.key === "+" || e.key === "=")
        setScale((s) => Math.min(s * 1.25, 10));
      else if (e.key === "-") setScale((s) => Math.max(s / 1.25, 0.1));
      else if (e.key === "0") resetView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose, resetView]);

  // Mouse wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    setScale((s) => {
      const next = e.deltaY < 0 ? s * 1.15 : s / 1.15;
      return Math.max(0.1, Math.min(next, 10));
    });
  }, []);

  // Pan (drag)
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (scale <= 1) return;
      setDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        tx: translate.x,
        ty: translate.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [scale, translate],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      setTranslate({
        x: dragStart.current.tx + e.clientX - dragStart.current.x,
        y: dragStart.current.ty + e.clientY - dragStart.current.y,
      });
    },
    [dragging],
  );

  const onPointerUp = useCallback(() => setDragging(false), []);

  // Double-click to toggle zoom
  const onDoubleClick = useCallback(() => {
    if (scale > 1) {
      resetView();
    } else {
      setScale(2.5);
    }
  }, [scale, resetView]);

  // Natural image size
  const onLoad = useCallback(() => {
    if (imgRef.current) {
      setNaturalSize({
        w: imgRef.current.naturalWidth,
        h: imgRef.current.naturalHeight,
      });
    }
  }, []);

  // Download
  const onDownload = useCallback(() => {
    const a = document.createElement("a");
    a.href = src;
    a.download = `image-${Date.now()}.png`;
    // For data URIs and same-origin blobs, direct download works.
    // For cross-origin URLs, fetch as blob first.
    if (src.startsWith("data:") || src.startsWith("blob:")) {
      a.click();
    } else {
      fetch(src)
        .then((r) => r.blob())
        .then((blob) => {
          a.href = URL.createObjectURL(blob);
          a.click();
          URL.revokeObjectURL(a.href);
        })
        .catch(() => {
          // Fallback: open in new tab
          window.open(src, "_blank");
        });
    }
  }, [src]);

  const sizeLabel = naturalSize.w ? `${naturalSize.w} × ${naturalSize.h}` : "";
  const scaleLabel = `${Math.round(scale * 100)}%`;

  return (
    <div className={styles["lightbox-mask"]} onClick={onClose}>
      {/* Toolbar */}
      <div
        className={styles["lightbox-toolbar"]}
        onClick={(e) => e.stopPropagation()}
      >
        {sizeLabel && (
          <span className={styles["lightbox-info"]}>{sizeLabel}</span>
        )}
        <span className={styles["lightbox-info"]}>{scaleLabel}</span>

        {images.length > 1 && (
          <span className={styles["lightbox-info"]}>
            {index + 1} / {images.length}
          </span>
        )}

        <button
          className={styles["lightbox-btn"]}
          onClick={() => setScale((s) => Math.min(s * 1.25, 10))}
          title="Zoom in (+)"
        >
          +
        </button>
        <button
          className={styles["lightbox-btn"]}
          onClick={() => setScale((s) => Math.max(s / 1.25, 0.1))}
          title="Zoom out (-)"
        >
          −
        </button>
        <button
          className={styles["lightbox-btn"]}
          onClick={resetView}
          title="Reset (0)"
        >
          1:1
        </button>
        <button
          className={styles["lightbox-btn"]}
          onClick={onDownload}
          title="Download"
        >
          <DownloadIcon />
        </button>
        <button
          className={styles["lightbox-btn"]}
          onClick={onClose}
          title="Close (Esc)"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Image */}
      <div
        className={styles["lightbox-stage"]}
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        style={{
          cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          className={styles["lightbox-img"]}
          src={src}
          alt=""
          onLoad={onLoad}
          draggable={false}
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          }}
        />
      </div>

      {/* Prev / Next arrows */}
      {images.length > 1 && (
        <>
          <button
            className={`${styles["lightbox-arrow"]} ${styles["lightbox-arrow-left"]}`}
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i > 0 ? i - 1 : images.length - 1));
              resetView();
            }}
          >
            ‹
          </button>
          <button
            className={`${styles["lightbox-arrow"]} ${styles["lightbox-arrow-right"]}`}
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i < images.length - 1 ? i + 1 : 0));
              resetView();
            }}
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

/** Open the lightbox imperatively. */
export function openImageLightbox(images: string[], initialIndex = 0) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const root = createRoot(div);

  const close = () => {
    root.unmount();
    div.remove();
  };

  root.render(
    <Lightbox images={images} initialIndex={initialIndex} onClose={close} />,
  );
}

// ─── ChatImage — inline image with hover overlay ─────────────────

interface ChatImageProps {
  src: string;
  /** All images in this message (for gallery navigation). */
  allImages: string[];
  /** Index of this image within allImages. */
  index: number;
  multi?: boolean;
  className?: string;
}

export function ChatImage({
  src,
  allImages,
  index,
  multi,
  className,
}: ChatImageProps) {
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  const onLoad = useCallback(() => {
    if (imgRef.current) {
      setNaturalSize({
        w: imgRef.current.naturalWidth,
        h: imgRef.current.naturalHeight,
      });
    }
  }, []);

  const onDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const a = document.createElement("a");
      a.href = src;
      a.download = `image-${Date.now()}.png`;
      if (src.startsWith("data:") || src.startsWith("blob:")) {
        a.click();
      } else {
        fetch(src)
          .then((r) => r.blob())
          .then((blob) => {
            a.href = URL.createObjectURL(blob);
            a.click();
            URL.revokeObjectURL(a.href);
          })
          .catch(() => window.open(src, "_blank"));
      }
    },
    [src],
  );

  const sizeLabel = naturalSize.w ? `${naturalSize.w}×${naturalSize.h}` : "";

  return (
    <div
      className={`${styles["chat-image-wrap"]} ${className ?? ""}`}
      onClick={() => openImageLightbox(allImages, index)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        className={styles["chat-image-img"]}
        src={src}
        alt=""
        loading="lazy"
        onLoad={onLoad}
        draggable={false}
      />
      {/* Hover overlay */}
      <div className={styles["chat-image-overlay"]}>
        {sizeLabel && (
          <span className={styles["chat-image-badge"]}>{sizeLabel}</span>
        )}
        <button
          className={styles["chat-image-download"]}
          onClick={onDownload}
          title="Download"
        >
          <DownloadIcon />
        </button>
      </div>
    </div>
  );
}
