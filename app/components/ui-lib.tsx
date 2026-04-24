/* eslint-disable @next/next/no-img-element */
import styles from "./ui-lib.module.scss";
import LoadingIcon from "../icons/three-dots.svg";
import EyeIcon from "../icons/eye.svg";
import EyeOffIcon from "../icons/eye-off.svg";
import DownIcon from "../icons/down.svg";
import MaxIcon from "../icons/max.svg";
import MinIcon from "../icons/min.svg";

import React, {
  HTMLProps,
  MouseEvent,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { IconButton } from "./button";
import { Avatar } from "./emoji";
import clsx from "clsx";

// Re-export modal and toast from sub-modules (keeps all consumer imports stable)
export {
  Modal,
  showModal,
  showConfirm,
  showPrompt,
  showImageModal,
} from "./ui-lib-modal";
export type { ModalProps } from "./ui-lib-modal";
export { Toast, showToast } from "./ui-lib-toast";
export type { ToastProps } from "./ui-lib-toast";

export function Popover(props: {
  children: JSX.Element;
  content: JSX.Element;
  open?: boolean;
  onClose?: () => void;
}) {
  return (
    <div className={styles.popover}>
      {props.children}
      {props.open && (
        <div className={styles["popover-mask"]} onClick={props.onClose}></div>
      )}
      {props.open && (
        <div className={styles["popover-content"]}>{props.content}</div>
      )}
    </div>
  );
}

export function Card(props: { children: JSX.Element[]; className?: string }) {
  return (
    <div className={clsx(styles.card, props.className)}>{props.children}</div>
  );
}

export function ListItem(props: {
  title?: string;
  subTitle?: string | JSX.Element;
  children?: JSX.Element | JSX.Element[];
  icon?: JSX.Element;
  className?: string;
  onClick?: (e: MouseEvent) => void;
  vertical?: boolean;
}) {
  return (
    <div
      className={clsx(
        styles["list-item"],
        {
          [styles["vertical"]]: props.vertical,
        },
        props.className,
      )}
      onClick={props.onClick}
    >
      <div className={styles["list-header"]}>
        {props.icon && <div className={styles["list-icon"]}>{props.icon}</div>}
        <div className={styles["list-item-title"]}>
          <div>{props.title}</div>
          {props.subTitle && (
            <div className={styles["list-item-sub-title"]}>
              {props.subTitle}
            </div>
          )}
        </div>
      </div>
      {props.children}
    </div>
  );
}

export function List(props: { children: React.ReactNode; id?: string }) {
  return (
    <div className={styles.list} id={props.id}>
      {props.children}
    </div>
  );
}

export function Loading() {
  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <LoadingIcon />
    </div>
  );
}

export type InputProps = React.HTMLProps<HTMLTextAreaElement> & {
  autoHeight?: boolean;
  rows?: number;
};

export function Input(props: InputProps) {
  return (
    <textarea
      {...props}
      className={clsx(styles["input"], props.className)}
    ></textarea>
  );
}

export function PasswordInput(
  props: HTMLProps<HTMLInputElement> & { aria?: string },
) {
  const [visible, setVisible] = useState(false);
  function changeVisibility() {
    setVisible(!visible);
  }

  return (
    <div className={"password-input-container"}>
      <IconButton
        aria={props.aria}
        icon={visible ? <EyeIcon /> : <EyeOffIcon />}
        onClick={changeVisibility}
        className={"password-eye"}
      />
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={"password-input"}
      />
    </div>
  );
}

export function Select(
  props: React.DetailedHTMLProps<
    React.SelectHTMLAttributes<HTMLSelectElement> & {
      align?: "left" | "center";
    },
    HTMLSelectElement
  >,
) {
  const { className, children, align, ...otherProps } = props;
  return (
    <div
      className={clsx(
        styles["select-with-icon"],
        {
          [styles["left-align-option"]]: align === "left",
        },
        className,
      )}
    >
      <select className={styles["select-with-icon-select"]} {...otherProps}>
        {children}
      </select>
      <DownIcon className={styles["select-with-icon-icon"]} />
    </div>
  );
}

export function Selector<T>(props: {
  items: Array<{
    title: string;
    subTitle?: string;
    value: T;
    disable?: boolean;
    group?: string; // Optional group name for categorization
  }>;
  defaultSelectedValue?: T[] | T;
  onSelection?: (selection: T[]) => void;
  onClose?: () => void;
  multiple?: boolean;
}) {
  const [selectedValues, setSelectedValues] = useState<T[]>(
    Array.isArray(props.defaultSelectedValue)
      ? props.defaultSelectedValue
      : props.defaultSelectedValue !== undefined
      ? [props.defaultSelectedValue]
      : [],
  );

  const handleSelection = (e: MouseEvent, value: T) => {
    if (props.multiple) {
      e.stopPropagation();
      const newSelectedValues = selectedValues.includes(value)
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value];
      setSelectedValues(newSelectedValues);
      props.onSelection?.(newSelectedValues);
    } else {
      setSelectedValues([value]);
      props.onSelection?.([value]);
      props.onClose?.();
    }
  };

  // Group items by their group property
  const groupedItems = props.items.reduce(
    (acc, item) => {
      const group = item.group || "";
      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push(item);
      return acc;
    },
    {} as Record<string, typeof props.items>,
  );

  const groups = Object.keys(groupedItems);
  const hasGroups =
    groups.length > 1 || (groups.length === 1 && groups[0] !== "");

  return (
    <div className={styles["selector"]} onClick={() => props.onClose?.()}>
      <div className={styles["selector-content"]}>
        <List>
          {hasGroups
            ? // Render with group headers
              groups.map((group) => (
                <div key={group}>
                  {group && (
                    <div className={styles["selector-group-header"]}>
                      {group}
                    </div>
                  )}
                  {groupedItems[group].map((item, i) => {
                    const selected = selectedValues.includes(item.value);
                    return (
                      <ListItem
                        className={clsx(styles["selector-item"], {
                          [styles["selector-item-disabled"]]: item.disable,
                        })}
                        key={`${group}-${i}`}
                        title={item.title}
                        subTitle={item.subTitle}
                        icon={<Avatar model={item.value as string} />}
                        onClick={(e) => {
                          if (item.disable) {
                            e.stopPropagation();
                          } else {
                            handleSelection(e, item.value);
                          }
                        }}
                      >
                        {selected ? (
                          <div
                            style={{
                              height: 10,
                              width: 10,
                              backgroundColor: "var(--primary)",
                              borderRadius: 10,
                            }}
                          ></div>
                        ) : (
                          <></>
                        )}
                      </ListItem>
                    );
                  })}
                </div>
              ))
            : // Render without groups (original behavior)
              props.items.map((item, i) => {
                const selected = selectedValues.includes(item.value);
                return (
                  <ListItem
                    className={clsx(styles["selector-item"], {
                      [styles["selector-item-disabled"]]: item.disable,
                    })}
                    key={i}
                    title={item.title}
                    subTitle={item.subTitle}
                    icon={<Avatar model={item.value as string} />}
                    onClick={(e) => {
                      if (item.disable) {
                        e.stopPropagation();
                      } else {
                        handleSelection(e, item.value);
                      }
                    }}
                  >
                    {selected ? (
                      <div
                        style={{
                          height: 10,
                          width: 10,
                          backgroundColor: "var(--primary)",
                          borderRadius: 10,
                        }}
                      ></div>
                    ) : (
                      <></>
                    )}
                  </ListItem>
                );
              })}
        </List>
      </div>
    </div>
  );
}
export function FullScreen(props: any) {
  const { children, right = 10, top = 10, ...rest } = props;
  const ref = useRef<HTMLDivElement>();
  const [fullScreen, setFullScreen] = useState(false);
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      ref.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);
  useEffect(() => {
    const handleScreenChange = (e: any) => {
      if (e.target === ref.current) {
        setFullScreen(!!document.fullscreenElement);
      }
    };
    document.addEventListener("fullscreenchange", handleScreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleScreenChange);
    };
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }} {...rest}>
      <div style={{ position: "absolute", right, top }}>
        <IconButton
          icon={fullScreen ? <MinIcon /> : <MaxIcon />}
          onClick={toggleFullscreen}
          bordered
        />
      </div>
      {children}
    </div>
  );
}
