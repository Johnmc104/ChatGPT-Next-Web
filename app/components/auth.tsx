import styles from "./auth.module.scss";
import { IconButton } from "./button";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Path } from "../constant";
import { useAccessStore } from "../store";
import Locale from "../locales";
import BotIcon from "../icons/bot.svg";
import { getClientConfig } from "../config/client";
import { PasswordInput } from "./ui-lib";
import LeftIcon from "@/app/icons/left.svg";
import clsx from "clsx";
import { resolveAuthorization } from "@/app/domain/auth/authorization";

export function AuthPage() {
  const navigate = useNavigate();
  const accessStore = useAccessStore();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const loadingConfig =
    accessStore.configStatus === "idle" ||
    accessStore.configStatus === "loading";

  useEffect(() => {
    accessStore.fetchConfig().catch(() => {
      setError(Locale.Auth.ConfigError);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goChat = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError("");
    try {
      await accessStore.fetchConfig();
      const state = useAccessStore.getState();
      const decision = resolveAuthorization({
        hasUserKey: state.isValidOpenAI(),
        hasServerKey: state.hasServerApiKey,
        needCode: state.needCode,
        hasAccessCode: !!state.accessCode.trim(),
      });
      if (decision.status === "missing-access-code") {
        setError(Locale.Auth.MissingCode);
      } else if (decision.status === "missing-server-key") {
        setError(
          state.hideUserApiKey
            ? Locale.Auth.ContactAdmin
            : Locale.Auth.MissingServerKey,
        );
      } else if (await state.verifyAuthorization()) {
        if (mounted.current) navigate(Path.Chat);
      } else {
        const code = useAccessStore.getState().authorizationError;
        setError(code ? Locale.Auth.Validation[code] : Locale.Auth.ConfigError);
      }
    } catch {
      setError(Locale.Auth.ConfigError);
    } finally {
      inFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

  useEffect(() => {
    if (getClientConfig()?.isApp) {
      navigate(Path.Settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles["auth-page"]}>
      <div className={styles["auth-header"]}>
        <IconButton
          icon={<LeftIcon />}
          text={Locale.Auth.Return}
          onClick={() => navigate(Path.Home)}
        ></IconButton>
      </div>
      <div className={clsx("no-dark", styles["auth-logo"])}>
        <BotIcon />
      </div>

      <div className={styles["auth-title"]}>{Locale.Auth.Title}</div>
      <div className={styles["auth-tips"]}>{Locale.Auth.Tips}</div>

      {accessStore.needCode && (
        <PasswordInput
          style={{ marginTop: "3vh", marginBottom: "3vh" }}
          aria={Locale.Settings.ShowPassword}
          aria-label={Locale.Auth.Input}
          value={accessStore.accessCode}
          type="text"
          placeholder={Locale.Auth.Input}
          onChange={(e) => {
            setError("");
            accessStore.update((access) => {
              access.accessCode = e.currentTarget.value;
              access.authorizationStatus = "idle";
              access.authorizationError = "";
            });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void goChat();
          }}
          disabled={loadingConfig || submitting}
        />
      )}

      {!accessStore.hideUserApiKey ? (
        <>
          <div className={styles["auth-tips"]}>{Locale.Auth.SubTips}</div>
          <PasswordInput
            style={{ marginTop: "3vh", marginBottom: "3vh" }}
            aria={Locale.Settings.ShowPassword}
            aria-label={Locale.Settings.Access.OpenAI.ApiKey.Placeholder}
            value={accessStore.openaiApiKey}
            type="text"
            placeholder={Locale.Settings.Access.OpenAI.ApiKey.Placeholder}
            onChange={(e) => {
              setError("");
              accessStore.update((access) => {
                access.openaiApiKey = e.currentTarget.value;
                access.authorizationStatus = "idle";
                access.authorizationError = "";
              });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void goChat();
            }}
            disabled={loadingConfig || submitting}
          />
        </>
      ) : null}

      {loadingConfig && (
        <div className={styles["auth-status"]}>{Locale.Auth.Loading}</div>
      )}

      {submitting && <div role="status">{Locale.Auth.Checking}</div>}

      {error && (
        <div className={styles["auth-error"]} role="alert">
          {error}
        </div>
      )}

      <div className={styles["auth-actions"]}>
        <IconButton
          text={
            accessStore.configStatus === "error"
              ? Locale.Auth.Retry
              : Locale.Auth.Confirm
          }
          type="primary"
          onClick={goChat}
          disabled={loadingConfig || submitting}
        />
        <IconButton
          text={Locale.Auth.Configure}
          onClick={() => navigate(Path.Settings)}
          disabled={submitting}
        />
      </div>
      <div className={styles["auth-tips"]}>{Locale.Auth.ConnectionHint}</div>
    </div>
  );
}
