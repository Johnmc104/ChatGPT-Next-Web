import { useCallback, useEffect, useRef, useState } from "react";
import { ServiceProvider } from "../constant";
import Locale from "../locales";
import { validateEndpointUrl } from "../domain/endpoint/config";
import {
  testEndpointConnection,
  type EndpointTestResult,
} from "../services/endpoint/test";
import { IconButton } from "./button";
import clsx from "clsx";
import styles from "./form-controls.module.scss";

export function EndpointInput(props: {
  value: string;
  placeholder: string;
  ariaLabel: string;
  apiKey: string;
  provider: ServiceProvider;
  apiVersion?: string;
  defaultValue: string;
  onChange: (value: string) => void;
}) {
  const labels = Locale.Settings.EndpointDiagnostics;
  const [draft, setDraft] = useState(props.value);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EndpointTestResult>();
  const [testing, setTesting] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  const invalidate = useCallback(() => {
    request.current?.abort();
    request.current = undefined;
    setTesting(false);
    setResult(undefined);
  }, []);
  useEffect(() => {
    setDraft(props.value);
    setError("");
  }, [props.value]);
  useEffect(() => {
    invalidate();
    return () => {
      request.current?.abort();
      request.current = undefined;
    };
  }, [props.value, props.apiKey, props.provider, props.apiVersion, invalidate]);

  const validate = () => {
    const validation = validateEndpointUrl(draft);
    setError(validation.valid ? "" : labels.Validation[validation.code!]);
    return validation;
  };
  const save = () => {
    const validation = validate();
    if (validation.valid) props.onChange(validation.normalized!);
  };
  const test = async () => {
    const validation = validate();
    if (!validation.valid) return;
    invalidate();
    const controller = new AbortController();
    request.current = controller;
    setTesting(true);
    const response = await testEndpointConnection(
      validation.normalized!,
      props.apiKey,
      {
        provider: props.provider,
        apiVersion: props.apiVersion,
        signal: controller.signal,
      },
    );
    if (request.current !== controller) return;
    setResult(response);
    setTesting(false);
    request.current = undefined;
  };
  return (
    <div className={styles.field}>
      <input
        aria-label={props.ariaLabel}
        aria-invalid={!!error}
        type="url"
        value={draft}
        placeholder={props.placeholder}
        onChange={(event) => {
          invalidate();
          setError("");
          setDraft(event.target.value);
        }}
        onBlur={save}
      />
      {error && (
        <div
          role="alert"
          className={clsx(styles.message, styles["message-error"])}
        >
          {error}
        </div>
      )}
      <div className={styles.actions}>
        <IconButton
          className={styles["small-button"]}
          bordered
          type="primary"
          text={testing ? labels.Testing : labels.Test}
          onClick={() => void test()}
          disabled={testing}
        />
        {testing && (
          <IconButton
            className={styles["small-button"]}
            bordered
            text={Locale.UI.Cancel}
            onClick={() => request.current?.abort()}
          />
        )}
        <IconButton
          className={styles["small-button"]}
          bordered
          text={labels.Reset}
          onClick={() => {
            invalidate();
            setError("");
            setDraft(props.defaultValue);
            props.onChange(props.defaultValue);
          }}
        />
      </div>
      {result && (
        <div
          role="status"
          className={clsx(
            styles.message,
            result.ok ? styles["message-success"] : styles["message-error"],
          )}
        >
          {labels.Codes[result.code]}{" "}
          {result.status ? `HTTP ${result.status} · ` : ""}
          {result.latencyMs} ms
        </div>
      )}
      <div className={styles.hint}>{labels.Hint}</div>
    </div>
  );
}
